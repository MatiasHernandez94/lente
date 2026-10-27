import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import type { VideoRow } from "@/lib/schema";
import {
  getExecutionAnalysis,
  saveExecutionExercise,
  saveExecutionResult,
  updateExecutionStatus,
} from "@/lib/repo";
import type { ExecutionResult, ExecutionStatus, ExerciseEvaluation } from "./types";
import { EXERCISE_BY_ID, type ExerciseSpec } from "./exercises";
import { evaluateExercise } from "./geom";
import { ApiServiceError } from "@/lib/services/videoService";
import { generateDemoExecution, DEMO_VERSION } from "./demo";

const execFileAsync = promisify(execFile);
const ANALYZE_SCRIPT = join(process.cwd(), "scripts", "execution", "analyze.mjs");
const ANALYSIS_FPS = 10;
const UPLOADS_DIR = join(process.cwd(), "data", "uploads");

const RUN_LOCAL = process.env.LENTE_RUN_EXECUTION_LOCAL === "1";

function isDemoVideo(video: VideoRow): boolean {
  return typeof video.title === "string" && video.title.startsWith("Ejemplo —");
}

export function getExercise(exerciseId: string): ExerciseSpec {
  const exercise = EXERCISE_BY_ID[exerciseId];
  if (!exercise) throw new ApiServiceError(400, "Ejercicio no reconocido.");
  return exercise;
}

export async function startExecution(video: VideoRow, exerciseId: string): Promise<void> {
  getExercise(exerciseId);
  const current = await getExecutionAnalysis(video.id);
  if (current?.status === "running" || current?.status === "ready") {
    throw new ApiServiceError(409, "El análisis ya está en proceso o fue completado.");
  }
  await updateExecutionStatus(video.id, "running");
  if (RUN_LOCAL) {
    await void runExecutionPipeline(video);
  } else {
    // Sin pipeline local el análisis real no puede correr: resolvemos con el
    // generador sintético para que la vista no quede colgada en "running".
    await generateDemoExecution(video.id, exerciseId);
  }
}

async function runExecutionPipeline(video: VideoRow): Promise<void> {
  const outFile = join(tmpdir(), `execution-${video.id}-${randomUUID()}.json`);
  try {
    if (video.sourceType !== "upload" && video.sourceType !== "camera") {
      throw new ApiServiceError(400, "El análisis de pose requiere un video local subido.");
    }
    const filePath = join(UPLOADS_DIR, video.sourceRef as string);
    if (!existsSync(filePath)) {
      throw new Error("El archivo de video no está disponible en almacenamiento local.");
    }
    const args = [ANALYZE_SCRIPT, filePath, outFile, `fps=${ANALYSIS_FPS}`];
    await execFileAsync(process.execPath, args, { timeout: 60000 * 30 });
    const data = JSON.parse(await readFile(outFile, "utf8")) as ExecutionResult;
    await saveExecutionResult(video.id, data, null);
  } catch (error) {
    await updateExecutionStatus(
      video.id,
      "error",
      error instanceof Error ? error.message : "El análisis no pudo completarse.",
    );
  }
}

async function ensureDemoExecution(video: VideoRow): Promise<void> {
  // Con el pipeline local activo (RUN_LOCAL) los videos reales los procesa el
  // script; sólo los demos se generan sintéticos. Sin pipeline local, todos se
  // resuelven con el generador (y los "running" huérfanos se regeneran).
  if (!isDemoVideo(video) && RUN_LOCAL) return;
  const row = await getExecutionAnalysis(video.id);
  if (RUN_LOCAL && (row?.status === "running" || row?.status === "error")) return;
  if (row?.status === "ready" && row.resultJson) {
    try {
      const data = JSON.parse(row.resultJson) as ExecutionResult;
      if (data.meta?.demoVersion === DEMO_VERSION) return;
    } catch {
      // resultado corrupto: regenerar
    }
  }
  const exerciseId = row?.exerciseId && EXERCISE_BY_ID[row.exerciseId] ? row.exerciseId : EXERCISE_BY_ID["sentadilla"].id;
  await generateDemoExecution(video.id, exerciseId);
}

export function evaluateForExercise(
  result: ExecutionResult,
  exerciseId: string,
): ExerciseEvaluation {
  const exercise = getExercise(exerciseId);
  return evaluateExercise(result, exercise);
}

export async function getExecutionData(video: VideoRow): Promise<ExecutionResult | null> {
  await ensureDemoExecution(video);
  const row = await getExecutionAnalysis(video.id);
  return row?.status === "ready" && row.resultJson ? (JSON.parse(row.resultJson) as ExecutionResult) : null;
}

export async function getExecutionStatus(video: VideoRow): Promise<ExecutionStatus> {
  await ensureDemoExecution(video);
  return ((await getExecutionAnalysis(video.id))?.status ?? "none") as ExecutionStatus;
}

export async function getChosenExercise(video: VideoRow): Promise<string | null> {
  await ensureDemoExecution(video);
  const row = await getExecutionAnalysis(video.id);
  if (row?.exerciseId) return row.exerciseId;
  return isDemoVideo(video) ? EXERCISE_BY_ID["sentadilla"].id : null;
}

export async function chooseExercise(video: VideoRow, exerciseId: string): Promise<void> {
  getExercise(exerciseId);
  if (isDemoVideo(video) || !RUN_LOCAL) {
    await generateDemoExecution(video.id, exerciseId);
    return;
  }
  await saveExecutionExercise(video.id, exerciseId);
}

export async function getExecutionSnapshot(
  video: VideoRow,
): Promise<{
  status: ExecutionStatus;
  data: ExecutionResult | null;
  evaluation: ExerciseEvaluation | null;
  exerciseId: string | null;
  errorMessage: string | null;
}> {
  const status = await getExecutionStatus(video);
  const data = await getExecutionData(video);
  const exerciseId = await getChosenExercise(video);
  const evaluation = data && exerciseId ? evaluateForExercise(data, exerciseId) : null;
  const row = await getExecutionAnalysis(video.id);
  return { status, data, evaluation, exerciseId, errorMessage: row?.errorMessage ?? null };
}
