export type ExerciseCategory = "movilidad" | "fuerza";

export type ExecutionStatus = "none" | "running" | "ready" | "error";

export type BodyKeypoint =
  | "nose"
  | "left_eye"
  | "right_eye"
  | "left_ear"
  | "right_ear"
  | "left_shoulder"
  | "right_shoulder"
  | "left_elbow"
  | "right_elbow"
  | "left_wrist"
  | "right_wrist"
  | "left_hip"
  | "right_hip"
  | "left_knee"
  | "right_knee"
  | "left_ankle"
  | "right_ankle";

export interface Keypoint {
  x: number;
  y: number;
  score: number;
}

export type BodyPose = Partial<Record<BodyKeypoint, Keypoint>>;

export interface ExecutionFrame {
  t: number;
  pose: BodyPose;
}

export interface ExecutionResult {
  video: { width: number; height: number; durationSec: number };
  analysis: { fps: number; frames: number };
  frames: ExecutionFrame[];
  meta?: { demoVersion?: number };
}

export interface JointMetric {
  key: string;
  label: string;
  side: "left" | "right" | "eje";
  values: number[];
  min: number;
  max: number;
  range: number;
  mean: number;
  control: number;
}

export interface Rep {
  index: number;
  startT: number;
  peakT: number;
  endT: number;
  depthPct: number;
  range: number;
  tempoSeconds: number;
  control: number;
}

export interface SideMetric {
  metric: string;
  left: number;
  right: number;
  symmetryPct: number;
}

export interface ExecutionScore {
  overall: number;
  range: number;
  tempo: number;
  control: number;
  symmetry: number;
  verdict: string;
}

export interface ExerciseEvaluation {
  exerciseId: string;
  joints: JointMetric[];
  reps: Rep[];
  symmetry: SideMetric[];
  score: ExecutionScore;
}

export interface ExecutionSnapshot {
  status: ExecutionStatus;
  data: ExecutionResult | null;
  evaluation: ExerciseEvaluation | null;
  exerciseId: string | null;
  errorMessage: string | null;
}
