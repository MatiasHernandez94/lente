#!/usr/bin/env python3
"""
Fase: Análisis biomecánico individual con MediaPipe Pose (modo "solo").

Es un análisis POR SEPARADO del tracking de equipo (YOLO). No comparte
coordenadas ni umbralos con `detect_players.py`: acá el sujeto es UNA persona,
el objetivo es técnica de ejecución (rango, simetría, ritmo, postura), y se
trabaja con landmarks de pose, no con cajas.

Cómo funciona:
  1. Muestrea el video a un fps alto (default 15, no los 5 fps del equipo):
     las articulaciones se mueven rápido y a 5 fps se pierde el keyframe.
  2. Corre MediaPipe Pose (Tasks API, streaming VIDEO).
  3. Segmenta repeticiones por ciclo de flexión/extensión de rodilla, y en
     cada repetición toma el FRAME DE MÁXIMA FLEXIÓN (el keyframe) en el que
     realmente pasan los problemas técnicos.
  4. Clasifica la vista de cámara (frontal / lateral / diagonal) y SOLO emite
     las alertas válidas para esa vista: un valgo de rodilla no se puede ver
     de perfil, y una flexión de profundidad no se ve de frente.
  5. Devuelve `advertencias[]` con severidad + `metrics[]` + `limitations[]`
     listo para inyectar al agente IA (mismo shape que `sport_specific`).

Límites honestos (van a `limitations`):
  - MediaPipe entrega landmarks 2D. Las distancias/ángulos son proyectados:
    sólo son confiables si la cámara está bastante perpendicular al plano del
    movimiento. Si el sujeto está de costado y mirando a la cámara, los
    resultados son dudosos y se baja `confidence`.
  - No hay modelo de columna lumbar: el "redondeo lumbar" se aproxima con
    inclinación de tronco (hombros-caderas) y se rotula como aproximación.

Uso:
  python biomechanics.py <video.mp4> [--output biomech.json] [--fps 15]
"""

import argparse
import json
import math
import os
import sys
import urllib.request
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np

# ---------------------------------------------------------------------------
# Disponibilidad de MediaPipe y modelo
# ---------------------------------------------------------------------------

MEDIAPIPE_AVAILABLE = True
_MP_IMPORT_ERROR = None
try:
    import mediapipe as mp
    from mediapipe.tasks.python import BaseOptions
    from mediapipe.tasks.python import vision as mp_vision
except Exception as exc:  # pragma: no cover - depende del entorno
    MEDIAPIPE_AVAILABLE = False
    _MP_IMPORT_ERROR = str(exc)

MODEL_DIR = Path(__file__).resolve().parent / "models"
MODEL_NAME = os.environ.get("POSE_MODEL_FILE", "pose_landmarker_full.task")
MODEL_PATH = MODEL_DIR / MODEL_NAME
# float16 ~9 MB. Se descarga la primera vez que se usa (misma convención que
# los pesos de YOLO, que tampoco van al repo).
MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
    f"{MODEL_NAME.replace('.task', '')}/float16/latest/{MODEL_NAME}"
)

# ---------------------------------------------------------------------------
# Constantes biomecánicas
# ---------------------------------------------------------------------------

BIOMECH_FPS = 15            # fps del muestreo de pose (independiente de YOLO)
VISIBILITY_MIN = 0.5        # landmarks por debajo de esto se ignoran

# Repetición: entro en flexión por debajo de FLEX_DOWN, salgo por encima de
# FLEX_UP (histéresis para no trocear por el ruido de un solo frame).
FLEX_DOWN_DEG = 110.0
FLEX_UP_DEG = 150.0
MIN_CYCLE_SECONDS = 0.35

# Umbrales de alerta (constantes en código, no en el prompt: si la IA cambia
# de humor no puede cambiar un umbral).
LEAN_MAX_DEG = 45.0         # inclinación de tronco respecto de la vertical
RANGE_MIN_DEG = 85.0        # flexión mínima de rodilla para considerar "hondo"
ASYM_TOL_DEG = 15.0         # diferencia L/R de ángulo de rodilla en keyframe
TEMPO_MAX_S = 0.45          # repetición más rápida que esto: control escaso
VALGUS_TOL_RATIO = 0.02     # rodilla dentro del tobillo por este margen (ancho)

# Índices de landmarks de MediaPipe Pose (33 puntos)
LEFT_SHOULDER, RIGHT_SHOULDER = 11, 12
LEFT_HIP, RIGHT_HIP = 23, 24
LEFT_KNEE, RIGHT_KNEE = 25, 26
LEFT_ANKLE, RIGHT_ANKLE = 27, 28
LEFT_HEEL, RIGHT_HEEL = 29, 30
LEFT_FOOT_INDEX, RIGHT_FOOT_INDEX = 31, 32

LEFT_SIDE = (LEFT_SHOULDER, LEFT_HIP, LEFT_KNEE, LEFT_ANKLE, LEFT_HEEL, LEFT_FOOT_INDEX)
RIGHT_SIDE = (RIGHT_SHOULDER, RIGHT_HIP, RIGHT_KNEE, RIGHT_ANKLE, RIGHT_HEEL, RIGHT_FOOT_INDEX)


# ---------------------------------------------------------------------------
# Modelo
# ---------------------------------------------------------------------------

def ensure_model(force_download=False):
    """Descarga el modelo .task si falta. Devuelve la ruta o None."""
    if not MEDIAPIPE_AVAILABLE:
        return None
    if MODEL_PATH.exists() and not force_download:
        return MODEL_PATH
    try:
        MODEL_DIR.mkdir(parents=True, exist_ok=True)
        tmp = MODEL_PATH.with_suffix(".tmp")
        urllib.request.urlretrieve(MODEL_URL, tmp)
        os.replace(tmp, MODEL_PATH)
        print(f"  Modelo Pose descargado: {MODEL_PATH.name}")
        return MODEL_PATH
    except Exception as exc:  # pragma: no cover - red
        print(f"  [warn] No se pudo descargar el modelo Pose: {exc}")
        return None


def _create_landmarker():
    """Instancia PoseLandmarker en modo VIDEO (streaming)."""
    options = mp_vision.PoseLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=str(MODEL_PATH)),
        running_mode=mp_vision.RunningMode.VIDEO,
        num_poses=1,
        min_pose_detection_confidence=0.5,
        min_pose_presence_confidence=0.5,
        min_tracking_confidence=0.5,
    )
    return mp_vision.PoseLandmarker.create_from_options(options)


# ---------------------------------------------------------------------------
# Geometría
# ---------------------------------------------------------------------------

def angle_deg(a, b, c):
    """Ángulo interior (grados) en el vértice b, entre los vectores b->a y b->c."""
    if None in (a, b, c):
        return None
    v1 = (a[0] - b[0], a[1] - b[1])
    v2 = (c[0] - b[0], c[1] - b[1])
    norm = math.hypot(*v1) * math.hypot(*v2)
    if norm == 0:
        return None
    cosv = max(-1.0, min(1.0, (v1[0] * v2[0] + v1[1] * v2[1]) / norm))
    return math.degrees(math.acos(cosv))


def _pt(landmarks, idx, w, h):
    """Punto en píxeles si el landmark es visible, si no None."""
    if landmarks is None or idx >= len(landmarks):
        return None
    lm = landmarks[idx]
    if getattr(lm, "visibility", 1.0) < VISIBILITY_MIN:
        return None
    return (lm.x * w, lm.y * h)


def knee_flexion(landmarks, w, h, side):
    """Ángulo de rodilla (cadera-rodilla-tobillo). 180 = pierna estirada."""
    hip, knee, ankle = side[1], side[2], side[3]
    return angle_deg(_pt(landmarks, hip, w, h), _pt(landmarks, knee, w, h), _pt(landmarks, ankle, w, h))


def trunk_lean(landmarks, w, h):
    """Inclinación del tronco respecto de la vertical (0 = erguido).

    Se approxima con el vector hombro-medio de caderas. No es un modelo de
    columna: sirve para detectar "se tira hacia adelante" en sentadilla.
    """
    ls, rs = _pt(landmarks, LEFT_SHOULDER, w, h), _pt(landmarks, RIGHT_SHOULDER, w, h)
    lh, rh = _pt(landmarks, LEFT_HIP, w, h), _pt(landmarks, RIGHT_HIP, w, h)
    if None in (ls, rs, lh, rh):
        return None
    mid_shoulder = ((ls[0] + rs[0]) / 2, (ls[1] + rs[1]) / 2)
    mid_hip = ((lh[0] + rh[0]) / 2, (lh[1] + rh[1]) / 2)
    dx = mid_shoulder[0] - mid_hip[0]
    dy = mid_hip[1] - mid_shoulder[1]  # hacia arriba
    return abs(math.degrees(math.atan2(dx, dy)))


def ankle_dorsiflexion(landmarks, w, h, side):
    """Ángulo tobillo (rodilla-tobillo-punta del pie). Menor = más dorsal."""
    knee, ankle, foot = side[2], side[3], side[5]
    return angle_deg(_pt(landmarks, knee, w, h), _pt(landmarks, ankle, w, h), _pt(landmarks, foot, w, h))


def classify_view(landmarks, w, h):
    """Clasifica la cámara según la apariencia del sujeto.

    Ancho de hombros / largo de torso en píxeles:
      - grande  -> se ve el ancho: cámara frontal (sirve para valgo)
      - chico   -> el sujeto está de perfil: sirve para profundidad y lean
    """
    ls, rs = _pt(landmarks, LEFT_SHOULDER, w, h), _pt(landmarks, RIGHT_SHOULDER, w, h)
    lh, rh = _pt(landmarks, LEFT_HIP, w, h), _pt(landmarks, RIGHT_HIP, w, h)
    if None in (ls, rs, lh, rh):
        return "desconocida"
    shoulder_w = abs(ls[0] - rs[0])
    torso_len = math.hypot((ls[0] + rs[0]) / 2 - (lh[0] + rh[0]) / 2, (ls[1] + rs[1]) / 2 - (lh[1] + rh[1]) / 2)
    if torso_len <= 0:
        return "desconocida"
    ratio = shoulder_w / torso_len
    if ratio > 1.1:
        return "frontal"
    if ratio < 0.6:
        return "lateral"
    return "diagonal"


def heel_rises(landmarks, w, h, side):
    """True si el talón está claramente por encima de la punta del pie."""
    heel, foot = _pt(landmarks, side[4], w, h), _pt(landmarks, side[5], w, h)
    if heel is None or foot is None:
        return False
    return (heel[1] - foot[1]) < -0.03 * h  # Y crece hacia abajo


def knee_valgus(landmarks, w, h, side):
    """Rodilla "hacia adentro" respecto del tobillo (solo frontal).

    En 2D frontal: si la X de la rodilla cae dentro del ancho de soporte
    definido por el tobillo, la rodilla se colapsó hacia la línea media.
    """
    knee, ankle, hip = _pt(landmarks, side[2], w, h), _pt(landmarks, side[3], w, h), _pt(landmarks, side[1], w, h)
    if None in (knee, ankle, hip):
        return False
    dx = (knee[0] - ankle[0]) * np.sign(hip[0] - ankle[0] or 1.0)
    return dx < -VALGUS_TOL_RATIO * w


# ---------------------------------------------------------------------------
# Segmentación de repeticiones
# ---------------------------------------------------------------------------

def segment_reps(angles, times):
    """Segmenta repeticiones con histéresis de flexión.

    Devuelve lista de {"start": i, "keyframe": i, "end": i, "min_angle": x}.
    `keyframe` es el índice de máxima flexión del ciclo (no un sample al azar).
    """
    reps = []
    in_cycle = False
    start_idx = None
    best_idx = None
    best_angle = 180.0

    for i, angle in enumerate(angles):
        if angle is None:
            continue
        if not in_cycle and angle < FLEX_DOWN_DEG:
            in_cycle = True
            start_idx = i
            best_idx = i
            best_angle = angle
            continue
        if in_cycle:
            if angle < best_angle:
                best_angle = angle
                best_idx = i
            if angle > FLEX_UP_DEG:
                if best_idx is not None and start_idx is not None:
                    duration = times[best_idx] - times[start_idx]
                    if duration >= MIN_CYCLE_SECONDS and best_angle <= FLEX_DOWN_DEG:
                        reps.append({
                            "start": start_idx,
                            "keyframe": best_idx,
                            "end": i,
                            "min_angle": round(float(best_angle), 1),
                            "duration_s": round(float(times[i] - times[start_idx]), 2),
                        })
                in_cycle = False
                start_idx = None
                best_idx = None

    return reps


# ---------------------------------------------------------------------------
# Análisis principal
# ---------------------------------------------------------------------------

def run_biomechanics_analysis(video_path, fps=BIOMECH_FPS, progress_cb=None):
    """Análisis biomecánico de UN sujeto.

    Devuelve {"ok": bool, "biomechanics": {...}, "sport_specific": {...}}
    donde `sport_specific` es el mismo shape que emite el resto del pipeline
    para poder inyectarse en los prompts del agente IA sin código extra.
    """
    if not MEDIAPIPE_AVAILABLE:
        return {
            "ok": False,
            "error": f"MediaPipe no está disponible: {_MP_IMPORT_ERROR}",
            "biomechanics": None,
            "sport_specific": {
                "sport": "general", "mode": "biomechanics",
                "metrics": [],
                "limitations": ["MediaPipe no está instalado: no se pudo analizar la técnica individual."],
            },
        }

    if ensure_model() is None:
        return {
            "ok": False,
            "error": "No hay modelo de Pose disponible.",
            "biomechanics": None,
            "sport_specific": {
                "sport": "general", "mode": "biomechanics",
                "metrics": [],
                "limitations": ["Falta el modelo de pose: no se pudo analizar la técnica individual."],
            },
        }

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return {"ok": False, "error": f"No se pudo abrir el video {video_path}", "biomechanics": None, "sport_specific": None}

    video_fps = cap.get(cv2.CAP_PROP_FPS) or 30
    frame_step = max(1, int(video_fps / fps))
    interval_s = frame_step / video_fps
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    total_samples = max(1, total_frames // frame_step)

    landmarker = _create_landmarker()

    samples = []  # {"t": seg, "landmarks": [...], "w": int, "h": int}
    frame_idx = 0
    sample_i = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        if frame_idx % frame_step != 0:
            frame_idx += 1
            continue

        h, w = frame.shape[:2]
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mpi = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        ts_ms = int(frame_idx / video_fps * 1000)
        try:
            result = landmarker.detect_for_video(mpi, ts_ms)
        except Exception as exc:  # pragma: no cover - robustez
            print(f"  [warn] Pose falló en frame {frame_idx}: {exc}")
            result = None

        landmarks = None
        if result and result.pose_landmarks:
            landmarks = result.pose_landmarks[0]

        samples.append({
            "t": frame_idx / video_fps,
            "landmarks": landmarks,
            "w": w,
            "h": h,
        })

        sample_i += 1
        frame_idx += 1
        if progress_cb and sample_i % 25 == 0:
            progress_cb(sample_i, total_samples)

    cap.release()
    landmarker.close()

    # ------------------------------------------------------------------
    # Ángulos por muestra + segmentación
    # ------------------------------------------------------------------
    times = [s["t"] for s in samples]
    knee_angles = []
    trunk_angles = []
    dorsi_angles = []
    views = []

    for s in samples:
        lm, w, h = s["landmarks"], s["w"], s["h"]
        knee_angles.append(knee_flexion(lm, w, h, LEFT_SIDE) if lm else None)
        trunk_angles.append(trunk_lean(lm, w, h) if lm else None)
        dorsi_angles.append(ankle_dorsiflexion(lm, w, h, LEFT_SIDE) if lm else None)
        views.append(classify_view(lm, w, h) if lm else None)

    reps = segment_reps(knee_angles, times)
    detected = sum(1 for lm in samples if lm is not None)

    # Vista predominante (mayoría de las muestras con pose)
    valid_views = [v for v in views if v and v != "desconocida"]
    dominant_view = max(set(valid_views), key=valid_views.count) if valid_views else "desconocida"

    advertencias = []
    metrics = []
    limitations = []

    if detected == 0:
        limitations.append("No se detectó una persona en el encuadre con la calidad necesaria para el análisis de pose.")
        biomech = {
            "mode": "biomechanics",
            "ok": False,
            "samples": len(samples),
            "frames_with_pose": 0,
            "camera_view": dominant_view,
            "confidence": "nula",
            "reps": 0,
            "keyframes": [],
            "advertencias": [],
            "metrics": [],
            "limitations": limitations,
        }
        return {"ok": False, "biomechanics": biomech, "sport_specific": {"sport": "general", "mode": "biomechanics", "metrics": [], "limitations": limitations}}

    coverage = detected / len(samples) if samples else 0.0
    if coverage < 0.5:
        limitations.append(f"Sólo hubo pose en el {coverage:.0%} de los frames: el sujeto sale del encuadre o está muy pequeño.")

    limitations.append(
        "Los ángulos salen de landmarks 2D proyectados: son confiables sólo con la cámara "
        "casi perpendicular al plano del movimiento. Mirá el resultado como una guía, no como una medición de laboratorio."
    )
    if dominant_view in ("frontal", "diagonal"):
        limitations.append(
            "Con vista frontal/diagonal la profundidad de flexión no es exacta: priorizá las alertas de simetría y valgo."
        )
    elif dominant_view == "lateral":
        limitations.append(
            "Con vista lateral el valgo de rodilla no se puede evaluar: priorizá profundidad, inclinación de tronco y talones."
        )

    # --- Keyframes + métricas por repetición --------------------------
    keyframes = []
    knee_at_key = []
    for rep in reps:
        i = rep["keyframe"]
        s = samples[i]
        lm, w, h = s["landmarks"], s["w"], s["h"]
        knee_l = knee_flexion(lm, w, h, LEFT_SIDE)
        knee_r = knee_flexion(lm, w, h, RIGHT_SIDE)
        lean = trunk_lean(lm, w, h)
        dorsi = ankle_dorsiflexion(lm, w, h, LEFT_SIDE)
        kf = {
            "time_s": round(float(s["t"]), 2),
            "knee_angle_left": round(float(knee_l), 1) if knee_l is not None else None,
            "knee_angle_right": round(float(knee_r), 1) if knee_r is not None else None,
            "trunk_lean_deg": round(float(lean), 1) if lean is not None else None,
            "ankle_dorsiflexion_deg": round(float(dorsi), 1) if dorsi is not None else None,
            "duration_s": rep["duration_s"],
            "valgus_left": bool(knee_valgus(lm, w, h, LEFT_SIDE)) if dominant_view in ("frontal", "diagonal") else None,
            "valgus_right": bool(knee_valgus(lm, w, h, RIGHT_SIDE)) if dominant_view in ("frontal", "diagonal") else None,
            "heel_rise": bool(heel_rises(lm, w, h, LEFT_SIDE) or heel_rises(lm, w, h, RIGHT_SIDE)) if dominant_view != "frontal" else None,
        }
        keyframes.append(kf)
        if knee_l is not None:
            knee_at_key.append(knee_l)

    # --- Red flags (sólo si la vista las permite) ---------------------
    if reps:
        mean_knee = float(np.mean(knee_at_key)) if knee_at_key else None
        mean_lean = float(np.mean([k["trunk_lean_deg"] for k in keyframes if k["trunk_lean_deg"] is not None])) if keyframes else None
        mean_dur = float(np.mean([r["duration_s"] for r in reps]))

        if mean_knee is not None and mean_knee > RANGE_MIN_DEG:
            advertencias.append({
                "code": "rango_incompleto", "severity": "media", "time_s": keyframes[0]["time_s"],
                "message": f"Flexión media de rodilla {mean_knee:.0f}° (umbral {RANGE_MIN_DEG:.0f}°): no llegás a la profundidad completa. Revisá peso, movilidad de tobillo o profundidad del movimiento.",
            })
        if mean_lean is not None and mean_lean > LEAN_MAX_DEG and dominant_view in ("lateral", "diagonal"):
            advertencias.append({
                "code": "inclinacion_tronco", "severity": "media", "time_s": keyframes[0]["time_s"],
                "message": f"Inclinación de tronco {mean_lean:.0f}° (umbral {LEAN_MAX_DEG:.0f}°): te tirás hacia adelante. Activá el core y priorizá mantener el pecho arriba.",
            })
        if mean_dur < TEMPO_MAX_S:
            advertencias.append({
                "code": "ritmo_rapido", "severity": "baja", "time_s": keyframes[0]["time_s"],
                "message": f"Ritmo medio de {mean_dur:.2f}s por repetición: bajá la velocidad para controlar la técnica.",
            })
        if dominant_view in ("frontal", "diagonal"):
            valgo_reps = [k for k in keyframes if k["valgus_left"] or k["valgus_right"]]
            if len(valgo_reps) >= max(1, len(keyframes) // 2):
                advertencias.append({
                    "code": "valgo_rodilla", "severity": "alta", "time_s": valgo_reps[0]["time_s"],
                    "message": "Las rodillas colapsan hacia adentro en el punto más bajo. Reforzá glúteo medio y controlá la alineación rodilla-tobillo.",
                })
        heel_reps = [k for k in keyframes if k["heel_rise"]]
        if heel_reps:
            advertencias.append({
                "code": "talones_se_levantan", "severity": "media", "time_s": heel_reps[0]["time_s"],
                "message": "Los talones se despegan del piso en la fase baja: movilidad de tobillo limitada o técnica de apoyo incorrecta.",
            })
        diffs = [abs(k["knee_angle_left"] - k["knee_angle_right"]) for k in keyframes
                 if k["knee_angle_left"] is not None and k["knee_angle_right"] is not None]
        if diffs and float(np.mean(diffs)) > ASYM_TOL_DEG:
            advertencias.append({
                "code": "asimetria_lateral", "severity": "media", "time_s": keyframes[0]["time_s"],
                "message": f"Diferencia media de {float(np.mean(diffs)):.0f}° entre piernas: trabajá el lado débil por separado.",
            })

        metrics.extend([
            {"metric": "repeticiones_detectadas", "value": len(reps), "unit": "reps"},
            {"metric": "flexion_media_rodilla", "value": round(mean_knee, 1) if mean_knee is not None else None, "unit": "grados"},
            {"metric": "inclinacion_tronco_media", "value": round(mean_lean, 1) if mean_lean is not None else None, "unit": "grados"},
            {"metric": "duracion_media_repeticion", "value": round(mean_dur, 2), "unit": "segundos"},
        ])
    else:
        limitations.append("No se detectaron ciclos de repetición claros (el movimiento puede no ser cíclico: caminar, correr, o un solo intento).")
        metrics.append({"metric": "frames_con_pose", "value": detected, "unit": "frames"})

    metrics.append({"metric": "vista_de_camara", "value": dominant_view, "unit": ""})

    high = sum(1 for a in advertencias if a["severity"] == "alta")
    confidence = "alta" if coverage > 0.85 and reps else ("media" if coverage > 0.6 else "baja")

    biomech = {
        "mode": "biomechanics",
        "ok": True,
        "generated_at": datetime.now().isoformat(),
        "fps": fps,
        "samples": len(samples),
        "frames_with_pose": detected,
        "coverage": round(float(coverage), 3),
        "camera_view": dominant_view,
        "confidence": confidence,
        "reps": len(reps),
        "keyframes": keyframes,
        "advertencias": advertencias,
        "metrics": metrics,
        "limitations": limitations,
        "high_severity": high,
    }

    sport_specific = {
        "sport": "general",
        "mode": "biomechanics",
        "metrics": metrics,
        "limitations": limitations + [a["message"] for a in advertencias if a["severity"] == "alta"],
    }

    return {"ok": True, "biomechanics": biomech, "sport_specific": sport_specific}


def main():
    parser = argparse.ArgumentParser(description="Análisis biomecánico individual con MediaPipe Pose")
    parser.add_argument("video", help="Path al video")
    parser.add_argument("--output", "-o", help="Output JSON path")
    parser.add_argument("--fps", type=float, default=BIOMECH_FPS, help=f"fps de muestreo (default {BIOMECH_FPS})")
    args = parser.parse_args()

    def progress(done, total):
        pct = int(done / total * 100) if total else 0
        print(f"  Pose {done}/{total} ({pct}%)", end="\r")

    result = run_biomechanics_analysis(args.video, args.fps, progress)
    print()
    biomech = result.get("biomechanics") or {}
    print(f"\nReps: {biomech.get('reps', 0)} | Vista: {biomech.get('camera_view')} | Confianza: {biomech.get('confidence')}")
    print(f"Alertas: {len(biomech.get('advertencias', []))}")
    for a in biomech.get("advertencias", []):
        print(f"  [{a['severity'].upper()}] {a['message']}")

    if args.output:
        with open(args.output, "w") as f:
            json.dump(result, f, indent=2, default=str)
        print(f"\nGuardado en {args.output}")


if __name__ == "__main__":
    main()
