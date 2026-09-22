#!/usr/bin/env python3
"""
Streaming YOLOv8 worker for live analysis.
Reads video frames from stdin (base64 JPEG), runs YOLOv8 detection,
and writes results to stdout as JSON lines.

Input format (stdin): {"type":"frame","frame_id":123,"image":"base64_jpeg_data"}
Output format (stdout): {"type":"detection","frame_id":123,"players":[...],"ball":{...}}

Usage:
  echo '{"type":"frame","frame_id":0,"image":"..."}' | python3 detect_players_streaming.py
"""

import sys
import json
import base64
import numpy as np
import cv2
from ultralytics import YOLO

# Config
CONFIDENCE_THRESHOLD = 0.35
MAX_INFER_WIDTH = 1280
YOLO_MODEL = "yolov8s.pt"

_model = None

def load_model():
    global _model
    if _model is None:
        _model = YOLO(YOLO_MODEL)
    return _model

def downscale_frame(frame, target_width=MAX_INFER_WIDTH):
    h, w = frame.shape[:2]
    if w <= target_width:
        return frame, 1.0
    scale = target_width / w
    new_h = int(h * scale)
    resized = cv2.resize(frame, (target_width, new_h), interpolation=cv2.INTER_LINEAR)
    return resized, scale

def process_frame(frame_data):
    """Process a single frame and return detections."""
    # Decode base64 image
    img_bytes = base64.b64decode(frame_data["image"])
    nparr = np.frombuffer(img_bytes, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    if frame is None:
        return {"type": "error", "message": "Failed to decode frame"}
    
    # Downscale for inference
    infer_frame, scale = downscale_frame(frame)
    
    # Run YOLO
    model = load_model()
    results = model(infer_frame, verbose=False, conf=CONFIDENCE_THRESHOLD)
    
    detections = {"players": [], "ball": None}
    
    for r in results:
        for box in r.boxes:
            cls = int(box.cls[0])
            conf = float(box.conf[0])
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            
            # Scale back to original
            x1, x2 = x1 / scale, x2 / scale
            y1, y2 = y1 / scale, y2 / scale
            center = ((x1 + x2) / 2, (y1 + y2) / 2)
            
            if cls == 0:  # Person
                detections["players"].append({
                    "bbox": [round(x1, 1), round(y1, 1), round(x2, 1), round(y2, 1)],
                    "center": [round(center[0], 1), round(center[1], 1)],
                    "confidence": round(conf, 3),
                })
            elif cls == 32:  # Ball
                detections["ball"] = {
                    "center": [round(center[0], 1), round(center[1], 1)],
                    "confidence": round(conf, 3),
                }
    
    return detections

def main():
    """Main loop: read frames from stdin, write results to stdout."""
    # Pre-load model
    print("Streaming worker starting...", file=sys.stderr)
    load_model()
    print("Model loaded. Ready for frames.", file=sys.stderr)
    
    # Signal ready
    print(json.dumps({"type": "ready"}))
    sys.stdout.flush()
    
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            continue
        
        if msg.get("type") == "frame":
            frame_id = msg.get("frame_id", 0)
            try:
                detections = process_frame(msg)
                result = {
                    "type": "detection",
                    "frame_id": frame_id,
                    **detections,
                }
            except Exception as e:
                result = {
                    "type": "error",
                    "frame_id": frame_id,
                    "message": str(e),
                }
            
            print(json.dumps(result, separators=(',', ':')))
            sys.stdout.flush()
        
        elif msg.get("type") == "shutdown":
            break

if __name__ == "__main__":
    main()
