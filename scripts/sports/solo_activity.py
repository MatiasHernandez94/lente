#!/usr/bin/env python3
"""
Análisis de actividad individual: ejercicio, fitness, movimiento solo.
Detecta ritmo, intensidad, patrones de movimiento, consistencia.
Entrada: JSON de tracking
Salida: JSON con métricas relevantes para actividad individual.
"""

import json
import math
import numpy as np


def analyze_movement_rhythm(positions, timestamps, scale=None):
    """
    Detect rhythmic movement patterns (jumping, running in place, etc.)
    by analyzing vertical position oscillation frequency.
    """
    if len(positions) < 10:
        return {"rhythm_detected": False, "reason": "insufficient_data"}

    # Extract vertical component (y axis — note: in image coords, y increases downward)
    ys = [p[1] for p in positions]
    ts = timestamps

    # Detrend: remove overall motion to isolate oscillation
    if len(ys) > 2:
        coeffs = np.polyfit(ts, ys, 1)
        trend = np.polyval(coeffs, ts)
        ys_detrended = np.array(ys) - trend
    else:
        ys_detrended = np.array(ys)

    # Find zero crossings as oscillation peaks
    mean_y = float(np.mean(ys_detrended))
    crossings = []
    for i in range(1, len(ys_detrended)):
        if (ys_detrended[i - 1] - mean_y) * (ys_detrended[i] - mean_y) < 0:
            crossings.append(i)

    if len(crossings) < 4:
        return {"rhythm_detected": False, "reason": "no_clear_oscillation"}

    # Period between crossings (half-cycles)
    periods = np.diff(crossings)
    # Convert to time
    period_times = []
    for i in range(len(periods)):
        idx1 = crossings[i]
        idx2 = crossings[i + 1] if i + 1 < len(crossings) else len(ts) - 1
        if idx2 < len(ts) and idx1 < len(ts):
            dt = ts[idx2] - ts[idx1]
            if dt > 0:
                period_times.append(dt)

    if not period_times:
        return {"rhythm_detected": False, "reason": "cannot_compute_period"}

    # Los cruces por cero son MEDIOS ciclos: un salto completo es subir y bajar,
    # o sea dos cruces. Reportar la frecuencia de los cruces duplicaría el ritmo
    # real (278 "RPM" para alguien que salta 139 veces por minuto).
    avg_half_period = float(np.mean(period_times))
    full_period = avg_half_period * 2.0
    frequency_hz = 1.0 / full_period if full_period > 0 else 0
    frequency_rpm = frequency_hz * 60

    # Consistency: coefficient of variation of periods
    cv = float(np.std(period_times)) / avg_half_period if avg_half_period > 0 else 1.0
    consistency = max(0.0, 1.0 - cv)

    # Amplitude of oscillation
    amplitude_px = float(np.max(ys_detrended) - np.min(ys_detrended))

    result = {
        "rhythm_detected": True,
        "frequency_hz": round(frequency_hz, 2),
        "frequency_rpm": round(frequency_rpm, 1),
        "avg_period_s": round(full_period, 3),
        "half_cycle_period_s": round(avg_half_period, 3),
        "consistency": round(consistency, 3),
        "oscillation_amplitude_px": round(amplitude_px, 1),
        "oscillation_peaks": len(crossings),
    }
    if scale:
        result["oscillation_amplitude_m"] = round(amplitude_px * scale, 3)
    return result


def analyze_intensity(positions, timestamps, speeds, scale=None):
    """
    Analyze exercise intensity based on movement speed and displacement.

    `speed_mps` viene del pipeline de tracking. Si no hay escala real
    (metros/pixel) el valor es una aproximación pixel-based y se marca como tal:
    mejor decir "aproximado" que inventar un número con aire de precisión.
    """
    if not speeds:
        return {"level": "unknown", "score": 0}

    active_speeds = [s for s in speeds if s > 0.1]
    if not active_speeds:
        return {"level": "rest", "score": 0}

    avg_speed = float(np.mean(active_speeds))
    max_speed = float(np.max(active_speeds))
    active_ratio = len(active_speeds) / len(speeds) if speeds else 0

    # Zonas de esfuerzo
    very_high = sum(1 for s in active_speeds if s > 3.0) / len(active_speeds)
    high = sum(1 for s in active_speeds if 2.0 < s <= 3.0) / len(active_speeds)
    moderate = sum(1 for s in active_speeds if 1.0 < s <= 2.0) / len(active_speeds)
    low = sum(1 for s in active_speeds if s <= 1.0) / len(active_speeds)

    # Intensity score 0-100
    score = 0
    score += min(30, avg_speed * 10)
    score += min(20, very_high * 40)
    score += min(15, high * 30)
    score += active_ratio * 15
    score = min(100, score)

    level = "low"
    if score > 70:
        level = "very_high"
    elif score > 50:
        level = "high"
    elif score > 30:
        level = "moderate"

    result = {
        "level": level,
        "score": round(score, 1),
        "avg_speed_mps": round(avg_speed, 2),
        "max_speed_mps": round(max_speed, 2),
        "active_time_ratio": round(active_ratio, 3),
        "speed_zones": {
            "very_high_pct": round(very_high * 100, 1),
            "high_pct": round(high * 100, 1),
            "moderate_pct": round(moderate * 100, 1),
            "low_pct": round(low * 100, 1),
        },
    }
    if scale:
        result["scale_meters_per_pixel"] = round(scale, 5)
        result["speed_basis"] = "person_height_reference"
    else:
        result["speed_basis"] = "approximate"
    return result


def analyze_movement_pattern(positions, timestamps):
    """
    Classify the type of movement: stationary, linear, circular, oscillating, erratic.
    """
    if len(positions) < 5:
        return {"pattern": "unknown", "details": {}}

    # Calculate displacement
    total_distance = 0
    for i in range(1, len(positions)):
        dx = positions[i][0] - positions[i - 1][0]
        dy = positions[i][1] - positions[i - 1][1]
        total_distance += math.sqrt(dx * dx + dy * dy)

    # Bounding box
    xs = [p[0] for p in positions]
    ys = [p[1] for p in positions]
    bbox_width = max(xs) - min(xs)
    bbox_height = max(ys) - min(ys)
    bbox_area = bbox_width * bbox_height

    # Displacement ratio: how much of the bbox was traversed
    displacement = math.sqrt(
        (positions[-1][0] - positions[0][0]) ** 2 +
        (positions[-1][1] - positions[0][1]) ** 2
    )
    displacement_ratio = displacement / total_distance if total_distance > 0 else 0

    # Circularity: how much does the path loop back
    path_efficiency = displacement / total_distance if total_distance > 0 else 0

    # Stationarity
    is_stationary = bbox_area < 5000  # pixels²

    if is_stationary:
        pattern = "stationary"
    elif path_efficiency > 0.7:
        pattern = "linear"
    elif path_efficiency > 0.3:
        pattern = "moderate_movement"
    else:
        pattern = "oscillating"

    return {
        "pattern": pattern,
        "details": {
            "total_distance_px": round(total_distance, 1),
            "displacement_px": round(displacement, 1),
            "path_efficiency": round(path_efficiency, 3),
            "bbox_width_px": round(bbox_width, 1),
            "bbox_height_px": round(bbox_height, 1),
            "stationary": is_stationary,
        },
    }


def detect_repetitions(speeds, timestamps, scale=None, rhythm=None):
    """
    Detect repetitive motions (jumps, strokes, etc.).

    Si el análisis de ritmo encontró una oscilación vertical clara, cada ciclo
    completo es una repetición: es más fiable que buscar picos de velocidad,
    que se pierden cuando el movimiento es simétrico (subir y bajar a la misma
    velocidad no produce picos).
    """
    if rhythm and rhythm.get("rhythm_detected"):
        # Cada dos cruces por cero = un ciclo completo (subida + bajada).
        cycles = rhythm.get("oscillation_peaks", 0) // 2
        if cycles >= 2:
            # `avg_period_s` ya viene en ciclos completos.
            full_period = rhythm.get("avg_period_s", 0)
            freq_rpm = round(60.0 / full_period, 1) if full_period > 0 else 0
            return {
                "repetitions_detected": True,
                "count": cycles,
                "source": "vertical_oscillation",
                "avg_interval_s": round(full_period, 3),
                "rhythm_consistency": rhythm.get("consistency", 0),
                "frequency_hz": rhythm.get("frequency_hz", 0),
                "frequency_rpm": freq_rpm,
            }

    if len(speeds) < 10:
        return {"repetitions_detected": False, "count": 0}

    # Find peaks in speed signal
    mean_speed = float(np.mean(speeds))
    std_speed = float(np.std(speeds))
    threshold = mean_speed + 0.5 * std_speed

    peaks = []
    for i in range(1, len(speeds) - 1):
        if speeds[i] > threshold and speeds[i] > speeds[i - 1] and speeds[i] > speeds[i + 1]:
            if not peaks or (timestamps[i] - timestamps[peaks[-1]]) >= 0.3:
                peaks.append(i)

    if len(peaks) < 3:
        return {"repetitions_detected": False, "count": len(peaks), "reason": "too_few_peaks"}

    # Rhythm consistency between peaks
    peak_times = [timestamps[p] for p in peaks]
    intervals = np.diff(peak_times)
    avg_interval = float(np.mean(intervals))
    cv_interval = float(np.std(intervals)) / avg_interval if avg_interval > 0 else 1.0

    return {
        "repetitions_detected": True,
        "count": len(peaks),
        "source": "speed_peaks",
        "avg_interval_s": round(avg_interval, 3),
        "rhythm_consistency": round(max(0, 1 - cv_interval), 3),
        "frequency_hz": round(1.0 / avg_interval, 2) if avg_interval > 0 else 0,
        "frequency_rpm": round(60.0 / avg_interval, 1) if avg_interval > 0 else 0,
    }


def run_solo_analysis(tracking_data):
    """Main solo activity analysis pipeline."""
    frames = tracking_data.get("frames", [])
    print(f"[Solo] Analyzing {len(frames)} frames for individual activity...")

    # Aggregate data across frames
    all_positions = []
    all_timestamps = []
    all_speeds = []

    player_frames = {}
    for fd in frames:
        for p in fd["players"]:
            pid = p["id"]
            if pid not in player_frames:
                player_frames[pid] = {
                    "positions": [], "timestamps": [], "speeds": [], "bbox_area_sum": 0.0,
                }
            player_frames[pid]["positions"].append(p["center"])
            player_frames[pid]["timestamps"].append(fd["time_s"])
            player_frames[pid]["speeds"].append(p.get("speed_mps", 0))
            bbox = p.get("bbox")
            if bbox and len(bbox) == 4:
                player_frames[pid]["bbox_area_sum"] += max(0.0, (bbox[2] - bbox[0])) * max(0.0, (bbox[3] - bbox[1]))

    if not player_frames:
        return {
            "activity_detected": False,
            "reason": "no_person_detected",
            "rhythm": {},
            "intensity": {"level": "unknown", "score": 0},
            "movement": {"pattern": "unknown"},
            "repetitions": {"repetitions_detected": False, "count": 0},
        }

    # El protagonista ya fue elegido por el tracking (presencia + área, tras
    # filtrar artefactos). Recalcularlo acá -con datos crudos que todavía
    # incluyen pósters y reflejos- volvía a elegir al falso positivo más grande.
    primary_pid = len(player_frames) > 1 and tracking_data.get("summary", {}).get("primary_player_id")
    if primary_pid is None or primary_pid is False or primary_pid not in player_frames:
        # Fallback: el más prominente por área media de bbox.
        if len(player_frames) > 1:
            primary_pid = max(
                player_frames,
                key=lambda k: player_frames[k]["bbox_area_sum"] / max(1, len(player_frames[k]["positions"])),
            )
        else:
            primary_pid = next(iter(player_frames))
    primary = player_frames[primary_pid]

    # Escala real (metros/pixel) derivada de la altura del propio sujeto. Sin
    # ella, distancia y velocidad salen en píxeles de video y no significan nada.
    scale = (tracking_data.get("scale") or {}).get("meters_per_pixel")

    # Las velocidades que vienen del tracking están calibradas contra una cancha
    # de fútbol (ancho del frame = 68 m). En un video vertical de gimnasio eso
    # inventa 8 m/s para alguien saltando la cuerda. Si tenemos escala real, se
    # recalculan desde las posiciones; si no, se marcan como aproximadas.
    if scale:
        positions_px = primary["positions"]
        timestamps_s = primary["timestamps"]
        speeds_calc = []
        for i in range(1, len(positions_px)):
            dt = timestamps_s[i] - timestamps_s[i - 1]
            if dt <= 0:
                continue
            dx = positions_px[i][0] - positions_px[i - 1][0]
            dy = positions_px[i][1] - positions_px[i - 1][1]
            speeds_calc.append(math.hypot(dx, dy) * scale / dt)
        if len(speeds_calc) >= 3:
            primary = dict(primary)
            primary["speeds"] = speeds_calc

    # Run analyses
    rhythm = analyze_movement_rhythm(primary["positions"], primary["timestamps"], scale)
    intensity = analyze_intensity(primary["positions"], primary["timestamps"], primary["speeds"], scale)
    movement = analyze_movement_pattern(primary["positions"], primary["timestamps"])
    repetitions = detect_repetitions(primary["speeds"], primary["timestamps"], scale, rhythm)

    # Summary
    total_distance = sum(
        p.get("distance_m", 0)
        for fd in frames
        for p in fd["players"]
        if p["id"] == primary_pid
    )

    duration = frames[-1]["time_s"] - frames[0]["time_s"] if len(frames) > 1 else 0

    output = {
        "activity_detected": True,
        "primary_person_id": primary_pid,
        # Personas reales tras filtrar artefactos, no tracks brutos: en un
        # gimnasio con espejos la cuenta cruda incluía pósters como "gente".
        "total_persons": tracking_data.get("summary", {}).get(
            "total_players_detected", len(player_frames)
        ),
        "duration_s": round(duration, 1),
        "total_distance_m": round(total_distance, 2),
        "rhythm": rhythm,
        "intensity": intensity,
        "movement": movement,
        "repetitions": repetitions,
        "summary": _build_summary(rhythm, intensity, movement, repetitions),
    }

    print(f"\n[Solo] Activity detected: {intensity['level']} intensity")
    print(f"[Solo] Rhythm: {rhythm.get('frequency_rpm', 'N/A')} RPM")
    print(f"[Solo] Repetitions: {repetitions.get('count', 0)}")
    print(f"[Solo] Movement: {movement['pattern']}")

    return output


def _build_summary(rhythm, intensity, movement, repetitions):
    """Build human-readable summary."""
    parts = []

    if intensity.get("level") in ("high", "very_high"):
        parts.append(f"Intensidad {intensity['level'].replace('_', ' ')}")
    elif intensity.get("level") == "moderate":
        parts.append("Intensidad moderada")

    if rhythm.get("rhythm_detected"):
        rpm = rhythm.get("frequency_rpm", 0)
        if rpm > 0:
            parts.append(f"Ritmo estable de {rpm:.0f} RPM")

    if repetitions.get("repetitions_detected"):
        count = repetitions.get("count", 0)
        parts.append(f"{count} repeticiones detectadas")

    pattern = movement.get("pattern", "unknown")
    if pattern == "stationary":
        parts.append("Movimiento en zona fija")
    elif pattern == "oscillating":
        parts.append("Movimiento oscilatorio")

    return " · ".join(parts) if parts else "Actividad detectada"
