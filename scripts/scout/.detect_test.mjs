import { pipeline, env } from "@huggingface/transformers";
import ffmpeg from "ffmpeg-static";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const VIDEO = process.argv[2];
const MAX_FRAMES = Number(process.argv[3] ?? 6);

env.allowLocalModels = false;
env.allowRemoteModels = true;
env.cacheDir = join(process.cwd(), "data", ".hf-cache");

let detector;
for (const model of ["Xenova/detr-resnet-50", "onnx-community/detr-resnet-50"]) {
  try {
    detector = await pipeline("object-detection", model);
    console.log(`modelo OK: ${model}`);
    break;
  } catch (err) {
    console.log(`modelo ${model} no disponible: ${err.message?.slice(0, 120)}`);
  }
}

const dir = mkdtempSync(join(tmpdir(), "det-"));
const out = join(dir, "%03d.jpg");
execFileSync(
  ffmpeg,
  ["-i", VIDEO, "-vf", "fps=1,scale=960:-2", "-frames:v", String(MAX_FRAMES), "-q:v", "3", out],
  { stdio: ["ignore", "ignore", "pipe"] },
);
const frames = readdirSync(dir).filter((f) => f.endsWith(".jpg")).sort();
console.log(`${frames.length} frames (1 por segundo)`);

const t0 = Date.now();
for (const [i, file] of frames.entries()) {
  const results = await detector(join(dir, file));
  const people = (results ?? []).filter((r) => r.label === "person");
  console.log(
    `t=${i}s: ${people
      .map((p) => `person@${p.score.toFixed(2)} ${Math.round(p.box.xmin)},${Math.round(p.box.ymin)} ${Math.round(p.box.xmax)},${Math.round(p.box.ymax)}`)
      .join(" | ") || "sin personas"}`,
  );
}

rmSync(dir, { recursive: true, force: true });
console.log(`total ${((Date.now() - t0) / 1000).toFixed(1)}s`);