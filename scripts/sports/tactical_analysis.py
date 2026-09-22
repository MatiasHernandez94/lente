#!/usr/bin/env python3
"""
Fase 4: Análisis táctico - formaciones, patrones de juego, mapa de calor del equipo.
Entrada: JSON de tracking (de detect_players.py)
Salida: JSON con métricas tácticas y datos para heatmap.

Uso:
  python tactical_analysis.py <tracking.json> [--output tactical.json]
"""

import sys
import json
import argparse
import math
from pathlib import Path
from collections import defaultdict

import numpy as np


def load_tracking(tracking_path):
    """Load tracking data from JSON file."""
    with open(tracking_path) as f:
        return json.load(f)


def detect_formation(frames, team_id, field_length=105, field_width=68):
    """
    Detect team formation from average player positions.
    Returns formation name and player positions.
    """
    # Collect all player positions for this team
    team_positions = defaultdict(list)

    for fd in frames:
        for p in fd["players"]:
            if p.get("team") == team_id:
                # Convert pixel to normalized field coords (0-1)
                # This is approximate - would be better with homography
                team_positions[p["id"]].append(p["center"])

    if not team_positions:
        return None

    # Calculate average position for each player
    avg_positions = {}
    for pid, positions in team_positions.items():
        avg_x = np.mean([p[0] for p in positions])
        avg_y = np.mean([p[1] for p in positions])
        avg_positions[pid] = (avg_x, avg_y)

    if len(avg_positions) < 4:
        return {"formation": "unknown", "players": len(avg_positions)}

    # Simple formation detection based on position distribution
    xs = [p[0] for p in avg_positions.values()]
    ys = [p[1] for p in avg_positions.values()]

    # Normalize to 0-1 range
    x_range = max(xs) - min(xs) if max(xs) != min(xs) else 1
    y_range = max(ys) - min(ys) if max(ys) != min(ys) else 1

    norm_xs = [(x - min(xs)) / x_range for x in xs]
    norm_ys = [(y - min(ys)) / y_range for y in ys]

    # Count players in thirds (defensive, middle, attacking)
    def third(x): return 0 if x < 0.33 else (1 if x < 0.66 else 2)
    thirds = [third(x) for x in norm_xs]

    def_count = thirds.count(0)
    mid_count = thirds.count(1)
    att_count = thirds.count(2)

    # Common formations
    formations = {
        (4, 3, 3): "4-3-3",
        (4, 4, 2): "4-4-2",
        (3, 5, 2): "3-5-2",
        (3, 4, 3): "3-4-3",
        (5, 3, 2): "5-3-2",
        (4, 2, 4): "4-2-4",
        (2, 5, 3): "2-5-3",
    }

    # Find closest match
    best_match = None
    best_dist = float("inf")
    for pattern, name in formations.items():
        dist = sum(abs(a - b) for a, b in zip(
            sorted([def_count, mid_count, att_count]),
            sorted(pattern)
        ))
        if dist < best_dist:
            best_dist = dist
            best_match = name

    return {
        "formation": best_match or f"{def_count}-{mid_count}-{att_count}",
        "player_count": len(avg_positions),
        "avg_positions": {
            str(pid): {"x": round(pos[0], 1), "y": round(pos[1], 1)}
            for pid, pos in avg_positions.items()
        },
        "distribution": {
            "defensive": def_count,
            "middle": mid_count,
            "attacking": att_count,
        },
    }


def generate_team_heatmap(frames, team_id, resolution=50):
    """
    Generate heatmap data for a team.
    Returns 2D array of player density.
    """
    heatmap = np.zeros((resolution, resolution))

    for fd in frames:
        for p in fd["players"]:
            if p.get("team") == team_id:
                # Normalize to grid
                x = int(p["center"][0] / 1920 * (resolution - 1))  # assume 1920 width
                y = int(p["center"][1] / 1080 * (resolution - 1))  # assume 1080 height
                x = max(0, min(resolution - 1, x))
                y = max(0, min(resolution - 1, y))

                # Add gaussian blob
                for dx in range(-3, 4):
                    for dy in range(-3, 4):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < resolution and 0 <= ny < resolution:
                            dist = math.sqrt(dx * dx + dy * dy)
                            weight = math.exp(-dist * dist / 8)
                            heatmap[ny][nx] += weight

    # Normalize
    max_val = heatmap.max()
    if max_val > 0:
        heatmap /= max_val

    return heatmap.tolist()


def analyze_possession(frames):
    """
    Analyze ball possession based on which team is closer to the ball.
    Returns possession percentages.
    """
    team_ball_time = defaultdict(int)
    total_frames_with_ball = 0

    for fd in frames:
        ball = fd.get("ball")
        if ball is None:
            continue

        total_frames_with_ball += 1
        closest_team = None
        closest_dist = float("inf")

        for p in fd["players"]:
            dist = math.sqrt(
                (p["center"][0] - ball["center"][0]) ** 2
                + (p["center"][1] - ball["center"][1]) ** 2
            )
            team = p.get("team", 0)
            if dist < closest_dist:
                closest_dist = dist
                closest_team = team

        if closest_team is not None:
            team_ball_time[closest_team] += 1

    if total_frames_with_ball == 0:
        return {"team_0": 50, "team_1": 50}

    return {
        f"team_{t}": round(count / total_frames_with_ball * 100, 1)
        for t, count in team_ball_time.items()
    }


def analyze_pressing(frames, team_id, zone_threshold=0.3):
    """
    Analyze pressing intensity: how far forward does the team push?
    """
    forward_positions = []
    defensive_positions = []

    for fd in frames:
        for p in fd["players"]:
            if p.get("team") == team_id:
                # x position (0=own goal, 1=opponent goal)
                x_norm = p["center"][0] / 1920
                if x_norm > 0.5:
                    forward_positions.append(x_norm)
                else:
                    defensive_positions.append(x_norm)

    if not forward_positions:
        return {"intensity": "low", "avg_forward_x": 0.5}

    avg_forward = np.mean(forward_positions)
    forward_ratio = len(forward_positions) / (
        len(forward_positions) + len(defensive_positions)
    )

    intensity = "low"
    if forward_ratio > 0.5 and avg_forward > 0.6:
        intensity = "high"
    elif forward_ratio > 0.4:
        intensity = "medium"

    return {
        "intensity": intensity,
        "avg_forward_x": round(avg_forward, 3),
        "forward_ratio": round(forward_ratio, 3),
    }


def analyze_transitions(frames, min_gap_frames=10):
    """
    Detect tactical transitions: possession changes, counterattacks.
    """
    transitions = []
    prev_possession = None

    for fd in frames:
        ball = fd.get("ball")
        if ball is None:
            continue

        # Find team with ball
        closest_team = None
        closest_dist = float("inf")
        for p in fd["players"]:
            dist = math.sqrt(
                (p["center"][0] - ball["center"][0]) ** 2
                + (p["center"][1] - ball["center"][1]) ** 2
            )
            if dist < closest_dist:
                closest_dist = dist
                closest_team = p.get("team", 0)

        if closest_team is not None and closest_team != prev_possession:
            if prev_possession is not None:
                # Check if enough time since last transition
                if transitions and abs(fd["time_s"] - transitions[-1]["time_s"]) < 2.0:
                    continue
                transitions.append({
                    "time_s": fd["time_s"],
                    "from_team": prev_possession,
                    "to_team": closest_team,
                    "type": "possession_change",
                })
            prev_possession = closest_team

    return transitions


def run_tactical_analysis(tracking_data):
    """Main tactical analysis pipeline."""
    frames = tracking_data.get("frames", [])
    print(f"Analyzing {len(frames)} frames...")

    # Detect formations for each team
    formations = {}
    for team_id in [0, 1]:
        formation = detect_formation(frames, team_id)
        if formation:
            formations[f"team_{team_id}"] = formation

    # Generate heatmaps
    heatmaps = {}
    for team_id in [0, 1]:
        heatmaps[f"team_{team_id}"] = generate_team_heatmap(frames, team_id)

    # Possession
    possession = analyze_possession(frames)

    # Pressing analysis
    pressing = {}
    for team_id in [0, 1]:
        pressing[f"team_{team_id}"] = analyze_pressing(frames, team_id)

    # Transitions
    transitions = analyze_transitions(frames)

    # Output
    output = {
        "formations": formations,
        "possession": possession,
        "pressing": pressing,
        "transitions": {
            "total": len(transitions),
            "events": transitions[:20],  # Limit output
        },
        "heatmaps": heatmaps,
    }

    print(f"\nFormations detected:")
    for team, f in formations.items():
        print(f"  {team}: {f['formation']}")

    print(f"\nPossession:")
    for team, pct in possession.items():
        print(f"  {team}: {pct}%")

    print(f"\nPressing intensity:")
    for team, p in pressing.items():
        print(f"  {team}: {p['intensity']}")

    print(f"\nTransitions: {len(transitions)}")

    return output


def main():
    parser = argparse.ArgumentParser(description="Tactical analysis from tracking data")
    parser.add_argument("tracking", help="Path to tracking JSON")
    parser.add_argument("--output", "-o", help="Output JSON path")
    args = parser.parse_args()

    tracking_data = load_tracking(args.tracking)
    output = run_tactical_analysis(tracking_data)

    output_path = args.output or "tactical.json"
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\nSaved to {output_path}")


if __name__ == "__main__":
    main()
