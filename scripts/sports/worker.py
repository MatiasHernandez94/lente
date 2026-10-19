#!/usr/bin/env python3
"""
Persistent Python worker for Lente sports analysis.
Stays alive and accepts JSON commands via stdin, returns results via stdout.

Usage:
  From Node.js: spawn('python3', ['worker.py'])
  Send commands as JSON lines on stdin
  Read results as JSON lines on stdout

Commands:
  {"action": "analyze", "video_path": "...", "output_path": "...", "sample_fps": 5}
  {"action": "ping"}
  {"action": "shutdown"}
"""

import sys
import json
import traceback
from pathlib import Path

# Import analysis modules
from detect_players import load_model, process_video
from detect_events import detect_events
from tactical_analysis import run_tactical_analysis
from detect_fatigue import run_fatigue_detection
from analyze_full import run_full_analysis


def handle_command(cmd):
    """Handle a single command and return result."""
    action = cmd.get("action")

    if action == "ping":
        return {"status": "ok", "message": "worker alive"}

    elif action == "analyze":
        video_path = cmd.get("video_path")
        output_path = cmd.get("output_path")
        sample_fps = cmd.get("sample_fps", 5)
        sport = cmd.get("sport", "general")

        if not video_path:
            return {"status": "error", "error": "video_path required"}

        try:
            result = run_full_analysis(video_path, output_path, sample_fps, sport)
            return {"status": "ok", "result_path": output_path or str(Path(video_path).with_suffix(".analysis.json"))}
        except Exception as e:
            return {"status": "error", "error": str(e), "traceback": traceback.format_exc()}

    elif action == "shutdown":
        return {"status": "ok", "message": "shutting down"}

    else:
        return {"status": "error", "error": f"unknown action: {action}"}


def main():
    """Main worker loop - reads JSON commands from stdin, writes results to stdout."""
    # Pre-load model at startup
    print("Worker starting, pre-loading YOLO model...", file=sys.stderr)
    load_model()
    print("Worker ready.", file=sys.stderr)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        cmd = None
        try:
            cmd = json.loads(line)
        except json.JSONDecodeError as e:
            result = {"status": "error", "error": f"invalid JSON: {e}"}
        else:
            result = handle_command(cmd)

        # El requestId viaja de vuelta para que el cliente Node case la
        # respuesta con la petición pendiente. Sin esto el cliente espera para
        # siempre: el worker persistente quedaba colgado.
        if isinstance(cmd, dict) and "requestId" in cmd:
            result["requestId"] = cmd["requestId"]

        # Write result as JSON line
        print(json.dumps(result, separators=(',', ':')))
        sys.stdout.flush()

        # Exit if shutdown requested
        if isinstance(cmd, dict) and cmd.get("action") == "shutdown":
            break


if __name__ == "__main__":
    main()
