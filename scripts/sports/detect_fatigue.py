#!/usr/bin/env python3
"""
Fase 5: Detección de fatiga - análisis de tendencias de velocidad y aceleración.
Entrada: JSON de tracking (de detect_players.py)
Salida: JSON con métricas de fatiga por jugador.

Uso:
  python detect_fatigue.py <tracking.json> [--output fatigue.json]
"""

import sys
import json
import argparse
import math
from pathlib import Path

import numpy as np


def load_tracking(tracking_path):
    """Load tracking data from JSON file."""
    with open(tracking_path) as f:
        return json.load(f)


def calculate_player_timeseries(frames, player_id):
    """Extract velocity and acceleration timeseries for a player."""
    positions = []
    timestamps = []
    speeds = []

    for fd in frames:
        for p in fd["players"]:
            if p["id"] == player_id:
                positions.append(p["center"])
                timestamps.append(fd["time_s"])
                speeds.append(p.get("speed_mps", 0))
                break

    return {
        "positions": positions,
        "timestamps": timestamps,
        "speeds": speeds,
    }


def calculate_acceleration(speeds, timestamps):
    """Calculate acceleration from speed timeseries."""
    accelerations = []
    for i in range(1, len(speeds)):
        dt = timestamps[i] - timestamps[i - 1]
        if dt > 0:
            accel = (speeds[i] - speeds[i - 1]) / dt
            accelerations.append(accel)
        else:
            accelerations.append(0)
    return accelerations


def detect_fatigue_patterns(speeds, timestamps, window_pct=0.2):
    """
    Detect fatigue by comparing speed in first vs last portion of session.
    Returns fatigue indicators.
    """
    if len(speeds) < 10:
        return {"fatigue_detected": False, "reason": "insufficient_data"}

    n = len(speeds)
    window = max(5, int(n * window_pct))

    # First window
    first_speeds = speeds[:window]
    last_speeds = speeds[-window:]

    first_mean = np.mean(first_speeds)
    last_mean = np.mean(last_speeds)
    first_max = np.max(first_speeds)
    last_max = np.max(last_speeds)

    # Speed decline
    speed_decline_pct = (first_mean - last_mean) / first_mean * 100 if first_mean > 0 else 0

    # Max speed decline
    max_speed_decline_pct = (first_max - last_max) / first_max * 100 if first_max > 0 else 0

    # Recovery time (time between sprints)
    sprint_threshold = np.mean(speeds) + np.std(speeds)
    sprint_times = [timestamps[i] for i, s in enumerate(speeds) if s > sprint_threshold]

    recovery_times = []
    for i in range(1, len(sprint_times)):
        gap = sprint_times[i] - sprint_times[i - 1]
        if gap > 1.0:  # At least 1 second between sprints
            recovery_times.append(gap)

    avg_recovery = np.mean(recovery_times) if recovery_times else 0

    # Movement variability (fatigue causes more erratic movement)
    if len(speeds) > 20:
        first_std = np.std(first_speeds)
        last_std = np.std(last_speeds)
        variability_change = (last_std - first_std) / first_std if first_std > 0 else 0
    else:
        variability_change = 0

    # Overall fatigue score (0-100, higher = more fatigue)
    fatigue_score = 0

    if speed_decline_pct > 10:
        fatigue_score += min(30, speed_decline_pct)
    if max_speed_decline_pct > 15:
        fatigue_score += min(25, max_speed_decline_pct * 0.5)
    if avg_recovery > 15:
        fatigue_score += min(25, (avg_recovery - 10) * 2)
    if variability_change > 0.2:
        fatigue_score += min(20, variability_change * 30)

    fatigue_score = min(100, fatigue_score)

    fatigue_detected = fatigue_score > 30

    return {
        "fatigue_detected": fatigue_detected,
        "fatigue_score": round(fatigue_score, 1),
        "speed_decline_pct": round(speed_decline_pct, 1),
        "max_speed_decline_pct": round(max_speed_decline_pct, 1),
        "avg_recovery_time_s": round(avg_recovery, 2),
        "variability_change": round(variability_change, 3),
        "first_half_avg_speed": round(first_mean, 2),
        "second_half_avg_speed": round(last_mean, 2),
    }


def detect_injury_risk(speeds, accelerations, timestamps):
    """
    Detect potential injury risk from movement patterns.
    - Sudden deceleration (possible injury moment)
    - Asymmetric movement patterns
    - Unusual acceleration spikes
    """
    risks = []

    # Sudden deceleration (possible injury)
    for i in range(1, len(speeds)):
        if speeds[i - 1] > 3.0 and speeds[i] < 1.0:
            dt = timestamps[i] - timestamps[i - 1]
            if dt < 0.5:  # Very sudden stop
                risks.append({
                    "type": "sudden_deceleration",
                    "time_s": timestamps[i],
                    "severity": "high" if speeds[i - 1] > 5 else "medium",
                    "from_speed": round(speeds[i - 1], 2),
                    "to_speed": round(speeds[i], 2),
                })

    # Extreme acceleration spikes
    if accelerations:
        accel_threshold = np.mean(np.abs(accelerations)) + 3 * np.std(np.abs(accelerations))
        for i, accel in enumerate(accelerations):
            if abs(accel) > accel_threshold:
                risks.append({
                    "type": "extreme_acceleration",
                    "time_s": timestamps[i + 1] if i + 1 < len(timestamps) else 0,
                    "severity": "medium",
                    "acceleration": round(accel, 2),
                })

    return risks


def analyze_session(phases, total_duration_s):
    """
    Analyze the session structure:
    - Warm-up, main, cool-down phases
    - Work/rest ratios
    """
    if total_duration_s <= 0:
        return {"phases": [], "work_rest_ratio": 0}

    # Simple phase detection based on intensity
    speeds_over_time = []
    for phase in phases:
        if phase["speeds"]:
            avg = np.mean(phase["speeds"])
        else:
            avg = 0
        speeds_over_time.append(avg)

    # Work/rest ratio
    active_threshold = np.mean(speeds_over_time) * 0.5 if speeds_over_time else 0
    work_time = sum(
        p["duration_s"] for p, s in zip(phases, speeds_over_time) if s > active_threshold
    )
    rest_time = total_duration_s - work_time

    return {
        "total_duration_s": round(total_duration_s, 1),
        "work_time_s": round(work_time, 1),
        "rest_time_s": round(rest_time, 1),
        "work_rest_ratio": round(work_time / rest_time, 2) if rest_time > 0 else float("inf"),
    }


def run_fatigue_detection(tracking_data):
    """Main fatigue detection pipeline."""
    frames = tracking_data.get("frames", [])
    video = tracking_data.get("video", {})
    total_duration = video.get("duration_s", 0)

    print(f"Analyzing {len(frames)} frames...")

    # Get all unique player IDs
    player_ids = set()
    for fd in frames:
        for p in fd["players"]:
            player_ids.add(p["id"])

    print(f"Players found: {len(player_ids)}")

    # Analyze each player
    player_fatigue = {}
    for pid in sorted(player_ids):
        timeseries = calculate_player_timeseries(frames, pid)

        if len(timeseries["speeds"]) < 5:
            continue

        # Fatigue patterns
        fatigue = detect_fatigue_patterns(
            timeseries["speeds"], timeseries["timestamps"]
        )

        # Injury risk
        accelerations = calculate_acceleration(
            timeseries["speeds"], timeseries["timestamps"]
        )
        injury_risks = detect_injury_risk(
            timeseries["speeds"], accelerations, timeseries["timestamps"]
        )

        # Session analysis
        session = analyze_session(
            [{"speeds": timeseries["speeds"], "duration_s": total_duration}],
            total_duration,
        )

        player_fatigue[pid] = {
            "player_id": pid,
            "fatigue": fatigue,
            "injury_risks": injury_risks,
            "session": session,
            "stats": {
                "total_distance_m": round(
                    sum(
                        p.get("distance_m", 0)
                        for fd in frames
                        for p in fd["players"]
                        if p["id"] == pid
                    ), 2
                ),
                "avg_speed_mps": round(np.mean(timeseries["speeds"]), 2) if timeseries["speeds"] else 0,
                "max_speed_mps": round(max(timeseries["speeds"]), 2) if timeseries["speeds"] else 0,
                "frames_active": len(timeseries["speeds"]),
            },
        }

    # Summary
    fatigued_players = [
        pid for pid, data in player_fatigue.items()
        if data["fatigue"]["fatigue_detected"]
    ]

    all_injury_risks = []
    for pid, data in player_fatigue.items():
        for risk in data["injury_risks"]:
            all_injury_risks.append({**risk, "player_id": pid})

    output = {
        "players": player_fatigue,
        "summary": {
            "total_players": len(player_fatigue),
            "fatigued_players": len(fatigued_players),
            "fatigued_player_ids": fatigued_players,
            "total_injury_risks": len(all_injury_risks),
            "high_severity_risks": len([
                r for r in all_injury_risks if r.get("severity") == "high"
            ]),
        },
        "injury_risks": all_injury_risks,
    }

    print(f"\nFatigue Summary:")
    print(f"  Players analyzed: {len(player_fatigue)}")
    print(f"  Fatigued: {len(fatigued_players)}")
    print(f"  Injury risks: {len(all_injury_risks)}")

    return output


def main():
    parser = argparse.ArgumentParser(description="Detect fatigue from tracking data")
    parser.add_argument("tracking", help="Path to tracking JSON")
    parser.add_argument("--output", "-o", help="Output JSON path")
    args = parser.parse_args()

    tracking_data = load_tracking(args.tracking)
    output = run_fatigue_detection(tracking_data)

    output_path = args.output or "fatigue.json"
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\nSaved to {output_path}")


if __name__ == "__main__":
    main()
