#!/usr/bin/env python3
"""
Fase 2: Calibración automática de cancha deportiva.
Detecta líneas del campo usando OpenCV y calcula homografía para corregir perspectiva.
Entrada: imagen o frame del video
Salida: JSON con puntos de referencia y matriz de homografía.

Uso:
  python calibrate_pitch.py <image_or_frame> [--output calibration.json]
"""

import sys
import json
import argparse
import math
from pathlib import Path

import cv2
import numpy as np


# Field dimensions for common sports (meters)
SPORT_FIELDS = {
    "futbol": {"length": 105, "width": 68, "aspect": 105/68},
    "padel": {"length": 20, "width": 10, "aspect": 2.0},
    "baloncesto": {"length": 28, "width": 15, "aspect": 28/15},
    "voleibol": {"length": 18, "width": 9, "aspect": 2.0},
}


def detect_lines(frame):
    """Detect lines in frame using Canny + HoughLinesP."""
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)

    # Adaptive thresholds for different lighting
    edges = cv2.Canny(blur, 30, 100, apertureSize=3)

    # Detect line segments
    lines = cv2.HoughLinesP(
        edges, rho=1, theta=np.pi/180, threshold=50,
        minLineLength=50, maxLineGap=20
    )

    return lines, edges


def classify_lines(lines, frame_shape):
    """Classify detected lines as horizontal, vertical, or diagonal."""
    h, w = frame_shape[:2]
    horizontal = []
    vertical = []
    diagonal = []

    if lines is None:
        return horizontal, vertical, diagonal

    for line in lines:
        x1, y1, x2, y2 = line[0]
        dx = x2 - x1
        dy = y2 - y1
        length = math.sqrt(dx * dx + dy * dy)

        if length < 30:
            continue

        angle = abs(math.degrees(math.atan2(dy, dx)))

        if angle < 15 or angle > 165:  # ~horizontal
            horizontal.append((x1, y1, x2, y2, length))
        elif 75 < angle < 105:  # ~vertical
            vertical.append((x1, y1, x2, y2, length))
        else:
            diagonal.append((x1, y1, x2, y2, length))

    return horizontal, vertical, diagonal


def find_field_corners(horizontal, vertical, frame_shape):
    """Find the four corners of the field from line intersections."""
    h, w = frame_shape[:2]

    # Get extreme line positions
    all_y = []
    all_x = []

    for x1, y1, x2, y2, _ in horizontal:
        all_y.extend([y1, y2])

    for x1, y1, x2, y2, _ in vertical:
        all_x.extend([x1, x2])

    if len(all_y) < 2 or len(all_x) < 2:
        return None

    # Use percentiles for robustness
    top = int(np.percentile(all_y, 10))
    bottom = int(np.percentile(all_y, 90))
    left = int(np.percentile(all_x, 10))
    right = int(np.percentile(all_x, 90))

    corners = [
        [left, top],      # top-left
        [right, top],     # top-right
        [right, bottom],  # bottom-right
        [left, bottom],   # bottom-left
    ]

    return corners


def compute_homography(src_corners, field_m=None):
    """
    Compute homography matrix from image corners to field coordinates.
    field_m: (length, width) in meters
    """
    src = np.float32(src_corners)

    if field_m is None:
        # Default: use normalized coordinates
        dst = np.float32([
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
        ])
    else:
        length, width = field_m
        dst = np.float32([
            [0, 0],
            [length, 0],
            [length, width],
            [0, width],
        ])

    H, _ = cv2.findHomography(src, dst)
    return H


def pixel_to_field(point, H):
    """Transform a pixel coordinate to field coordinates using homography."""
    pt = np.array([point[0], point[1], 1.0])
    transformed = H @ pt
    if transformed[2] != 0:
        transformed /= transformed[2]
    return [round(float(transformed[0]), 2), round(float(transformed[1]), 2)]


def detect_sport(frame):
    """Simple heuristic to detect sport from field color and lines."""
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)

    # Green grass (futbol, padel)
    green_mask = cv2.inRange(hsv, (35, 40, 40), (85, 255, 255))
    green_ratio = np.sum(green_mask > 0) / green_mask.size

    # Hardwood (baloncesto)
    brown_mask = cv2.inRange(hsv, (10, 40, 100), (30, 200, 255))
    brown_ratio = np.sum(brown_mask > 0) / brown_mask.size

    if green_ratio > 0.3:
        return "futbol"
    elif brown_ratio > 0.3:
        return "baloncesto"
    else:
        return "futbol"  # default


def calibrate(image_path, sport=None):
    """Main calibration pipeline."""
    frame = cv2.imread(str(image_path))
    if frame is None:
        print(f"Error: Cannot read image {image_path}")
        sys.exit(1)

    h, w = frame.shape[:2]
    print(f"Image: {w}x{h}")

    # Detect sport if not specified
    if sport is None:
        sport = detect_sport(frame)
        print(f"Detected sport: {sport}")

    field = SPORT_FIELDS.get(sport, SPORT_FIELDS["futbol"])

    # Detect lines
    lines, edges = detect_lines(frame)
    print(f"Lines detected: {len(lines) if lines is not None else 0}")

    # Classify lines
    horizontal, vertical, diagonal = classify_lines(lines, (h, w))
    print(f"Horizontal: {len(horizontal)}, Vertical: {len(vertical)}, Diagonal: {len(diagonal)}")

    # Find field corners
    corners = find_field_corners(horizontal, vertical, (h, w))
    if corners is None:
        print("Warning: Could not detect field corners. Using image corners.")
        corners = [
            [int(w * 0.05), int(h * 0.05)],
            [int(w * 0.95), int(h * 0.05)],
            [int(w * 0.95), int(h * 0.95)],
            [int(w * 0.05), int(h * 0.95)],
        ]

    # Compute homography
    H = compute_homography(corners, (field["length"], field["width"]))
    H_list = H.tolist() if H is not None else None

    # Verify homography by transforming corners
    field_corners = []
    for corner in corners:
        fc = pixel_to_field(corner, H)
        field_corners.append(fc)

    output = {
        "sport": sport,
        "field": field,
        "image_size": [w, h],
        "corners_pixel": corners,
        "corners_field": field_corners,
        "homography": H_list,
        "lines_detected": {
            "horizontal": len(horizontal),
            "vertical": len(vertical),
            "diagonal": len(diagonal),
        },
        "edges_shape": list(edges.shape),
    }

    # Save edges image for debugging
    edges_path = Path(image_path).with_suffix(".edges.png")
    cv2.imwrite(str(edges_path), edges)

    print(f"\nField corners (meters): {field_corners}")
    print(f"Homography matrix:\n{H}")
    print(f"Debug edges saved to: {edges_path}")

    return output


def main():
    parser = argparse.ArgumentParser(description="Auto-calibrate sports field")
    parser.add_argument("image", help="Path to image or video frame")
    parser.add_argument("--output", "-o", help="Output JSON path")
    parser.add_argument("--sport", choices=list(SPORT_FIELDS.keys()), help="Sport type")
    args = parser.parse_args()

    output = calibrate(args.image, args.sport)

    output_path = args.output or Path(args.image).with_suffix(".calibration.json")
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\nSaved to {output_path}")


if __name__ == "__main__":
    main()
