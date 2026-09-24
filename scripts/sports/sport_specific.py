#!/usr/bin/env python3
"""
Análisis específico por deporte usando los datos de tracking YOLO.
Por ahora soporta baloncesto. Cada métrica declara si se pudo calcular o no,
y si no se pudo, explica el motivo (limitation).
"""

import math

BASKETBALL = "baloncesto"


def count_ball_bounces(ball_observations, fps):
    """
    Cuenta botes/dribles de la bola por oscilación del centro vertical (Y).
    Se consideran botes cuando la bola juega con periodos de caída consistente
    entre observaciones con confianza razonable. Devuelve (count, confidence).
    """
    obs = [o for o in ball_observations if o.get("confidence", 0) >= 0.25]
    if len(obs) < 3:
        return 0, 0.0

    # Una secuencia de Y que baja y sube repetidamente = dribling.
    ys = [o["center"][1] for o in obs]
    bounces = 0
    prev_direction = None
    MIN_BOUNCE_DY = 6.0  # px de cambio vertical mínimo entre tramos

    for i in range(1, len(ys)):
        dy = ys[i] - ys[i - 1]
        direction = 1 if dy > 0 else (-1 if dy < 0 else prev_direction)
        if direction is None:
            continue
        if prev_direction is not None and direction != prev_direction and direction == 1:
            # cambio de bajada a subida → la bola volvió a subir tras tocar piso
            bounces += 1
        prev_direction = direction

    # confianza alta solo si hay suficientes tramos y logo alternancia
    alternations = sum(
        1 for i in range(2, len(ys)) if (ys[i] - ys[i - 1]) * (ys[i - 1] - ys[i - 2]) < 0
    )
    confidence = min(1.0, alternations / max(1, len(ys) - 2))
    return max(0, bounces - 1), confidence


def run_basketball_analysis(tracking_data):
    """Métricas específicas de baloncesto con limitaciones explícitas."""
    metrics = []
    limitations = []

    frames = tracking_data.get("frames", [])
    players = tracking_data.get("players", [])

    # --- Velocidad y distancia (del tracking) ---
    if players:
        speeds = [p.get("max_speed_mps", 0) for p in players]
        distances = [p.get("total_distance_m", 0) for p in players]
        metrics.append({
            "metric": "velocidad_maxima",
            "value": round(max(speeds), 2) if speeds else None,
            "unit": "m/s",
            "confidence": 1.0,
            "computed": bool(speeds),
        })
        if not speeds:
            limitations.append(
                "No se pudo calcular la velocidad máxima porque el tracking no registró "
                "posiciones suficientes de los jugadores."
            )
    else:
        limitations.append(
            "No se pudo calcular la velocidad de los jugadores porque no hay tracking de personas."
        )

    # --- Botes / dribles (oscilación vertical de la bola) ---
    ball_frames = [f for f in frames if f.get("ball")]
    balls = [{"center": f["ball"]["center"], "confidence": f["ball"].get("confidence", 0)} for f in ball_frames]

    if len(balls) >= 3:
        bounces, bounce_conf = count_ball_bounces(balls, tracking_data.get("settings", {}).get("fps", 5))
        metrics.append({
            "metric": "botes_o_dribles",
            "value": bounces,
            "unit": "botes",
            "confidence": round(bounce_conf, 2),
            "computed": True,
        })
        if bounces == 0:
            limitations.append(
                "Se detectó la bola en varios fotogramas pero no se observó un patrón de bote "
                "claro (el ángulo o la duración corta del video impiden contar dribles)."
            )
    else:
        metrics.append({
            "metric": "botes_o_dribles",
            "value": None,
            "unit": "botes",
            "confidence": 0,
            "computed": False,
        })
        limitations.append(
            "No se pudieron contar los botes/dribles: la cámara no registró la bola en "
            "suficientes fotogramas (solo {} detecciones de bola en {:.0f}s de video).".format(
                len(balls), (frames[-1].get("time_s", 0) - frames[0].get("time_s", 0)) if len(frames) > 1 else 0
            )
        )

    # --- Tiempo de posesión de la bola por jugador ---
    if players and balls:
        posesion = [0.0] * len(players)
        for f in frames:
            b = f.get("ball")
            if not b:
                continue
            plist = f.get("players", [])
            if not plist:
                continue
            # jugador más cercano dentro de un umbral razonable
            nearest = min(
                plist,
                key=lambda p: math.dist(p.get("center", (0, 0)), b["center"]),
            )
            dist = math.dist(nearest.get("center", (0, 0)), b["center"])
            if dist < 200:  # px, umbral heurístico
                posesion[nearest["id"] % len(players)] += 1.0

        total = sum(posesion)
        if total > 0:
            top_id = max(range(len(posesion)), key=lambda i: posesion[i])
            metrics.append({
                "metric": "jugador_con_mas_posesion",
                "value": str(players[top_id].get("id", top_id)),
                "unit": "spins",
                "confidence": round(posesion[top_id] / total, 2),
                "computed": True,
            })
        else:
            limitations.append("No se pudo medir la posesión de la bola porque no se la asoció a ningún jugador.")
    else:
        limitations.append(
            "No se pudo medir la posesión de la bola por jugador: faltan detecciones de bola o tracking."
        )

    # --- Bandejas / tiros a canasta ---
    # No hay detección de canasta en el pipeline actual; no podemos estimar bandejas.
    limitations.append(
        "No se pudo estimar bandejas ni tiros a canasta: el pipeline actual no detecta la "
        "canasta en el encuadre, y no hay trayectorias de la bola suficientes para inferir "
        "una bandeja con confianza."
    )

    return {
        "sport": BASKETBALL,
        "metrics": metrics,
        "limitations": limitations,
    }


def run_sport_specific_analysis(tracking_data, sport):
    """Delega al análisis específico según el deporte. Devuelve None si no hay módulo."""
    if sport == BASKETBALL:
        return run_basketball_analysis(tracking_data)
    return None