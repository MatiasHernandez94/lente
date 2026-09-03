import "server-only";
import { saveExecutionResult } from "@/lib/repo";
import type { BodyPose, ExecutionFrame, ExecutionResult } from "./types";
import { EXERCISE_BY_ID } from "./exercises";
import { poseLateral, poseFrontal } from "./skeleton";

export const DEMO_VERSION = 1;
const FPS = 10;
const REPS = 8;
const SECONDS_PER_REP = 2;
const DEMO_DURATION_SEC = REPS * SECONDS_PER_REP;
const JITTER = 1.2;

interface Animation {
  kneeAngle: number;
  hipAngle: number;
  torsoLean: number;
  elbowAngle: number;
  shoulderAngle: number;
  alignAngle: number;
  frontal?: { shoulderAngle: number; hipOpen: number };
}

type AnimationFn = (phase: number) => Animation;

function target(angle: { keyPoint?: string; targetDeg: [number, number] }): {
  flex: number;
  tol: number;
  ext: number;
} {
  const kp = angle.keyPoint ?? "min";
  const [lo, hi] = angle.targetDeg;
  const tol = (hi - lo) / 2;
  if (kp === "min") return { flex: hi, tol, ext: 170 };
  if (kp === "max") return { flex: -1, tol, ext: lo };
  return { flex: -1, tol, ext: (lo + hi) / 2 };
}

function cycleSwing(phase: number, from: number, to: number): number {
  return from + (to - from) * (0.5 - 0.5 * Math.cos(phase * Math.PI * 2));
}

function cyclePeak(phase: number, peak: number, floor: number): number {
  return peak + (floor - peak) * (0.5 - 0.5 * Math.cos(phase * Math.PI * 2));
}

function buildAnimation(exerciseId: string): AnimationFn {
  const spec = EXERCISE_BY_ID[exerciseId];
  const prim = spec.primary;
  const t = target(prim);

  if (exerciseId === "sentadilla" || exerciseId === "sentadilla_profunda") {
    return (phase) => {
      const knee = cyclePeak(phase, t.flex + JITTER, 168);
      const hip = 70 + (168 - knee) * 0.5;
      return { kneeAngle: knee, hipAngle: hip, torsoLean: 12, elbowAngle: 170, shoulderAngle: 60, alignAngle: 178 };
    };
  }
  if (exerciseId === "peso_muerto") {
    return (phase) => {
      const lean = cycleSwing(phase, 12, 20 + t.tol);
      return { kneeAngle: 160, hipAngle: 180 - lean * 1.3, torsoLean: lean, elbowAngle: 170, shoulderAngle: 60, alignAngle: 178 };
    };
  }
  if (exerciseId === "press_banca" || exerciseId === "press_hombro") {
    return (phase) => {
      const elbow = cyclePeak(phase, t.flex + JITTER, 170);
      return { kneeAngle: 170, hipAngle: 160, torsoLean: 15, elbowAngle: elbow, shoulderAngle: 90, alignAngle: 178 };
    };
  }
  if (exerciseId === "flexiones") {
    return (phase) => {
      const elbow = cyclePeak(phase, t.flex + JITTER, 165);
      return { kneeAngle: 172, hipAngle: 175, torsoLean: 3, elbowAngle: elbow, shoulderAngle: 80, alignAngle: 180 };
    };
  }
  if (exerciseId === "plancha") {
    return () => ({ kneeAngle: 172, hipAngle: 176, torsoLean: 1, elbowAngle: 150, shoulderAngle: 60, alignAngle: 176 });
  }
  if (exerciseId === "zancada") {
    return (phase) => {
      const knee = cyclePeak(phase, t.flex + JITTER, 165);
      return { kneeAngle: knee, hipAngle: 80 + (165 - knee) * 0.4, torsoLean: 10, elbowAngle: 170, shoulderAngle: 60, alignAngle: 176 };
    };
  }
  if (exerciseId === "apertura_cadera") {
    return (phase) => {
      const shoulderSolid = 90;
      const hipOpen = cyclePeak(phase, t.ext + JITTER, 35);
      return { kneeAngle: 170, hipAngle: 160, torsoLean: 6, elbowAngle: 170, shoulderAngle: 60, alignAngle: 178, frontal: { shoulderAngle: shoulderSolid, hipOpen } };
    };
  }
  if (exerciseId === "movilidad_hombro") {
    return (phase) => {
      const shoulder = cyclePeak(phase, t.ext + JITTER, 45);
      return { kneeAngle: 170, hipAngle: 160, torsoLean: 6, elbowAngle: 170, shoulderAngle: 60, alignAngle: 178, frontal: { shoulderAngle: shoulder, hipOpen: 90 } };
    };
  }
  return () => ({ kneeAngle: 170, hipAngle: 160, torsoLean: 6, elbowAngle: 170, shoulderAngle: 60, alignAngle: 178 });
}

export function buildDemoExecutionData(exerciseId: string): ExecutionResult {
  const animation = buildAnimation(exerciseId);
  const frames: ExecutionFrame[] = [];
  const total = Math.round(DEMO_DURATION_SEC * FPS);
  const totalReps = REPS;

  for (let i = 0; i < total; i++) {
    const t = i / FPS;
    const phase = ((i / FPS) % SECONDS_PER_REP) / SECONDS_PER_REP;
    const repIndex = Math.min(totalReps - 1, Math.floor((i / FPS) / SECONDS_PER_REP));
    const anim = animation(phase);
    // pequeña fase de progresión en cada rep para variar sutilmente el énfasis
    const boost = 1 + 0.03 * Math.sin(repIndex);
    const pose: BodyPose = anim.frontal
      ? poseFrontal(anim.frontal.shoulderAngle * boost, anim.frontal.hipOpen * boost)
      : poseLateral({
          kneeAngle: anim.kneeAngle,
          hipAngle: anim.hipAngle,
          elbowAngle: anim.elbowAngle,
          shoulderAngle: anim.shoulderAngle,
          alignAngle: anim.alignAngle,
        });
    frames.push({ t: Number(t.toFixed(2)), pose });
  }

  return {
    video: { width: 1280, height: 720, durationSec: DEMO_DURATION_SEC },
    analysis: { fps: FPS, frames: total },
    frames,
    meta: { demoVersion: DEMO_VERSION },
  };
}

export async function generateDemoExecution(videoId: string, exerciseId: string): Promise<void> {
  const data = buildDemoExecutionData(exerciseId);
  await saveExecutionResult(videoId, data, exerciseId);
}
