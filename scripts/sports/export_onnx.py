#!/usr/bin/env python3
"""
Export YOLOv8 model to ONNX format for faster CPU inference.
Run once: python export_onnx.py
"""

from ultralytics import YOLO
import os

def export_to_onnx(model_name="yolov8s.pt", imgsz=640):
    """Export YOLOv8 model to ONNX format."""
    print(f"Loading {model_name}...")
    model = YOLO(model_name)

    onnx_path = model_name.replace(".pt", ".onnx")
    if os.path.exists(onnx_path):
        print(f"ONNX model already exists: {onnx_path}")
        return onnx_path

    print(f"Exporting to ONNX (imgsz={imgsz})...")
    model.export(format="onnx", imgsz=imgsz, simplify=True)

    print(f"Exported to: {onnx_path}")
    return onnx_path


if __name__ == "__main__":
    export_to_onnx()
