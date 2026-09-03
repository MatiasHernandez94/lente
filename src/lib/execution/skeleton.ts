import type { BodyPose, Keypoint } from "./types";

const KP = (x: number, y: number, score = 0.99): Keypoint => ({ x, y, score });

// Largos de segmento (en coords normalizadas 0-1, y crece hacia abajo).
const L = {
  pierna: 0.26,
  muslo: 0.22,
  torso: 0.3,
  brazo: 0.2,
  antebrazo: 0.18,
  cuello: 0.06,
};

interface Seg {
  x: number;
  y: number;
}

// Avanza un punto según un ángulo absoluto desde la vertical (0 = hacia abajo +y).
function seg(x: number, y: number, angleDeg: number, len: number): Seg {
  const a = (angleDeg * Math.PI) / 180;
  return { x: x + len * Math.sin(a), y: y + len * Math.cos(a) };
}

export interface LateralParams {
  kneeAngle: number; // ángulo rodilla (180 ext, <180 flex)
  hipAngle: number; // ángulo cadera (shoulder-hip-knee)
  elbowAngle: number; // ángulo codo (180 ext)
  shoulderAngle: number; // ángulo hombro (tronco-brazo)
  alignAngle: number; // alineación hombro-cadera-tobillo (180 recto)
}

/**
 * Esqueleto lateral (perfil derecho). Construye las 17 articulaciones a partir
 * de ángulos articulares, manteniendo consistencia entre extremidades.
 */
export function poseLateral(p: LateralParams): BodyPose {
  const ankle: Seg = { x: 0.5, y: 0.97 };
  const back = -1;

  // Pierna inferior casi vertical, leve inclinación por hombro/tobillo.
  const legAngle = 4;
  const knee = seg(ankle.x, ankle.y, legAngle, L.pierna);

  // Muslo: se flexiona hacia atrás según el ángulo de rodilla.
  const thighAngle = legAngle + back * (180 - p.kneeAngle) * 0.92;
  const hip = seg(knee.x, knee.y, thighAngle, L.muslo);

  // Tronco: bipedestación neutra ~ inclinación derivada de la cadera.
  const torsoLean = (180 - p.hipAngle) * 0.55;
  const torsoAngle = thighAngle + back * torsoLean;
  const shoulder = seg(hip.x, hip.y, torsoAngle, L.torso);

  const nose = seg(shoulder.x, shoulder.y, torsoAngle, L.cuello);

  // Brazo: según hombro y codo.
  const armAngle = torsoAngle + back * (180 - p.shoulderAngle) * 0.6;
  const elbow = seg(shoulder.x, shoulder.y, armAngle, L.brazo);
  const forearmAngle = armAngle + back * (180 - p.elbowAngle) * 0.7;
  const wrist = seg(elbow.x, elbow.y, forearmAngle, L.antebrazo);

  const center = (a: Seg, b: Seg) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  const kneeR = knee;
  const hipR = hip;
  const ankleR = ankle;
  const shoR = shoulder;
  const elb = elbow;
  const wri = wrist;

  return {
    nose: KP(nose.x, nose.y),
    left_eye: KP(nose.x - 0.008, nose.y - 0.012),
    right_eye: KP(nose.x + 0.008, nose.y - 0.012),
    left_ear: KP(nose.x - 0.015, nose.y),
    right_ear: KP(nose.x + 0.015, nose.y),
    left_shoulder: KP(shoR.x - 0.012, shoR.y),
    right_shoulder: KP(shoR.x, shoR.y),
    left_elbow: elb ? KP(elb.x - 0.012, elb.y) : KP(shoR.x - 0.012, shoR.y + 0.04),
    right_elbow: elb ? KP(elb.x, elb.y) : KP(shoR.x, shoR.y + 0.04),
    left_wrist: wri ? KP(wri.x - 0.012, wri.y) : KP(shoR.x - 0.012, shoR.y + 0.12),
    right_wrist: wri ? KP(wri.x, wri.y) : KP(shoR.x, shoR.y + 0.12),
    left_hip: KP(hipR.x - 0.012, hipR.y),
    right_hip: KP(hipR.x, hipR.y),
    left_knee: KP(kneeR.x - 0.012, kneeR.y),
    right_knee: KP(kneeR.x, kneeR.y),
    left_ankle: KP(ankleR.x - 0.012, ankleR.y),
    right_ankle: KP(ankleR.x, ankleR.y),
  };
}

/**
 * Esqueleto frontal (de frente). Usado por ejercicios cuya vista es "frontal"
 * (apertura de cadera, movilidad de hombro). Simplifica con brazos/piernas simétricos.
 */
export function poseFrontal(shoulderAngle: number, hipOpen: number): BodyPose {
  const D = 0.06; // separación media del tronco
  const shoulder = { x: 0.5, y: 0.18 };
  const hip = { x: 0.5, y: 0.42 };
  const foot = { x: 0.5, y: 0.96 };
  const kneeY = 0.75;

  const armLen = 0.22;
  const ang = (180 - shoulderAngle) * 0.6; // 0 brazos abajo, grande brazos arriba
  const rightWrist = { x: 0.5 + armLen * Math.sin((ang * Math.PI) / 180), y: 0.18 + armLen * Math.cos((ang * Math.PI) / 180) };
  const leftWrist = { x: 0.5 - armLen * Math.sin((ang * Math.PI) / 180), y: 0.18 + armLen * Math.cos((ang * Math.PI) / 180) };
  const elbowMid = (w: { x: number; y: number }, s: { x: number; y: number }) => ({ x: (w.x + s.x) / 2, y: (w.y + s.y) / 2 });

  const kneeOut = hipOpen > 80 ? D * 1.6 : D * 0.9;
  const knee = { x: 0.5, y: kneeY };
  const ankle = { x: 0.5, y: foot.y };

  return {
    nose: KP(0.5, 0.02),
    left_eye: KP(0.47, 0.008),
    right_eye: KP(0.53, 0.008),
    left_ear: KP(0.45, 0.02),
    right_ear: KP(0.55, 0.02),
    left_shoulder: KP(0.5 - D, shoulder.y),
    right_shoulder: KP(0.5 + D, shoulder.y),
    left_elbow: KP(elbowMid(leftWrist, { x: 0.5 - D, y: shoulder.y }).x, elbowMid(leftWrist, { x: 0.5 - D, y: shoulder.y }).y),
    right_elbow: KP(elbowMid(rightWrist, { x: 0.5 + D, y: shoulder.y }).x, elbowMid(rightWrist, { x: 0.5 + D, y: shoulder.y }).y),
    left_wrist: KP(leftWrist.x, leftWrist.y),
    right_wrist: KP(rightWrist.x, rightWrist.y),
    left_hip: KP(0.5 - D, hip.y),
    right_hip: KP(0.5 + D, hip.y),
    left_knee: KP(knee.x - kneeOut, knee.y),
    right_knee: KP(knee.x + kneeOut, knee.y),
    left_ankle: KP(ankle.x - D * 0.5, ankle.y),
    right_ankle: KP(ankle.x + D * 0.5, ankle.y),
  };
}
