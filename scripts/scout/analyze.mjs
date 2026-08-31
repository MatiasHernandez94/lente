import { pipeline, env } from "@huggingface/transformers";
import ffmpeg from "ffmpeg-static";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";

const [video, outJson, ...rest] = process.argv.slice(2);
const opt = Object.fromEntries(rest.map((a) => a.split("=")));
const FPS = Number(opt.fps ?? 5);
const MAX_FRAMES = Number(opt["max-frames"] ?? 0);
const WIDTH = Number(opt.width ?? 960);
const MODEL = opt.model ?? "Xenova/detr-resnet-50";

if (!video || !outJson) {
  console.error("uso: analyze.mjs <video> <outJson> [fps=5] [max-frames=0] [width=960] [model=...]");
  process.exit(2);
}

env.allowLocalModels = false;
env.allowRemoteModels = true;
env.cacheDir = join(process.cwd(), "data", ".hf-cache");

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

function iou(a, b) {
  const ax0 = a.xmin, ay0 = a.ymin, ax1 = a.xmax, ay1 = a.ymax;
  const bx0 = b.xmin, by0 = b.ymin, bx1 = b.xmax, by1 = b.ymax;
  const x0 = Math.max(ax0, bx0), y0 = Math.max(ay0, by0);
  const x1 = Math.min(ax1, bx1), y1 = Math.min(ay1, by1);
  const iw = Math.max(0, x1 - x0), ih = Math.max(0, y1 - y0);
  const inter = iw * ih;
  const aArea = (ax1 - ax0) * (ay1 - ay0);
  const bArea = (bx1 - bx0) * (by1 - by0);
  return inter / (aArea + bArea - inter || 1);
}

function trackBox(t) {
  return { xmin: t.e0, ymin: t.e1, xmax: t.e2, ymax: t.e3 };
}

function updateEMA(t, box) {
  const alpha = 0.55;
  const cur = trackBox(t);
  t.e0 = cur.xmin + alpha * (box.xmin - cur.xmin);
  t.e1 = cur.ymin + alpha * (box.ymin - cur.ymin);
  t.e2 = cur.xmax + alpha * (box.xmax - cur.xmax);
  t.e3 = cur.ymax + alpha * (box.ymax - cur.ymax);
}

async function sampleTrackColor(file, box, W, H) {
  const { data, info } = await sharp(file)
    .extract({
      left: Math.round(box.xmin * W),
      top: Math.round(box.ymin * H),
      width: Math.max(1, Math.round((box.xmax - box.xmin) * W)),
      height: Math.max(1, Math.round((box.ymax - box.ymin) * H)),
    })
    .resize(24, 24, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  void info;
  const px = data;
  const rs = [], gs = [], bs = [];
  for (let i = 0; i < px.length; i += 3) {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const sat = mx === 0 ? 0 : (mx - mn) / mx;
    if (sat < 0.18 || (r + g + b) / 3 < 18 || (r + g + b) / 3 > 242) continue;
    rs.push(r); gs.push(g); bs.push(b);
  }
  if (!rs.length) return null;
  const median = (arr) => {
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  return [median(rs), median(gs), median(bs)];
}

function classifyTeams(tracks) {
  const med = tracks.map((t) => t.color).filter(Boolean);
  if (med.length < 2) return null;
  let c1 = med[0], c2 = null;
  let bestD = -1;
  for (let i = 1; i < med.length; i++) {
    const d = Math.hypot(med[i][0] - c1[0], med[i][1] - c1[1], med[i][2] - c1[2]);
    if (d > bestD) { bestD = d; c2 = med[i]; }
  }
  if (!c2 || bestD < 40) return null;
  const assign = (c) =>
    Math.hypot(c[0] - c1[0], c[1] - c1[1], c[2] - c1[2]) <=
    Math.hypot(c[0] - c2[0], c[1] - c2[1], c[2] - c2[2])
      ? "A" : "B";
  return {
    teamOf: (color) => assign(color),
    colors: { A: c1, B: c2 },
  };
}

async function main() {
  const info = probe(video);
  const durationSec = info.durationSec ?? 0;
  const vw = info.width ?? 0;
  const vh = info.height ?? 0;

  const detector = await pipeline("object-detection", MODEL);

  const dir = mkdtempSync(join(tmpdir(), "scout-"));
  const H = Math.round((WIDTH / vw) * vh);
  const pattern = join(dir, "%06d.jpg");
  const cmd = ["-i", video, "-vf", `fps=${FPS},scale=${WIDTH}:${H}`, "-q:v", "3", pattern];
  if (MAX_FRAMES > 0) cmd.splice(cmd.length - 1, 0, "-frames:v", String(MAX_FRAMES));
  execFileSync(ffmpeg, cmd, { stdio: ["ignore", "ignore", "ignore"] });

  const files = readdirSync(dir).filter((f) => f.endsWith(".jpg")).sort()
    .map((f) => ({ name: f, file: join(dir, f) }));

  const tracks = [];
  let nextId = 0;
  const STEP = 1 / FPS;
  const MISS_TOLERANCE = Math.round(FPS * 1.5);

  for (const [i, { file }] of files.entries()) {
    const t = i * STEP;
    const results = await detector(file);
    const boxes = (results ?? [])
      .filter((r) => r.label === "person" && r.score >= 0.45)
      .map((r) => ({
        xmin: r.box.xmin / WIDTH,
        ymin: r.box.ymin / H,
        xmax: r.box.xmax / WIDTH,
        ymax: r.box.ymax / H,
      }));

    const assigned = new Set();
    for (const b of boxes) {
      let bestId = -1, bestScore = 0;
      for (const tk of tracks) {
        if (!tk.alive || assigned.has(tk.id)) continue;
        const score = iou(b, trackBox(tk));
        if (score > bestScore) { bestScore = score; bestId = tk.id; }
      }
      if (bestId >= 0 && bestScore >= 0.08) {
        const tk = tracks[bestId];
        updateEMA(tk, b);
        tk.lastT = t;
        tk.misses = 0;
        assigned.add(tk.id);
        tk.points.push({ t: Number(t.toFixed(2)), x: +((b.xmin + b.xmax) / 2).toFixed(4), y: +((b.ymax)).toFixed(4), w: +(b.xmax - b.xmin).toFixed(4), h: +(b.ymax - b.ymin).toFixed(4) });
        continue;
      }
      const tk = {
        id: nextId++,
        e0: b.xmin, e1: b.ymin, e2: b.xmax, e3: b.ymax,
        born: t, lastT: t, misses: 0, alive: true,
        color: null, colorFrames: [], points: [{ t: Number(t.toFixed(2)), x: +((b.xmin + b.xmax) / 2).toFixed(4), y: +(b.ymax).toFixed(4), w: +(b.xmax - b.xmin).toFixed(4), h: +(b.ymax - b.ymin).toFixed(4) }],
      };
      tracks.push(tk);
      assigned.add(tk.id);
    }

    for (const tk of tracks) {
      if (!assigned.has(tk.id)) {
        tk.misses++;
        if (tk.misses > MISS_TOLERANCE) tk.alive = false;
      }
      if (tk.alive && tk.colorFrames.length < 8 && i % 2 === 0) {
        const box = trackBox(tk);
        const color = await sampleTrackColor(file, box, WIDTH, H);
        if (color) tk.colorFrames.push(color);
      }
    }
    if (i % (FPS * 2) === 0) {
      const alive = tracks.filter((t) => t.alive).length;
      console.log(`t=${t}s: ${boxes.length} personas, ${alive} tracks activos`);
    }
  }

  for (const tk of tracks) {
    if (tk.colorFrames.length > 0) {
      const arr = (i) => tk.colorFrames.map((c) => c[i]).sort((a, b) => a - b);
      const mid = Math.floor(tk.colorFrames.length / 2);
      tk.color = [arr(0)[mid], arr(1)[mid], arr(2)[mid]].map((v) => Math.round(v));
    }
    delete tk.e0; delete tk.e1; delete tk.e2; delete tk.e3;
    delete tk.alive; delete tk.misses; delete tk.lastT; delete tk.colorFrames;
  }

  const kept = tracks
    .filter((t) => t.points.length >= Math.max(2, Math.round(FPS * 0.8)))
    .map((t) => {
      const { id, born, points, color } = t;
      return {
        id,
        born: Number(born.toFixed(2)),
        color,
        team: null,
        points,
      };
    });
  kept.sort((a, b) => a.born - b.born);

  const teams = classifyTeams(kept);
  if (teams) {
    for (const t of kept) if (t.color) t.team = teams.teamOf(t.color);
  }

  const result = {
    video: { width: vw, height: vh, durationSec: Number(durationSec.toFixed(2)) },
    analysis: { fps: FPS, frames: files.length },
    tracks: kept,
    teams: teams
      ? { A: teams.colors.A, B: teams.colors.B }
      : null,
  };

  rmSync(dir, { recursive: true, force: true });
  writeFileSync(outJson, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ok: true, tracks: kept.length, fps: FPS, frames: files.length, durationSec, teams: !!teams }));
}

main().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});