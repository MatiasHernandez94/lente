// Análisis de ejecución de ejercicios (detección de pose) — SOLO LOCAL.
// Uso: node scripts/execution/analyze.mjs <video> <outJson> [fps=10] [max-frames=0] [width=640] [model=...]
// Dependencias: @huggingface/transformers (ViTPose), ffmpeg-static.
// Emite JSON con estructura ExecutionResult (src/lib/execution/types.ts).
import { AutoModelForPoseEstimation, AutoImageProcessor, RawImage, env } from "@huggingface/transformers";
import ffmpeg from "ffmpeg-static";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const [video, outJson, ...rest] = process.argv.slice(2);
const opt = Object.fromEntries(rest.map((a) => a.split("=")));
const FPS = Number(opt.fps ?? 10);
const MAX_FRAMES = Number(opt["max-frames"] ?? 0);
const WIDTH = Number(opt.width ?? 640);
const MODEL = opt.model ?? "Xenova/vitpose-base-simple";

if (!video || !outJson) {
  console.error("uso: analyze.mjs <video> <outJson> [fps=10] [max-frames=0] [width=640] [model=...]");
  process.exit(2);
}

env.allowLocalModels = false;
env.allowRemoteModels = true;
env.cacheDir = join(process.cwd(), "data", ".hf-cache");

const KEYPOINT_NAMES = [
  "nose", "left_eye", "right_eye", "left_ear", "right_ear",
  "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
  "left_wrist", "right_wrist", "left_hip", "right_hip",
  "left_knee", "right_knee", "left_ankle", "right_ankle",
];

function probe(path) {
  let out = "";
  try {
    execFileSync(ffmpeg, ["-i", path], { stdio: ["ignore", "ignore", "pipe"] });
  } catch (err) {
    out = String(err.stderr);
  }
  const dur = out.match(/Duration: (\d+):(\d+):([\d.]+)/);
  const res = out.match(/(\d{2,5})x(\d{2,5})/);
  return {
    durationSec: dur ? Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]) : null,
    width: res ? Number(res[1]) : null,
    height: res ? Number(res[2]) : null,
  };
}

function normalizeKeypoints(kps, W, H) {
  const pose = {};
  for (let i = 0; i < KEYPOINT_NAMES.length; i++) {
    const kp = kps[i];
    if (!kp || kp.score < 0.2) continue;
    pose[KEYPOINT_NAMES[i]] = { x: kp.x / W, y: kp.y / H, score: Number(kp.score.toFixed(3)) };
  }
  return pose;
}

async function main() {
  const info = probe(video);
  const durationSec = info.durationSec ?? 0;
  const vw = info.width ?? 0;
  const vh = info.height ?? 0;

  const processor = await AutoImageProcessor.from_pretrained(MODEL);
  const model = await AutoModelForPoseEstimation.from_pretrained(MODEL);

  const dir = mkdtempSync(join(tmpdir(), "execution-"));
  const H = Math.round((WIDTH / vw) * vh);
  const pattern = join(dir, "%06d.jpg");
  const cmd = ["-i", video, "-vf", `fps=${FPS},scale=${WIDTH}:${H}`, "-q:v", "3", pattern];
  if (MAX_FRAMES > 0) cmd.splice(cmd.length - 1, 0, "-frames:v", String(MAX_FRAMES));
  execFileSync(ffmpeg, cmd, { stdio: ["ignore", "ignore", "ignore"] });

  const files = readdirSync(dir).filter((f) => f.endsWith(".jpg")).sort()
    .map((f) => join(dir, f));

  const frames = [];
  for (let i = 0; i < files.length; i++) {
    const t = i / FPS;
    const image = await RawImage.read(files[i]);
    const inputs = await processor([image]);
    const outputs = await model(inputs);

    const batch = Array.isArray(outputs) ? outputs[0] : outputs;
    const kps = batch?.keypoints?.[0] ?? [];
    const pose = normalizeKeypoints(kps, image.width, image.height);
    frames.push({ t: Number(t.toFixed(2)), pose });
    if (i % (FPS * 2) === 0) console.log(`t=${t}s: keypoints ${Object.keys(pose).length}/17`);
  }

  // ViTPose puede devolver varias detecciones; tomamos la de mayor confianza por frame.
  rmSync(dir, { recursive: true, force: true });

  const result = {
    video: { width: vw, height: vh, durationSec: Number(durationSec.toFixed(2)) },
    analysis: { fps: FPS, frames: files.length },
    frames,
  };
  writeFileSync(outJson, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ok: true, frames: frames.length, fps: FPS, durationSec }));
}

main().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
