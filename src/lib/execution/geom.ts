import type { BodyPose, ExecutionFrame, ExecutionResult, ExerciseEvaluation, JointMetric, Rep, SideMetric } from "./types";
import type { AngleSpec, ExerciseSpec } from "./exercises";

const MIN_REP_GAP_SEC = 0.35;

export interface Point2 {
  x: number;
  y: number;
  score: number;
}

function position(pose: BodyPose, key: string, aspect: number): Point2 | null {
  const kp = pose[key as keyof BodyPose];
  if (!kp || kp.score < 0.3) return null;
  return { x: kp.x * aspect, y: kp.y, score: kp.score };
}

export function angle3(a: Point2, b: Point2, c: Point2): number {
  const v1x = a.x - b.x;
  const v1y = a.y - b.y;
  const v2x = c.x - b.x;
  const v2y = c.y - b.y;
  const d1 = Math.hypot(v1x, v1y) || 1;
  const d2 = Math.hypot(v2x, v2y) || 1;
  const dot = v1x * v2x + v1y * v2y;
  const cos = Math.min(1, Math.max(-1, dot / (d1 * d2)));
  const rad = Math.acos(cos);
  return (rad * 180) / Math.PI;
}

export function sampleAngle(
  spec: AngleSpec,
  frames: ExecutionFrame[],
  aspect: number,
): number[] {
  const [pkA, pkB, pkC] = spec.points;
  const values: number[] = [];
  for (const frame of frames) {
    const a = position(frame.pose, pkA, aspect);
    const b = position(frame.pose, pkB, aspect);
    const c = position(frame.pose, pkC, aspect);
    values.push(a && b && c ? angle3(a, b, c) : Number.NaN);
  }
  return values;
}

function smooth(values: number[], window = 3): number[] {
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    let sum = 0;
    let n = 0;
    for (let j = i - window; j <= i + window; j++) {
      if (j < 0 || j >= values.length || Number.isNaN(values[j])) continue;
      sum += values[j];
      n++;
    }
    out.push(n ? sum / n : Number.NaN);
  }
  return out;
}

export function controlScore(values: number[]): number {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length < 4) return 0;
  const s = smooth(clean, 1);
  let turns = 0;
  for (let i = 2; i < s.length; i++) {
    const d1 = s[i] - s[i - 1];
    const d2 = s[i - 1] - s[i - 2];
    if (d1 * d2 < 0) turns++;
  }
  const maxTurns = Math.max(1, (s.length - 2) / 2);
  const ratio = Math.min(1, turns / maxTurns);
  return Math.round(Math.max(0, Math.min(100, Math.round(100 * (1 - ratio)))));
}

function isExtremum(values: number[], i: number, window: number, mode: "min" | "max"): boolean {
  const v = values[i];
  if (Number.isNaN(v)) return false;
  for (let j = Math.max(0, i - window); j <= Math.min(values.length - 1, i + window); j++) {
    if (j === i) continue;
    const o = values[j];
    if (Number.isNaN(o)) continue;
    if (mode === "min" && o < v) return false;
    if (mode === "max" && o > v) return false;
  }
  return true;
}

export interface ExtremaPoint {
  index: number;
  value: number;
}

export function detectExtrema(
  values: number[],
  mode: "min" | "max",
  minGapFrames: number,
): ExtremaPoint[] {
  const smoothed = smooth(values, 1);
  const candidates: ExtremaPoint[] = [];
  for (let i = 0; i < smoothed.length; i++) {
    if (Number.isNaN(smoothed[i])) continue;
    if (isExtremum(smoothed, i, 1, mode)) {
      candidates.push({ index: i, value: smoothed[i] });
    }
  }
  const result: ExtremaPoint[] = [];
  for (const candidate of candidates) {
    const last = result[result.length - 1];
    if (!last || candidate.index - last.index >= minGapFrames) {
      result.push(candidate);
    } else if (mode === "min" && candidate.value < last.value) {
      result[result.length - 1] = candidate;
    } else if (mode === "max" && candidate.value > last.value) {
      result[result.length - 1] = candidate;
    }
  }
  return result;
}

export function buildReps(
  values: number[],
  targetDir: "min" | "max",
  fps: number,
): Rep[] {
  const valid = values.map((v) => (Number.isFinite(v) ? v : Number.NaN));
  const opposing: "min" | "max" = targetDir === "min" ? "max" : "min";
  const minGap = Math.max(2, Math.round(MIN_REP_GAP_SEC * fps));
  const peaks = detectExtrema(valid, targetDir, minGap);
  const edges = detectExtrema(valid, opposing, minGap);

  if (peaks.length === 0) return [];
  const globalMin = Math.min(...valid.filter(Number.isFinite));
  const globalMax = Math.max(...valid.filter(Number.isFinite));
  const span = globalMax - globalMin || 1;

  return peaks.map((peak, index) => {
    const start = findBefore(edges, peak.index, opposing);
    const end = findAfter(edges, peak.index, opposing);
    const contextMin = start !== null ? edgeValue(valid, edges, start) : peak.value;
    const contextMax = end !== null ? edgeValue(valid, edges, end) : peak.value;
    const range = Math.abs(contextMax - contextMin);
    const depthPct =
      targetDir === "min"
        ? (globalMax - peak.value) / span
        : (peak.value - globalMin) / span;
    return {
      index: index + 1,
      startT: start !== null ? edges[start].index / fps : Math.max(0, peak.index / fps - MIN_REP_GAP_SEC),
      peakT: peak.index / fps,
      endT: end !== null ? edges[end].index / fps : peak.index / fps + MIN_REP_GAP_SEC,
      depthPct: Math.min(1, Math.max(0, depthPct)),
      range: Math.round(range * 10) / 10,
      tempoSeconds: Math.round((start !== null && end !== null ? edges[end].index - edges[start].index : MIN_REP_GAP_SEC * 2 * fps) / fps * 100) / 100,
      control: controlScore(valid.slice(start ?? 0, end !== null ? end + 1 : valid.length)),
    };
  });
}

function edgeValue(values: number[], edges: ExtremaPoint[], index: number): number {
  return edges[index].value;
}

function findBefore(edges: ExtremaPoint[], index: number, _mode: "min" | "max"): number | null {
  for (let i = edges.length - 1; i >= 0; i--) {
    if (edges[i].index < index) return i;
  }
  return null;
}

function findAfter(edges: ExtremaPoint[], index: number, _mode: "min" | "max"): number | null {
  for (let i = 0; i < edges.length; i++) {
    if (edges[i].index > index) return i;
  }
  return null;
}

export function scoreKeyPoint(spec: AngleSpec, value: number | null): number {
  if (value === null || !Number.isFinite(value)) return 0;
  const [lo, hi] = spec.targetDeg;
  const keyPoint = spec.keyPoint ?? "min";
  if (keyPoint === "value") {
    const center = (lo + hi) / 2;
    const deviation = Math.abs(value - center);
    const tolerance = Math.max(10, (hi - lo) / 2 + 10);
    return Math.round(Math.max(0, Math.min(100, 100 - (deviation / tolerance) * 100)));
  }
  if (keyPoint === "max") {
    if (value >= lo) return 100;
    return Math.round(Math.max(0, 100 - ((lo - value) / lo) * 100));
  }
  if (value <= hi) return 100;
  return Math.round(Math.max(0, 100 - ((value - hi) / hi) * 100));
}

export function computeSymmetry(
  leftValues: number[],
  rightValues: number[],
): number {
  const l = Math.min(...leftValues.filter(Number.isFinite));
  const r = Math.min(...rightValues.filter(Number.isFinite));
  if (!Number.isFinite(l) || !Number.isFinite(r)) return 0;
  const larger = Math.max(Math.abs(l), Math.abs(r)) || 1;
  const diff = Math.abs(l - r);
  return Math.round(Math.max(0, Math.min(100, 100 - (diff / larger) * 100)));
}

export function evaluateExercise(
  result: ExecutionResult,
  exercise: ExerciseSpec,
): ExerciseEvaluation {
  const aspect = result.video.width / result.video.height;
  const fps = result.analysis.fps || 5;
  const frames = result.frames;

  const joints: JointMetric[] = exercise.angles.map((spec) => {
    const values = sampleAngle(spec, frames, aspect);
    const clean = values.filter((v) => Number.isFinite(v));
    const min = clean.length ? Math.min(...clean) : Number.NaN;
    const max = clean.length ? Math.max(...clean) : Number.NaN;
    return {
      key: spec.key,
      label: spec.label,
      side: spec.side,
      values,
      min: round1(min),
      max: round1(max),
      range: round1(max - min),
      mean: round1(clean.length ? clean.reduce((s, v) => s + v, 0) / clean.length : NaN),
      control: controlScore(values),
    };
  });

  const primarySeries = sampleAngle(exercise.primary, frames, aspect);
  const targetDir: "min" | "max" =
    exercise.primary.keyPoint === "max" ? "max" : exercise.primary.keyPoint === "min" ? "min" : "min";
  const reps = buildReps(primarySeries, targetDir, fps);

  const primaryValue =
    exercise.primary.keyPoint === "max"
      ? Math.max(...primarySeries.filter(Number.isFinite))
      : exercise.primary.keyPoint === "value"
        ? Math.min(...primarySeries.filter(Number.isFinite))
        : Math.min(...primarySeries.filter(Number.isFinite));

  const rangeScore = scoreKeyPoint(exercise.primary, primaryValue);
  const control = Math.round(
    joints.reduce((s, j) => s + j.control, 0) / Math.max(1, joints.length),
  );
  const tempoScore = scoreTempo(reps, fps);
  const symmetry = computeSymmetryFromJoints(joints);
  const symmetryValue =
    symmetry.length > 0
      ? Math.round(symmetry.reduce((s, m) => s + m.symmetryPct, 0) / symmetry.length)
      : 100;
  const overall = Math.round(
    rangeScore * 0.5 + control * 0.25 + tempoScore * 0.15 + symmetryValue * 0.1,
  );

  return {
    exerciseId: exercise.id,
    joints,
    reps,
    symmetry,
    score: {
      overall,
      range: rangeScore,
      tempo: tempoScore,
      control,
      symmetry: symmetryValue,
      verdict: buildVerdict(exercise, rangeScore, control),
    },
  };
}

function computeSymmetryFromJoints(joints: JointMetric[]): SideMetric[] {
  const pairs = pairByKey(joints);
  return pairs.map(([left, right]) => ({
    metric: left.label.replace(/ izquierda$| delantera$/, ""),
    left: left.max,
    right: right.max,
    symmetryPct: computeSymmetry(left.values, right.values),
  }));
}

function pairByKey(joints: JointMetric[]): Array<[JointMetric, JointMetric]> {
  const bySide: Record<string, { left?: JointMetric; right?: JointMetric }> = {};
  for (const joint of joints) {
    if (joint.side === "left") {
      bySide[joint.key] = { ...(bySide[joint.key] ?? {}), left: joint };
    } else if (joint.side === "right") {
      bySide[joint.key] = { ...(bySide[joint.key] ?? {}), right: joint };
    }
  }
  return Object.values(bySide)
    .filter((pair) => pair.left && pair.right)
    .map((pair) => [pair.left as JointMetric, pair.right as JointMetric]);
}

function scoreTempo(reps: Rep[], _fps: number): number {
  if (reps.length === 0) return 0;
  const avg = reps.reduce((s, r) => s + r.tempoSeconds, 0) / reps.length;
  const idealHigh = 4;
  const idealLow = 1.5;
  if (avg >= idealLow && avg <= idealHigh) return 100;
  if (avg < idealLow) {
    return Math.round(Math.max(0, 100 - ((idealLow - avg) / idealLow) * 100));
  }
  return Math.round(Math.max(0, 100 - ((avg - idealHigh) / idealHigh) * 100));
}

function buildVerdict(exercise: ExerciseSpec, rangeScore: number, control: number): string {
  if (rangeScore < 40) {
    return `El recorrido quedó corto. Profundiza más la fase del ejercicio y vigila la técnica de ${exercise.summary.toLowerCase()}`;
  }
  if (rangeScore < 75) {
    return `Buen recorrido, pero todavía puedes ganar más rango en la fase clave. Procura llegar al objetivo de ${exercise.primary.label.toLowerCase()}.`;
  }
  if (control < 70) {
    return `Excellente rango alcanzado, pero el movimiento fue algo irregular. Controla mejor la velocidad del descenso y la subida.`;
  }
  return "Técnica sólida: rango completo y movimiento controlado. Sigue así.";
}

function round1(v: number): number {
  return Number.isFinite(v) ? Math.round(v * 10) / 10 : Number.NaN;
}
