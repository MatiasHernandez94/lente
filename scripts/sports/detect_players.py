#!/usr/bin/env python3
"""
Fase 1: Detección real de jugadores con YOLOv8 + separación de equipos por color.
Entrada: video file path
Salida: JSON con tracks, posiciones, métricas de distancia/velocidad por frame.

Uso:
  python detect_players.py <video_path> [--output results.json] [--sample-fps 5]
"""

import sys
import json
import argparse
import math
import tempfile
import os
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np
from ultralytics import YOLO
from sklearn.cluster import KMeans


# --- Config ---
CONFIDENCE_THRESHOLD = 0.35
IOU_THRESHOLD = 0.45
FIELD_LENGTH_M = 105.0
FIELD_WIDTH_M = 68.0
SAMPLE_FPS = 5  # frames per second to process (lower = faster)
YOLO_MODEL = os.environ.get("LENTE_YOLO_MODEL", "yolov8s.pt")  # Default: yolov8s for speed/accuracy balance
MAX_INFER_WIDTH = 1280  # Downscale to this width before YOLO inference
KMEANS_INTERVAL = 10  # Run KMeans every N frames (reuses previous assignment otherwise)


def load_model():
    """Load YOLOv8 model (auto-downloads on first use). Uses singleton pattern for reuse."""
    global _model_cache
    if "_model_cache" not in globals():
        _model_cache = None
    if _model_cache is None:
        _model_cache = YOLO(YOLO_MODEL)
    return _model_cache


def extract_jersey_color(frame, bbox):
    """Extract dominant jersey color from player bounding box."""
    x1, y1, x2, y2 = [int(c) for c in bbox]
    h, w = frame.shape[:2]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w, x2), min(h, y2)
    if x2 <= x1 or y2 <= y1:
        return None

    crop = frame[y1:y2, x1:x2]
    if crop.size == 0:
        return None


def downscale_frame(frame, target_width=MAX_INFER_WIDTH):
    """Downscale frame for faster YOLO inference."""
    h, w = frame.shape[:2]
    if w <= target_width:
        return frame, 1.0
    scale = target_width / w
    new_h = int(h * scale)
    resized = cv2.resize(frame, (target_width, new_h), interpolation=cv2.INTER_LINEAR)
    return resized, scale

    # Focus on upper body (jersey area) - top 40% of bbox
    jersey_h = int(crop.shape[0] * 0.4)
    jersey_crop = crop[:jersey_h, :]

    # Resize for clustering speed
    small = cv2.resize(jersey_crop, (32, 32))
    pixels = small.reshape(-1, 3).astype(np.float32)

    # Remove dark pixels (background) and very light (skin)
    brightness = np.sum(pixels, axis=1)
    mask = (brightness > 80) & (brightness < 650)
    if mask.sum() < 10:
        return None

    return pixels[mask]


def assign_teams(colors_list, n_teams=2):
    """
    Cluster player jersey colors into teams using KMeans.
    Returns dict: player_index -> team_id (0 or 1)
    """
    valid = [(i, c) for i, c in enumerate(colors_list) if c is not None]
    if len(valid) < n_teams:
        return {i: 0 for i, _ in valid}

    all_colors = np.vstack([c for _, c in valid])
    kmeans = KMeans(n_clusters=n_teams, n_init=10, random_state=42)
    kmeans.fit(all_colors)

    # Assign each player to nearest cluster
    assignments = {}
    for idx, (_, colors) in enumerate(valid):
        # Get average color for this player
        avg_color = colors.mean(axis=0).reshape(1, -1)
        cluster = kmeans.predict(avg_color)[0]
        assignments[idx] = int(cluster)

    return assignments


def iou(box1, box2):
    """Calculate Intersection over Union."""
    x1 = max(box1[0], box2[0])
    y1 = max(box1[1], box2[1])
    x2 = min(box1[2], box2[2])
    y2 = min(box1[3], box2[3])
    inter = max(0, x2 - x1) * max(0, y2 - y1)
    area1 = (box1[2] - box1[0]) * (box1[3] - box1[1])
    area2 = (box2[2] - box2[0]) * (box2[3] - box2[1])
    union = area1 + area2 - inter
    return inter / union if union > 0 else 0


def simple_tracker(detections, prev_tracks, iou_threshold=0.3):
    """
    Simple IoU-based tracker. Matches detections to existing tracks.
    Returns updated tracks dict.
    """
    if not prev_tracks:
        return {
            i: {"bbox": d["bbox"], "team": None, "history": [d["center"]]}
            for i, d in enumerate(detections)
        }

    if not detections:
        return prev_tracks

    # Build cost matrix
    track_ids = list(prev_tracks.keys())
    cost = np.zeros((len(detections), len(track_ids)))
    for di, det in enumerate(detections):
        for ti, tid in enumerate(track_ids):
            cost[di, ti] = iou(det["bbox"], prev_tracks[tid]["bbox"])

    # Greedy matching (simpler than Hungarian, good enough)
    matched_det = set()
    matched_track = set()
    matches = []

    while cost.size > 0:
        max_idx = np.unravel_index(cost.argmax(), cost.shape)
        if cost[max_idx] < iou_threshold:
            break
        di, ti = max_idx
        matches.append((di, track_ids[ti]))
        matched_det.add(di)
        matched_track.add(track_ids[ti])
        cost[di, :] = -1
        cost[:, ti] = -1

    # Update matched tracks
    new_tracks = {}
    for di, tid in matches:
        old = prev_tracks[tid]
        new_tracks[tid] = {
            "bbox": detections[di]["bbox"],
            "team": old["team"],
            "history": old["history"] + [detections[di]["center"]],
        }

    # Create new tracks for unmatched detections
    next_id = max(track_ids) + 1 if track_ids else 0
    for di in range(len(detections)):
        if di not in matched_det:
            new_tracks[next_id] = {
                "bbox": detections[di]["bbox"],
                "team": None,
                "history": [detections[di]["center"]],
            }
            next_id += 1

    return new_tracks


def pixel_to_meters(pixels, frame_width, field_width_m=FIELD_WIDTH_M):
    """Convert pixel distance to meters using field width as reference."""
    return pixels * field_width_m / frame_width


def calculate_metrics(tracks, frame_width, fps):
    """Calculate speed (m/s) and distance (m) for each track."""
    metrics = {}
    for tid, track in tracks.items():
        history = track["history"]
        if len(history) < 2:
            metrics[tid] = {"speed_mps": 0, "distance_m": 0}
            continue

        total_dist = 0
        speeds = []
        for i in range(1, len(history)):
            dx = history[i][0] - history[i - 1][0]
            dy = history[i][1] - history[i - 1][1]
            dist_px = math.sqrt(dx * dx + dy * dy)
            dist_m = pixel_to_meters(dist_px, frame_width)
            total_dist += dist_m
            speed = dist_m * fps  # m/s
            speeds.append(speed)

        metrics[tid] = {
            "speed_mps": round(np.mean(speeds) if speeds else 0, 2),
            "distance_m": round(total_dist, 2),
            "max_speed_mps": round(max(speeds) if speeds else 0, 2),
        }

    return metrics


PROGRESS_EVERY = 25  # muestras entre escrituras de progreso
# La deteccion usa solo el 90% de la barra: el postprocesamiento (metrics,
# sport_specific, guardado) ocupa el resto y asi la barra nunca retrocede.
DETECTION_PCT_CAP = 90


def write_progress(progress_path, stage, frames_done, frames_total, pct_cap=100):
    """Publica el avance en un archivo para que la UI pueda mostrarlo.

    Se escribe en un archivo temporal y se renombra, para que un lector
    concurrente nunca vea un JSON a medio escribir.

    `pct_cap` reserva la parte final de la barra para otras fases: la deteccion
    se detiene en 90 para que el postprocesamiento pueda continuar desde ahi en
    lugar de que la barra retroceda de 100 a 92.
    """
    if not progress_path:
        return
    try:
        pct = None
        if frames_total:
            pct = max(0, min(pct_cap, round(frames_done / frames_total * pct_cap)))
        payload = {
            "stage": stage,
            "frames_done": frames_done,
            "frames_total": frames_total,
            "pct": pct,
            "updated_at": datetime.now().isoformat(),
        }
        tmp = f"{progress_path}.tmp"
        with open(tmp, "w") as fh:
            json.dump(payload, fh)
        os.replace(tmp, progress_path)
    except Exception:
        # El progreso es best-effort: nunca debe romper el análisis.
        pass


def process_video(video_path, output_path=None, sample_fps=SAMPLE_FPS, progress_path=None):
    """Main processing pipeline."""
    print(f"Loading model ({YOLO_MODEL})...")
    model = load_model()

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        print(f"Error: Cannot open video {video_path}")
        sys.exit(1)

    video_fps = cap.get(cv2.CAP_PROP_FPS) or 30
    frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    # Calculate frame sampling
    frame_step = max(1, int(video_fps / sample_fps))
    frame_interval_s = frame_step / video_fps

    print(f"Video: {frame_width}x{frame_height}, {video_fps:.1f}fps, {total_frames} frames")
    print(f"Processing every {frame_step} frames ({sample_fps} fps effective)")
    print(f"Inference resolution: max {MAX_INFER_WIDTH}px width")

    all_frames_data = []
    tracks = {}
    prev_team_assignments = {}
    frame_idx = 0
    sampled_total = max(1, total_frames // frame_step)
    sampled_done = 0
    write_progress(progress_path, "Analizando con YOLOv8", 0, sampled_total, DETECTION_PCT_CAP)

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        if frame_idx % frame_step != 0:
            frame_idx += 1
            continue

        # Downscale for faster inference
        infer_frame, scale = downscale_frame(frame, MAX_INFER_WIDTH)

        # Run YOLOv8 detection
        results = model(infer_frame, verbose=False, conf=CONFIDENCE_THRESHOLD)
        detections = []

        for r in results:
            for box in r.boxes:
                cls = int(box.cls[0])
                conf = float(box.conf[0])

                # Classes: 0=person, 32=sports ball
                if cls == 0:  # Person
                    x1, y1, x2, y2 = box.xyxy[0].tolist()
                    # Scale back to original resolution
                    x1, x2 = x1 / scale, x2 / scale
                    y1, y2 = y1 / scale, y2 / scale
                    center = ((x1 + x2) / 2, (y1 + y2) / 2)
                    detections.append({
                        "bbox": [x1, y1, x2, y2],
                        "center": center,
                        "confidence": conf,
                        "class": "player",
                    })
                elif cls == 32:  # Ball
                    x1, y1, x2, y2 = box.xyxy[0].tolist()
                    x1, x2 = x1 / scale, x2 / scale
                    y1, y2 = y1 / scale, y2 / scale
                    center = ((x1 + x2) / 2, (y1 + y2) / 2)
                    detections.append({
                        "bbox": [x1, y1, x2, y2],
                        "center": center,
                        "confidence": conf,
                        "class": "ball",
                    })

        # Separate players and balls
        player_dets = [d for d in detections if d["class"] == "player"]
        ball_dets = [d for d in detections if d["class"] == "ball"]

        # Extract jersey colors for team assignment
        jersey_colors = [
            extract_jersey_color(frame, d["bbox"]) for d in player_dets
        ]

        # Assign teams using KMeans (optimized: run every N frames)
        if frame_idx % (frame_step * KMEANS_INTERVAL) == 0 or not prev_team_assignments:
            team_assignments = assign_teams(jersey_colors)
            prev_team_assignments = team_assignments
        else:
            # Reuse previous assignments for new players
            team_assignments = prev_team_assignments

        # Add team info to detections
        for i, d in enumerate(player_dets):
            d["team"] = team_assignments.get(i, 0)

        # Update tracker
        tracks = simple_tracker(player_dets, tracks)

        # Update team assignments in tracks
        for i, d in enumerate(player_dets):
            for tid in tracks:
                if tracks[tid]["bbox"] == d["bbox"]:
                    tracks[tid]["team"] = d["team"]

        # Calculate metrics
        metrics = calculate_metrics(tracks, frame_width, fps=frame_interval_s)

        # Build frame data
        frame_data = {
            "frame": frame_idx,
            "time_s": round(frame_idx / video_fps, 2),
            "players": [],
            "ball": None,
        }

        for tid, track in tracks.items():
            frame_data["players"].append({
                "id": tid,
                "bbox": [round(c, 1) for c in track["bbox"]],
                "center": [round(c, 1) for c in track["history"][-1]],
                "team": track["team"],
                "speed_mps": metrics.get(tid, {}).get("speed_mps", 0),
                "distance_m": metrics.get(tid, {}).get("distance_m", 0),
            })

        if ball_dets:
            best_ball = max(ball_dets, key=lambda d: d["confidence"])
            frame_data["ball"] = {
                "center": [round(c, 1) for c in best_ball["center"]],
                "confidence": round(best_ball["confidence"], 3),
            }

        all_frames_data.append(frame_data)

        # Progress
        if frame_idx % 50 == 0:
            print(f"  Frame {frame_idx}/{total_frames} ({len(tracks)} tracks)")

        sampled_done += 1
        if sampled_done % PROGRESS_EVERY == 0:
            write_progress(progress_path, "Analizando con YOLOv8", sampled_done, sampled_total, DETECTION_PCT_CAP)

        frame_idx += 1

    cap.release()
    write_progress(progress_path, "Analizando con YOLOv8", sampled_total, sampled_total, DETECTION_PCT_CAP)

    # Build summary
    all_players = {}
    for fd in all_frames_data:
        for p in fd["players"]:
            pid = p["id"]
            if pid not in all_players:
                all_players[pid] = {
                    "id": pid,
                    "team": p["team"],
                    "positions": [],
                    "total_distance_m": 0,
                    "avg_speed_mps": 0,
                    "max_speed_mps": 0,
                }
            all_players[pid]["positions"].append(p["center"])
            all_players[pid]["total_distance_m"] = p["distance_m"]
            all_players[pid]["avg_speed_mps"] = p["speed_mps"]
            all_players[pid]["max_speed_mps"] = max(
                all_players[pid]["max_speed_mps"], p["speed_mps"]
            )

    output = {
        "video": {
            "path": str(video_path),
            "width": frame_width,
            "height": frame_height,
            "fps": video_fps,
            "duration_s": round(total_frames / video_fps, 2),
        },
        "settings": {
            "sample_fps": sample_fps,
            "frame_step": frame_step,
            "confidence": CONFIDENCE_THRESHOLD,
        },
        "summary": {
            "total_players_detected": len(all_players),
            "frames_processed": len(all_frames_data),
            "teams": {
                "team_0": len([p for p in all_players.values() if p["team"] == 0]),
                "team_1": len([p for p in all_players.values() if p["team"] == 1]),
            },
        },
        "players": list(all_players.values()),
        "frames": all_frames_data,
    }

    # Save
    if output_path is None:
        output_path = Path(video_path).with_suffix(".tracking.json")

    with open(output_path, "w") as f:
        json.dump(output, f, separators=(',', ':'))

    print(f"\nResults saved to {output_path}")
    print(f"Players detected: {len(all_players)}")
    print(f"Teams: {output['summary']['teams']}")
    print(f"Frames processed: {len(all_frames_data)}")

    return output


def main():
    parser = argparse.ArgumentParser(description="Detect and track players using YOLOv8")
    parser.add_argument("video", help="Path to input video")
    parser.add_argument("--output", "-o", help="Output JSON path")
    parser.add_argument(
        "--sample-fps", type=float, default=SAMPLE_FPS,
        help=f"Frames per second to process (default: {SAMPLE_FPS})"
    )
    args = parser.parse_args()

    process_video(args.video, args.output, args.sample_fps)


if __name__ == "__main__":
    main()
