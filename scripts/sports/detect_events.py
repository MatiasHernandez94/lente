#!/usr/bin/env python3
"""
Fase 3: Detección de eventos deportivos (goals, faltas, tiros de esquina).
Analiza patrones de movimiento de jugadores para detectar momentos clave.
Entrada: JSON de tracking (de detect_players.py) o video directo
Salida: JSON con eventos y timestamps.

Uso:
  python detect_events.py <tracking.json> [--output events.json]
  python detect_events.py --video <video.mp4> [--output events.json]
"""

import sys
import json
import argparse
import math
from pathlib import Path
from collections import defaultdict

import cv2
import numpy as np


def load_tracking(tracking_path):
    """Load tracking data from JSON file."""
    with open(tracking_path) as f:
        return json.load(f)


def detect_speed_spikes(frames, threshold_factor=2.5):
    """
    Detect sudden acceleration spikes (possible sprints, reactions to events).
    Returns list of (frame_idx, time_s, player_id, speed).
    """
    spikes = []
    all_speeds = []

    for fd in frames:
        for p in fd["players"]:
            all_speeds.append(p.get("speed_mps", 0))

    if not all_speeds:
        return spikes

    mean_speed = np.mean(all_speeds)
    std_speed = np.std(all_speeds)
    threshold = mean_speed + threshold_factor * std_speed

    for fd in frames:
        for p in fd["players"]:
            speed = p.get("speed_mps", 0)
            if speed > threshold:
                spikes.append({
                    "frame": fd["frame"],
                    "time_s": fd["time_s"],
                    "player_id": p["id"],
                    "speed_mps": round(speed, 2),
                    "type": "sprint_spike",
                })

    return spikes


def detect_player_clustering(frames, min_players=6, radius_m=10):
    """
    Detect when many players cluster in a small area (possible set piece, foul, goal celebration).
    """
    events = []

    for fd in frames:
        centers = []
        for p in fd["players"]:
            centers.append(p["center"])

        if len(centers) < min_players:
            continue

        # Check pairwise distances
        for i, c1 in enumerate(centers):
            nearby = 1
            for j, c2 in enumerate(centers):
                if i == j:
                    continue
                dist = math.sqrt(
                    (c1[0] - c2[0]) ** 2 + (c1[1] - c2[1]) ** 2
                )
                # Rough pixel-to-meter estimate (will be refined with homography)
                if dist < 150:  # pixels
                    nearby += 1

            if nearby >= min_players:
                events.append({
                    "frame": fd["frame"],
                    "time_s": fd["time_s"],
                    "type": "player_cluster",
                    "count": nearby,
                    "center": c1,
                })
                break  # One event per frame

    return events


def detect_ball_trajectory(frames):
    """
    Analyze ball movement for key events:
    - Ball stopping suddenly (possible goal, foul)
    - Ball going out of frame (possible goal, throw-in)
    - Ball crossing center (possible transition)
    """
    events = []
    prev_ball = None
    stopped_count = 0

    for fd in frames:
        ball = fd.get("ball")
        if ball is None:
            if prev_ball is not None:
                # Ball disappeared
                events.append({
                    "frame": fd["frame"],
                    "time_s": fd["time_s"],
                    "type": "ball_out_of_frame",
                    "last_position": prev_ball["center"],
                })
            prev_ball = None
            stopped_count = 0
            continue

        if prev_ball is not None:
            dx = ball["center"][0] - prev_ball["center"][0]
            dy = ball["center"][1] - prev_ball["center"][1]
            dist = math.sqrt(dx * dx + dy * dy)

            if dist < 3:  # Ball nearly stationary
                stopped_count += 1
                if stopped_count >= 5:  # Stopped for 5+ frames
                    events.append({
                        "frame": fd["frame"],
                        "time_s": fd["time_s"],
                        "type": "ball_stopped",
                        "duration_frames": stopped_count,
                        "position": ball["center"],
                    })
                    stopped_count = 0
            else:
                stopped_count = 0

        prev_ball = ball

    return events


def detect_team_pressure(frames):
    """
    Detect defensive pressure: when one team has many players near the ball.
    """
    events = []

    for fd in frames:
        ball = fd.get("ball")
        if ball is None:
            continue

        team_counts = defaultdict(int)
        for p in fd["players"]:
            dist = math.sqrt(
                (p["center"][0] - ball["center"][0]) ** 2
                + (p["center"][1] - ball["center"][1]) ** 2
            )
            if dist < 120:  # pixels
                team_counts[p.get("team", 0)] += 1

        for team, count in team_counts.items():
            if count >= 4:
                events.append({
                    "frame": fd["frame"],
                    "time_s": fd["time_s"],
                    "type": "high_pressure",
                    "team": team,
                    "players_near_ball": count,
                })

    return events


def classify_events(events, frames):
    """
    Post-process events to classify into:
    - goal (ball stopped + celebration cluster)
    - foul (cluster + ball stopped)
    - corner (ball out of frame near corner)
    - set_piece (cluster without ball movement)
    """
    classified = []

    for evt in events:
        classified.append(evt)

    # Merge nearby events
    merged = []
    for evt in sorted(classified, key=lambda e: e["time_s"]):
        if merged and abs(evt["time_s"] - merged[-1]["time_s"]) < 2.0:
            # Enhance previous event
            merged[-1]["related_events"] = merged[-1].get("related_events", [])
            merged[-1]["related_events"].append(evt["type"])
        else:
            merged.append(evt)

    return merged


def analyze_video_direct(video_path, sample_fps=5):
    """
    Direct video analysis without pre-computed tracking.
    Uses YOLOv8 for ball detection + simple heuristics.
    """
    from ultralytics import YOLO

    model = YOLO("yolov8x.pt")
    cap = cv2.VideoCapture(str(video_path))

    if not cap.isOpened():
        print(f"Error: Cannot open video {video_path}")
        sys.exit(1)

    video_fps = cap.get(cv2.CAP_PROP_FPS) or 30
    frame_step = max(1, int(video_fps / sample_fps))

    frames = []
    frame_idx = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        if frame_idx % frame_step != 0:
            frame_idx += 1
            continue

        results = model(frame, verbose=False, conf=0.3)
        players = []
        ball = None

        for r in results:
            for box in r.boxes:
                cls = int(box.cls[0])
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                center = ((x1 + x2) / 2, (y1 + y2) / 2)

                if cls == 0:  # Person
                    players.append({
                        "id": len(players),
                        "center": list(center),
                        "speed_mps": 0,
                    })
                elif cls == 32:  # Ball
                    ball = {"center": list(center)}

        frames.append({
            "frame": frame_idx,
            "time_s": round(frame_idx / video_fps, 2),
            "players": players,
            "ball": ball,
        })

        frame_idx += 1

    cap.release()
    return frames


def detect_events(tracking_data=None, video_path=None, sample_fps=5):
    """Main event detection pipeline."""
    if tracking_data is None and video_path is None:
        print("Error: Provide either tracking JSON or video path")
        sys.exit(1)

    if tracking_data is not None:
        frames = tracking_data.get("frames", [])
    else:
        print("Analyzing video directly...")
        frames = analyze_video_direct(video_path, sample_fps)

    print(f"Processing {len(frames)} frames...")

    # Run all detectors
    speed_spikes = detect_speed_spikes(frames)
    clusters = detect_player_clustering(frames)
    ball_events = detect_ball_trajectory(frames)
    pressure = detect_team_pressure(frames)

    # Combine all events
    all_events = speed_spikes + clusters + ball_events + pressure

    # Classify
    classified = classify_events(all_events, frames)

    # Summary
    event_types = defaultdict(int)
    for evt in classified:
        event_types[evt["type"]] += 1

    output = {
        "total_events": len(classified),
        "event_summary": dict(event_types),
        "events": classified,
        "stats": {
            "frames_analyzed": len(frames),
            "total_players_seen": len(set(
                p["id"] for fd in frames for p in fd["players"]
            )),
        },
    }

    print(f"\nEvents detected: {len(classified)}")
    for etype, count in event_types.items():
        print(f"  {etype}: {count}")

    return output


def main():
    parser = argparse.ArgumentParser(description="Detect sports events from video")
    parser.add_argument("input", nargs="?", help="Path to tracking JSON")
    parser.add_argument("--video", help="Path to video file (direct analysis)")
    parser.add_argument("--output", "-o", help="Output JSON path")
    parser.add_argument("--sample-fps", type=float, default=5)
    args = parser.parse_args()

    tracking_data = None
    video_path = args.video

    if args.input and not args.video:
        tracking_data = load_tracking(args.input)
        video_path = None
    elif not args.input and not args.video:
        print("Error: Provide either tracking JSON or --video")
        sys.exit(1)

    output = detect_events(tracking_data, video_path, args.sample_fps)

    output_path = args.output or "events.json"
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\nSaved to {output_path}")


if __name__ == "__main__":
    main()
