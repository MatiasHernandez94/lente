#!/usr/bin/env python3
"""
Pipeline completo de análisis deportivo.
Detecta si es actividad individual o de equipo y ejecuta el análisis apropiado.
Entrada: video file + sport type
Salida: JSON consolidado con análisis.

Uso:
  python analyze_full.py <video.mp4> [--sport general] [--output analysis.json] [--sample-fps 5]
"""

import sys
import json
import argparse
import os
from pathlib import Path
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor

from detect_players import process_video, write_progress
from sport_specific import run_sport_specific_analysis

TEAM_SPORTS = {"futbol", "padel", "voleibol", "baloncesto"}
SOLO_SPORTS = {"general"}


def run_full_analysis(video_path, output_path=None, sample_fps=5, sport="general", progress_path=None):
    start_time = datetime.now()

    print("=" * 60)
    print("LENTE Sports Analysis Pipeline")
    print(f"Sport: {sport}")
    print("=" * 60)

    # Phase 1: Player Detection + Tracking (publica su propio progreso por frame)
    print("\n[Phase 1] Detecting people and tracking...")
    tracking_path = str(Path(video_path).with_suffix(".tracking.json"))
    # El muestreo de fotogramas ocupa la mayor parte del tiempo; las fases
    # siguientes se exprimen como fracciones del 100% para que la barra no se
    # quede clavada en 100% mientras sigue trabajando.
    tracking_data = process_video(video_path, tracking_path, sample_fps, progress_path)
    write_progress(progress_path, "Calculando métricas del deporte", 92, 100)

    # Count detected people and max concurrent per frame
    detected_ids = set()
    max_concurrent = 0
    for fd in tracking_data.get("frames", []):
        players = fd.get("players", [])
        for p in players:
            detected_ids.add(p["id"])
        max_concurrent = max(max_concurrent, len(players))
    person_count = len(detected_ids)

    # Decide mode by actual detected people, not by the sport label.
    # A video with 2+ people simultaneously present is team activity.
    is_solo = max_concurrent <= 1 and person_count <= 1

    # Analyze sport-specific features using tracking data (dribbles, speed, etc.)
    sport_specific = run_sport_specific_analysis(tracking_data, sport)

    if is_solo:
        write_progress(progress_path, "Calculando métricas del deporte", 92, 100)
        print(f"\n[Solo mode] {person_count} person detected → individual activity analysis")
        from solo_activity import run_solo_analysis
        solo_result = run_solo_analysis(tracking_data)

        end_time = datetime.now()
        duration = (end_time - start_time).total_seconds()

        output = {
            "version": "1.0",
            "mode": "solo",
            "sport": sport,
            "video": tracking_data.get("video", {}),
            "processing_time_s": round(duration, 2),
            "timestamp": end_time.isoformat(),
            "tracking": {
                "summary": tracking_data.get("summary", {}),
                "players": tracking_data.get("players", []),
            },
            "solo": solo_result,
            "sport_specific": sport_specific,
            "events": {"total_events": 0, "event_summary": {}, "events": [], "stats": {"frames_analyzed": len(tracking_data.get("frames", []))}},
            "tactical": {"formations": {}, "possession": {}, "pressing": {}, "transitions": {"total": 0, "events": []}, "heatmaps": {}},
            "fatigue": {"players": {}, "summary": {"total_players": 0, "fatigued_players": 0, "fatigued_player_ids": [], "total_injury_risks": 0, "high_severity_risks": 0}, "injury_risks": []},
        }
    else:
        print(f"\n[Team mode] {person_count} players detected → team sport analysis")
        from detect_events import detect_events
        from tactical_analysis import run_tactical_analysis
        from detect_fatigue import run_fatigue_detection

        write_progress(progress_path, "Calculando métricas del deporte", 92, 100)
        with ThreadPoolExecutor(max_workers=3) as executor:
            future_events = executor.submit(detect_events, tracking_data=tracking_data)
            future_tactical = executor.submit(run_tactical_analysis, tracking_data, sport)
            future_fatigue = executor.submit(run_fatigue_detection, tracking_data)

            events = future_events.result()
            tactical = future_tactical.result()
            fatigue = future_fatigue.result()

        end_time = datetime.now()
        duration = (end_time - start_time).total_seconds()

        output = {
            "version": "1.0",
            "mode": "team",
            "sport": sport,
            "video": tracking_data.get("video", {}),
            "processing_time_s": round(duration, 2),
            "timestamp": end_time.isoformat(),
            "tracking": {
                "summary": tracking_data.get("summary", {}),
                "players": tracking_data.get("players", []),
            },
            "events": events,
            "tactical": tactical,
            "fatigue": fatigue,
            "sport_specific": sport_specific,
        }

    # Include frames data for overlay
    if "frames" in tracking_data:
        output["frames"] = tracking_data["frames"]

    # Save
    if output_path is None:
        output_path = str(Path(video_path).with_suffix(".analysis.json"))

    write_progress(progress_path, "Guardando resultado", 100, 100)

    with open(output_path, "w") as f:

        def sanitize(obj):
            if isinstance(obj, float) and (obj != obj or obj in (float("inf"), float("-inf"))):
                return None
            return obj

        json.dump(output, f, separators=(',', ':'), default=sanitize)

    # El archivo de progreso es de un solo uso: se borra al terminar para que un
    # analisis posterior no lea un progreso viejo. La UI pasa a "listo" en cuanto
    # el worker marca el job como done.
    if progress_path:
        try:
            os.remove(progress_path)
        except OSError:
            pass

    print("\n" + "=" * 60)
    print("Analysis Complete!")
    print("=" * 60)
    print(f"Duration: {duration:.1f}s")
    print(f"Mode: {output['mode']}")
    print(f"\nResults: {output_path}")

    return output


def main():
    parser = argparse.ArgumentParser(description="Full sports analysis pipeline")
    parser.add_argument("video", help="Path to input video")
    parser.add_argument("--output", "-o", help="Output JSON path")
    parser.add_argument("--sport", default="general", help="Sport type (general, futbol, padel, voleibol, baloncesto)")
    parser.add_argument("--sample-fps", type=float, default=5, help="Frames per second to process (default: 5)")
    parser.add_argument("--progress", help="Path where to publish progress JSON for the UI")
    args = parser.parse_args()

    run_full_analysis(args.video, args.output, args.sample_fps, args.sport, args.progress)


if __name__ == "__main__":
    main()
