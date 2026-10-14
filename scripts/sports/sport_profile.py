#!/usr/bin/env python3
"""
Perfiles de análisis por deporte.

El deporte define el contexto: cuántos jugadores se esperan, si es individual o
de equipo, qué métricas tienen sentido y cómo se interpretan. Antes el análisis
aplicaba la misma receta (formaciones, posesión, fatiga) a todo, incluso a un
video de saltar la cuerda, y producía indicadores sin sentido.

Uso:
    from sport_profile import get_profile, build_insights
    profile = get_profile("futbol", tracking_data)
    insights = build_insights("futbol", tracking_data, solo, tactical, fatigue)
"""

import math
import numpy as np


def _safe_div(a, b, default=0.0):
    return a / b if b else default


def _mean(xs):
    xs = list(xs)
    return float(np.mean(xs)) if xs else 0.0


def _percentile(xs, p):
    xs = list(xs)
    return float(np.percentile(xs, p)) if xs else 0.0


# ── Zonas de velocidad (m/s) por deporte ──
# Los umbrales genéricos (1/2/3 m/s) no significan lo mismo caminando que
# jugando al pádel. Cada deporte tiene su propia escala de esfuerzo.
SPEED_ZONES = {
    "general": [(0, 0.8, "reposo"), (0.8, 2.0, "baja"), (2.0, 3.5, "moderada"), (3.5, 99, "alta")],
    "futbol": [(0, 1.0, "reposo"), (1.0, 3.0, "trote"), (3.0, 5.5, "carrera"), (5.5, 99, "sprint")],
    "padel": [(0, 0.8, "reposo"), (0.8, 2.0, "desplazamiento"), (2.0, 3.2, "presión"), (3.2, 99, "arranque")],
    "voleibol": [(0, 0.7, "reposo"), (0.7, 1.8, "desplazamiento"), (1.8, 3.0, "defensa"), (3.0, 99, "salto/ataque")],
    "baloncesto": [(0, 1.0, "reposo"), (1.0, 3.0, "transición"), (3.0, 5.0, "carrera"), (5.0, 99, "sprint")],
}


def speed_zone_distribution(speeds, sport):
    """Porcentaje de muestras en cada zona de velocidad del deporte."""
    zones = SPEED_ZONES.get(sport, SPEED_ZONES["general"])
    total = len(speeds)
    if total == 0:
        return {}
    out = {}
    for lo, hi, name in zones:
        count = sum(1 for s in speeds if lo <= s < hi)
        if count:
            out[name] = round(count / total * 100, 1)
    return out


def top_speed_label(sport, speed_mps):
    """Etiqueta cualitativa para una velocidad dada en el contexto del deporte."""
    zones = SPEED_ZONES.get(sport, SPEED_ZONES["general"])
    for lo, hi, name in zones:
        if lo <= speed_mps < hi:
            return name
    return zones[-1][2]


# ── Perfiles ──

class SportProfile:
    def __init__(self, sport, mode, expected_players, player_label, unit_note):
        self.sport = sport
        self.mode = mode  # "solo" | "team" | "auto"
        self.expected_players = expected_players  # None si no aplica
        self.player_label = player_label
        self.unit_note = unit_note

    def resolve_mode(self, player_count):
        """
        Decide el modo según el deporte.

        `general` es siempre individual: el usuario sube SU video de ejercicio.
        Que YOLO vea a otras personas en el gimnasio de fondo no convierte el
        video en un deporte de equipo. Para los deportes declarados el modo es
        fijo; `auto` queda solo para etiquetas desconocidas.
        """
        if self.mode != "auto":
            return self.mode
        return "team" if player_count >= 6 else "solo"


PROFILES = {
    "general": SportProfile("general", "solo", 1, "persona", "actividad individual"),
    "futbol": SportProfile("futbol", "team", 22, "jugador", "partido"),
    "padel": SportProfile("padel", "team", 4, "jugador", "partido/set"),
    "voleibol": SportProfile("voleibol", "team", 12, "jugador", "set"),
    "baloncesto": SportProfile("baloncesto", "team", 10, "jugador", "partido"),
}


def get_profile(sport):
    return PROFILES.get(sport, PROFILES["general"])


# ── Métricas de equipo ──

def compute_team_metrics(tracking_data, sport, scale=None):
    """
    Métricas de equipo con sentido deportivo: posesión por cercanía al balón,
    compactación del bloque (largo/ancho), altura de la línea, esfuerzo agregado.

    `scale` es la escala metros/pixel derivada de la altura de las personas. Sin
    calibración de cancha (homografía), las velocidades y distancias de equipo
    son relativamente comparables entre jugadores del mismo video pero no
    absolutas: se marca para que nadie las lea como exactas.
    """
    frames = tracking_data.get("frames", [])
    players = tracking_data.get("players", [])
    if not frames:
        return {}

    # Velocidades de todos los jugadores reales
    all_speeds = []
    for fd in frames:
        for p in fd.get("players", []):
            s = p.get("speed_mps", 0)
            if s > 0:
                all_speeds.append(s)

    # Compactación: dispersión de los centros por frame
    frame_width = tracking_data.get("video", {}).get("width", 1920) or 1920
    frame_height = tracking_data.get("video", {}).get("height", 1080) or 1080
    spreads = []
    widths = []
    heights = []
    for fd in frames:
        centers = [p["center"] for p in fd.get("players", [])]
        if len(centers) < 3:
            continue
        xs = [c[0] for c in centers]
        ys = [c[1] for c in centers]
        spreads.append(float(np.std(xs + ys)))
        widths.append(max(xs) - min(xs))
        heights.append(max(ys) - min(ys))

    # Posesión: fracción de frames en los que el equipo más cercano al balón cambia
    ball_frames = [fd for fd in frames if fd.get("ball")]
    possession_shifts = 0
    prev = None
    for fd in ball_frames:
        ball = fd["ball"]["center"]
        best, best_d = None, float("inf")
        for p in fd.get("players", []):
            d = math.hypot(p["center"][0] - ball[0], p["center"][1] - ball[1])
            if d < best_d:
                best_d, best = d, p.get("team", 0)
        if best is not None and best != prev:
            if prev is not None:
                possession_shifts += 1
            prev = best

    # Distancia y esfuerzo agregados
    total_distance = sum(p.get("total_distance_m", 0) for p in players)
    top_speed = max((p.get("max_speed_mps", 0) for p in players), default=0)
    active = [p for p in players if p.get("total_distance_m", 0) > 0]

    duration_s = tracking_data.get("video", {}).get("duration_s", 0)

    return {
        "player_count": len(players),
        "player_label": "jugadores",
        "avg_speed_mps": round(_mean(all_speeds), 2),
        "team_top_speed_mps": round(top_speed, 2),
        "team_top_speed_zone": top_speed_label(sport, top_speed),
        "team_total_distance_m": round(total_distance, 1),
        "distance_per_player_m": round(_safe_div(total_distance, len(active)), 1),
        "speed_zones": speed_zone_distribution(all_speeds, sport),
        "sprint_samples_pct": round(
            _safe_div(sum(1 for s in all_speeds if s >= _sprint_threshold(sport)), len(all_speeds)) * 100, 1
        ) if all_speeds else 0,
        "block_compactness": round(_mean(spreads), 1) if spreads else None,
        "block_width_px": round(_mean(widths), 1) if widths else None,
        "block_height_px": round(_mean(heights), 1) if heights else None,
        "ball_frames": len(ball_frames),
        "ball_tracked_pct": round(_safe_div(len(ball_frames), len(frames)) * 100, 1),
        "possession_shifts": possession_shifts,
        "duration_s": round(duration_s, 1),
        "active_players": len(active),
        # Transparencia de calibración: sin homografía de cancha, estas cifras
        # son comparables dentro del video pero no absolutas.
        "speed_basis": "pitch_assumption" if not scale else "person_height_reference",
        "speed_absolute": bool(scale),
    }


def _sprint_threshold(sport):
    thresholds = {"futbol": 5.5, "baloncesto": 5.0, "padel": 3.2, "voleibol": 3.0, "general": 3.5}
    return thresholds.get(sport, 3.5)


# ── Métricas individuales enriquecidas ──

def compute_solo_metrics(tracking_data, solo, sport):
    """
    Enriquece el análisis individual con datos que el solo_activity básico no
    calcula: tendencia de intensidad (¿se cansa?), intervalos de descanso,
    ratio trabajo/descanso y regularidad del ritmo a lo largo del tiempo.
    """
    frames = tracking_data.get("frames", [])
    if not frames:
        return {}

    primary_id = tracking_data.get("summary", {}).get("primary_player_id")
    duration_s = tracking_data.get("video", {}).get("duration_s", 0)

    # Serie temporal de velocidad del protagonista
    series = []
    for fd in frames:
        for p in fd.get("players", []):
            if primary_id is None or p["id"] == primary_id:
                series.append((fd["time_s"], p.get("speed_mps", 0)))

    if len(series) < 5:
        return {"reason": "insufficient_data"}

    n = len(series)
    third = max(1, n // 3)
    first = [s for _, s in series[:third]]
    mid = [s for _, s in series[third:2 * third]]
    last = [s for _, s in series[-third:]]

    first_avg, last_avg = _mean(first), _mean(last)

    # Tendencia: ¿la intensidad sube, baja o se mantiene?
    if first_avg > 0:
        change_pct = (last_avg - first_avg) / first_avg * 100
    else:
        change_pct = 0.0

    if change_pct < -15:
        trend = "descendente"
    elif change_pct > 15:
        trend = "ascendente"
    else:
        trend = "estable"

    # Intervalos de descanso: tramos donde la velocidad cae cerca de cero
    speeds = [s for _, s in series]
    rest_threshold = max(0.2, _mean(speeds) * 0.25)
    rest_segments = []
    run_start = None
    for t, s in series:
        if s < rest_threshold:
            if run_start is None:
                run_start = t
        else:
            if run_start is not None:
                rest_segments.append((run_start, t - run_start))
                run_start = None
    if run_start is not None:
        rest_segments.append((run_start, series[-1][0] - run_start))

    # Solo descansos de al menos 1 segundo
    real_rests = [(s, d) for s, d in rest_segments if d >= 1.0]
    total_rest = sum(d for _, d in real_rests)
    work_time = max(0.0, duration_s - total_rest)

    return {
        "intensity_trend": trend,
        "intensity_change_pct": round(change_pct, 1),
        "first_segment_speed_mps": round(first_avg, 2),
        "last_segment_speed_mps": round(last_avg, 2),
        "middle_segment_speed_mps": round(_mean(mid), 2),
        "rest_periods": len(real_rests),
        "total_rest_s": round(total_rest, 1),
        "work_time_s": round(work_time, 1),
        "work_rest_ratio": round(_safe_div(work_time, total_rest), 2) if total_rest > 0 else None,
        "avg_rest_s": round(_mean([d for _, d in real_rests]), 1) if real_rests else 0,
        "samples_analyzed": len(series),
    }


# ── Resumen narrativo ──

def build_solo_insights(sport, solo, extra):
    """Texto legible con lo que realmente muestra el video."""
    parts = []
    intensity = (solo or {}).get("intensity", {}) or {}
    rhythm = (solo or {}).get("rhythm", {}) or {}
    reps = (solo or {}).get("repetitions", {}) or {}

    level = intensity.get("level")
    if level and level not in ("unknown", "rest"):
        parts.append(f"Intensidad {top_speed_label(sport, intensity.get('score', 0) / 25)}" if False else f"Intensidad {level.replace('_', ' ')}")

    if extra.get("intensity_trend"):
        parts.append(f"tendencia {extra['intensity_trend']} ({extra.get('intensity_change_pct', 0):+.0f}%)")

    if rhythm.get("rhythm_detected"):
        rpm = rhythm.get("frequency_rpm", 0)
        cons = rhythm.get("consistency", 0)
        parts.append(f"ritmo {rpm:.0f} RPM con {cons * 100:.0f}% de consistencia")

    if reps.get("repetitions_detected"):
        parts.append(f"{reps['count']} repeticiones")

    if extra.get("rest_periods"):
        parts.append(f"{extra['rest_periods']} pausas de descanso ({extra.get('total_rest_s', 0):.0f}s)")

    if extra.get("work_rest_ratio"):
        parts.append(f"ratio trabajo/descanso {extra['work_rest_ratio']}")

    if not parts:
        return "Se detectó actividad individual en el video."

    text = "Análisis del sujeto: " + ", ".join(parts) + "."
    return text


def build_team_insights(sport, m):
    """Texto legible del análisis de equipo."""
    if not m:
        return "Análisis de equipo completado."
    parts = [f"{m.get('player_count', 0)} jugadores rastreados"]
    if m.get("team_top_speed_mps"):
        parts.append(f"velocidad máxima {m['team_top_speed_mps']} m/s ({m.get('team_top_speed_zone', '')})")
    if m.get("distance_per_player_m"):
        parts.append(f"{m['distance_per_player_m']} m por jugador")
    if m.get("sprint_samples_pct"):
        parts.append(f"{m['sprint_samples_pct']}% del tiempo en sprint")
    if m.get("ball_tracked_pct"):
        parts.append(f"balón visible {m['ball_tracked_pct']}% del video")
    if m.get("possession_shifts"):
        parts.append(f"{m['possession_shifts']} cambios de cercanía al balón")

    text = "Análisis del equipo: " + ", ".join(parts) + "."

    # Sin homografía de cancha las velocidades son relativas, no absolutas.
    if not m.get("speed_absolute"):
        text += " Velocidades estimadas sin calibración de cancha: compará entre jugadores, no contra valores absolutos."
    if not m.get("ball_tracked_pct"):
        text += " No se detectó el balón, así que las métricas de posesión no aplican."
    return text
