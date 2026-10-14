#!/usr/bin/env python3
"""
Pipeline completo de análisis deportivo.

El deporte se pasa como contexto y define el modo de análisis, los jugadores
esperados y las métricas relevantes. Para deportes de equipo se corre táctica,
eventos y fatiga; para actividad individual se corre ritmo, intensidad y
descansos. En ningún caso se inventan métricas que no apliquen.

Uso:
  python analyze_full.py <video.mp4> [--sport general] [--output analysis.json] [--sample-fps 5]
  [--progress progress.json]
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
from sport_profile import (
    get_profile,
    compute_team_metrics,
    compute_solo_metrics,
    build_solo_insights,
    build_team_insights,
)

# Muestreo mínimo para actividad individual. Contar saltos es medir una
# frecuencia: a 5 fps el techo de Nyquist es 2.5 Hz (150 saltos/min) y un ritmo
# real de 120/min aparecía aliasado como 244 RPM. Con 12 fps el techo sube a
# 6 Hz (360/min), con margen para el ritmo de cualquier ejercicio.
SOLO_MIN_SAMPLE_FPS = 12.0

EMPTY_EVENTS = {"total_events": 0, "event_summary": {}, "events": [], "stats": {"frames_analyzed": 0}}
EMPTY_TACTICAL = {
    "formations": {}, "possession": {}, "pressing": {},
    "transitions": {"total": 0, "events": []}, "heatmaps": {},
}
EMPTY_FATIGUE = {
    "players": {},
    "summary": {
        "total_players": 0, "fatigued_players": 0, "fatigued_player_ids": [],
        "total_injury_risks": 0, "high_severity_risks": 0,
    },
    "injury_risks": [],
}


def _detect_scene(tracking_data):
    """
    Gente real en escena, ya sin tracks fantasma.

    `max_concurrent` es la cantidad de personas visibles al mismo tiempo: es el
    dato que decide individual vs equipo. Un video con una persona saltando la
    cuerda tiene max_concurrent=1 aunque YOLO haya visto mal 40 frames sueltos.
    """
    detected_ids = set()
    max_concurrent = 0
    for fd in tracking_data.get("frames", []):
        players = fd.get("players", [])
        for p in players:
            detected_ids.add(p["id"])
        max_concurrent = max(max_concurrent, len(players))
    return len(detected_ids), max_concurrent


def run_full_analysis(
    video_path,
    output_path=None,
    sample_fps=5,
    sport="general",
    progress_path=None,
):
    start_time = datetime.now()

    # El muestreo se decide antes de tocar el video: el modo individual necesita
    # resolución temporal para medir ritmo, y el de equipo prioriza velocidad de
    # procesamiento porque sus métricas no dependen de la frecuencia.
    profile = get_profile(sport)
    if profile.mode == "solo":
        sample_fps = max(sample_fps, SOLO_MIN_SAMPLE_FPS)

    print("=" * 60)
    print("LENTE Sports Analysis Pipeline")
    print(f"Deporte: {sport}")
    print(f"Muestreo: {sample_fps} fps")
    print("=" * 60)

    # ── Fase 1: detección + tracking (publica su propio progreso por frame) ──
    print("\n[Fase 1] Detectando personas y rastreando...")
    tracking_path = str(Path(video_path).with_suffix(".tracking.json"))
    tracking_data = process_video(video_path, tracking_path, sample_fps, progress_path)
    write_progress(progress_path, "Calculando métricas del deporte", 92, 100)

    person_count, max_concurrent = _detect_scene(tracking_data)
    summary = tracking_data.get("summary", {})
    ghosts = summary.get("ghost_tracks_filtered", 0)

    # El perfil del deporte manda. `general` es siempre individual aunque YOLO
    # vea a más gente en el gimnasio: se analiza al sujeto protagonista.
    mode = profile.resolve_mode(person_count)

    print(f"\n[Contexto] deporte={sport} · personas en escena={person_count} · simultáneas={max_concurrent} · fantasma filtrado={ghosts}")
    print(f"[Contexto] modo={mode} · esperado={profile.expected_players or 'n/a'} {profile.player_label}")

    # Métricas específicas del deporte (botes, posesión, etc.) — el agente IA
    # las consume como contexto, así que tienen que estar siempre presentes.
    sport_specific = run_sport_specific_analysis(tracking_data, sport)

    duration = 0.0

    if mode == "solo":
        print("\n[Modo individual] Ritmo, intensidad, repeticiones y descansos")
        from solo_activity import run_solo_analysis
        solo_result = run_solo_analysis(tracking_data)
        detailed = compute_solo_metrics(tracking_data, solo_result, sport)
        solo_result["detailed"] = detailed
        solo_result["narrative"] = build_solo_insights(sport, solo_result, detailed)

        output = {
            "version": "2.0",
            "mode": "solo",
            "sport": sport,
            "video": tracking_data.get("video", {}),
            "scale": tracking_data.get("scale"),
            "processing_time_s": 0,
            "timestamp": "",
            "tracking": {
                "summary": summary,
                "players": tracking_data.get("players", []),
            },
            "solo": solo_result,
            "sport_metrics": {
                "player_count": person_count,
                "player_label": profile.player_label,
                "max_concurrent": max_concurrent,
                "ghost_tracks_filtered": ghosts,
                "sport": sport,
            },
            "sport_specific": sport_specific,
            "events": EMPTY_EVENTS,
            "tactical": EMPTY_TACTICAL,
            "fatigue": EMPTY_FATIGUE,
        }
    else:
        print(f"\n[Modo equipo] {person_count} jugadores · táctica, eventos y fatiga")
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

        team_metrics = compute_team_metrics(
            tracking_data,
            sport,
            (tracking_data.get("scale") or {}).get("meters_per_pixel"),
        )
        team_metrics["max_concurrent"] = max_concurrent
        team_metrics["ghost_tracks_filtered"] = ghosts
        team_metrics["player_label"] = profile.player_label

        output = {
            "version": "2.0",
            "mode": "team",
            "sport": sport,
            "video": tracking_data.get("video", {}),
            "processing_time_s": 0,
            "timestamp": "",
            "tracking": {
                "summary": summary,
                "players": tracking_data.get("players", []),
            },
            "sport_metrics": team_metrics,
            "sport_narrative": build_team_insights(sport, team_metrics),
            "sport_specific": sport_specific,
            "events": events,
            "tactical": tactical,
            "fatigue": fatigue,
        }

    end_time = datetime.now()
    duration = (end_time - start_time).total_seconds()
    output["processing_time_s"] = round(duration, 2)
    output["timestamp"] = end_time.isoformat()

    # Los frames por muestra solo hacen falta para el overlay de video. Se
    # guardan en disco pero no viajan en el JSON que consume la UI (multi-MB de
    # datos inútiles para cualquier otra cosa).
    if "frames" in tracking_data:
        output["frames"] = tracking_data["frames"]

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
    # análisis posterior no lea un progreso viejo.
    if progress_path:
        try:
            os.remove(progress_path)
        except OSError:
            pass

    print("\n" + "=" * 60)
    print("Análisis completo!")
    print("=" * 60)
    print(f"Duración: {duration:.1f}s · Modo: {mode}")
    print(f"\nResultados: {output_path}")

    return output


def main():
    parser = argparse.ArgumentParser(description="Full sports analysis pipeline")
    parser.add_argument("video", help="Path to input video")
    parser.add_argument("--output", "-o", help="Output JSON path")
    parser.add_argument(
        "--sport", default="general",
        help="Deporte: general, futbol, padel, voleibol, baloncesto",
    )
    parser.add_argument(
        "--sample-fps", type=float, default=5,
        help="Frames per second to process (default: 5)",
    )
    parser.add_argument("--progress", help="Path where to publish progress JSON for the UI")
    args = parser.parse_args()

    run_full_analysis(args.video, args.output, args.sample_fps, args.sport, args.progress)


if __name__ == "__main__":
    main()
