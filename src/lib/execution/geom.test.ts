import { test } from "node:test";
import assert from "node:assert/strict";
import { angle3, controlScore, buildReps, scoreKeyPoint, evaluateExercise } from "./geom.ts";
import { EXERCISES } from "./exercises.ts";
import type { BodyPose, ExecutionFrame, ExecutionResult } from "./types.ts";

test("angle3 calcula 90 grados en un vértice recto", () => {
  const a = { x: 0, y: 0, score: 1 };
  const b = { x: 0, y: 1, score: 1 };
  const c = { x: 1, y: 1, score: 1 };
  assert.ok(Math.abs(angle3(a, b, c) - 90) < 1e-6);
});

test("angle3 calcula 180 grados en línea recta", () => {
  const a = { x: 0, y: 0, score: 1 };
  const b = { x: 0, y: 1, score: 1 };
  const c = { x: 0, y: 2, score: 1 };
  assert.ok(Math.abs(angle3(a, b, c) - 180) < 1e-6);
});

test("angle3 con aspect ratio corrige el estiramiento de x", () => {
  const a = { x: 0.1, y: 0, score: 1 };
  const b = { x: 0.1, y: 1, score: 1 };
  const c = { x: 0.2, y: 1, score: 1 };
  const skewed = angle3(a, b, c);
  const corrected = angle3(
    { x: a.x * 1.0, y: a.y, score: 1 },
    { x: a.x * 1.0, y: a.y, score: 1 },
    { x: a.x * 1.0, y: a.y, score: 1 },
  );
  assert.ok(Number.isFinite(skewed));
  assert.ok(Number.isFinite(corrected));
});

test("controlScore: serie suave → alto, serie ruidosa → bajo", () => {
  const smooth = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 5) * 5);
  const noisy = Array.from({ length: 60 }, (_, i) => 100 + (i % 2 === 0 ? 0 : 40));
  assert.ok(controlScore(smooth) > controlScore(noisy));
  assert.ok(controlScore(smooth) > 70);
  assert.ok(controlScore(noisy) < 60);
});

test("buildReps detecta el número de picos de una señal senoidal", () => {
  const fps = 10;
  const values = [];
  for (let i = 0; i < 100; i++) {
    values.push(150 - 50 * (0.5 - 0.5 * Math.sin((i / 10) * Math.PI * 2)));
  }
  const reps = buildReps(values, "min", fps);
  assert.ok(reps.length >= 8 && reps.length <= 12, `esperaba ~10 reps, obtuve ${reps.length}`);
  for (const rep of reps) {
    assert.ok(rep.depthPct > 0 && rep.depthPct <= 1);
    assert.ok(rep.control >= 0 && rep.control <= 100);
  }
});

test("scoreKeyPoint puntúa el rango según el objetivo", () => {
  const squat: any = { key: "rodilla", label: "Rodilla", side: "eje", points: ["right_hip","right_knee","right_ankle"] as any, targetDeg: [80, 100], keyPoint: "min" as const };
  assert.equal(scoreKeyPoint(squat, 90), 100);
  assert.equal(scoreKeyPoint(squat, 100), 100);
  assert.ok(scoreKeyPoint(squat, 140) < 100);
  assert.ok(scoreKeyPoint(squat, 170) < scoreKeyPoint(squat, 120));

  const plank: any = { key: "tronc", label: "Tronco", side: "eje", points: ["right_shoulder","right_hip","right_knee"] as any, targetDeg: [175, 185], keyPoint: "value" as const };
  assert.equal(scoreKeyPoint(plank, 180), 100);
  assert.ok(scoreKeyPoint(plank, 160) < 100);

  const shoulder: any = { key: "hombro", label: "Hombro", side: "eje", points: ["right_hip","right_shoulder","right_elbow"] as any, targetDeg: [160, 180], keyPoint: "max" as const };
  assert.equal(scoreKeyPoint(shoulder, 170), 100);
  assert.ok(scoreKeyPoint(shoulder, 120) < 100);
});

function poseWithKnee(kneeX: number): BodyPose {
  return {
    right_shoulder: { x: 0.5, y: 0.2, score: 0.99 },
    nose: { x: 0.5, y: 0.05, score: 0.99 },
    right_hip: { x: 0.5, y: 0.4, score: 0.99 },
    right_knee: { x: kneeX, y: 0.75, score: 0.99 },
    right_ankle: { x: 0.5, y: 0.95, score: 0.99 },
    left_shoulder: { x: 0.5, y: 0.2, score: 0.99 },
    left_hip: { x: 0.5, y: 0.4, score: 0.99 },
    left_knee: { x: 0.5, y: 0.75, score: 0.99 },
    left_ankle: { x: 0.5, y: 0.95, score: 0.99 },
  };
}

function squatResult(reps = 6): ExecutionResult {
  const fps = 10;
  const frames: ExecutionFrame[] = [];
  const total = Math.round(reps * (fps * 2)); // 2s por rep = 1s bajada + 1s subida
  for (let i = 0; i < total; i++) {
    const t = i / fps;
    // rodilla se mueve en x de 0.5 (arriba, ~180) a 0.25 (abajo, doblada) con 1 ciclo cada 2s
    const kneeX = 0.375 - 0.125 * Math.sin(t * Math.PI);
    frames.push({ t, pose: poseWithKnee(kneeX) });
  }
  return {
    video: { width: 1280, height: 720, durationSec: total / fps },
    analysis: { fps, frames: total },
    frames,
  };
}

test("evaluateExercise produce evaluación completa para sentadilla", () => {
  const squat = EXERCISES.find((e) => e.id === "sentadilla")!;
  const result = squatResult(6);
  const evaluation = evaluateExercise(result, squat);

  assert.equal(evaluation.exerciseId, "sentadilla");
  assert.ok(evaluation.joints.length >= 3);
  const knee = evaluation.joints.find((j) => j.key === "knee")!;
  assert.ok(knee.range > 40, `ROM rodilla esperado amplio, obtuve ${knee.range}`);
  assert.ok(evaluation.reps.length >= 4, `esperaba ~6 reps, obtuve ${evaluation.reps.length}`);
  assert.ok(evaluation.score.overall > 0 && evaluation.score.overall <= 100);
  assert.ok(evaluation.score.range >= 0 && evaluation.score.range <= 100);
  assert.ok(evaluation.score.control >= 0 && evaluation.score.control <= 100);
});

test("evaluateExercise detecta simetría en zancada", () => {
  const lunge = EXERCISES.find((e) => e.id === "zancada")!;
  const result = squatResult(4);
  const evaluation = evaluateExercise(result, lunge);
  assert.equal(evaluation.exerciseId, "zancada");
  assert.ok(evaluation.score.overall >= 0 && evaluation.score.overall <= 100);
});
