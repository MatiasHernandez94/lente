// Descarga un clip de YouTube, lo deja en data/uploads y crea el video scout en la cuenta del usuario.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createReadStream, createWriteStream, unlinkSync } from "node:fs";
import { accessSync, constants } from "node:fs";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const Database = require("better-sqlite3");
const ffmpegPath = require("ffmpeg-static");

const args = process.argv.slice(2);
const pick = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const url = pick("--url") ?? args[0];
const duration = Number(pick("--duration") ?? "0");
const email = pick("--email") ?? "matihernandezgomez@gmail.com";
const title = pick("--title") ?? "Partido de baloncesto (YouTube)";
const sport = pick("--sport") ?? "baloncesto";

if (!url || !url.includes("youtu")) {
  console.error("Uso: node scripts/youtube-scout.mjs --url <YOUTUBE_URL> [--duration <segundos, 0=todo>] [--title <título>] [--sport <deporte>] [--email <email>]");
  process.exit(1);
}

const venvDir = join(root, "data", ".venv");
const ytDlp = join(venvDir, "bin", "yt-dlp");
if (!exists(ytDlp)) {
  console.log("Instalando yt-dlp en el venv...");
  spawnSync("python3", ["-m", "venv", venvDir], { stdio: "inherit" });
  spawnSync(join(venvDir, "bin", "pip"), ["install", "-U", "yt-dlp"], { stdio: "inherit" });
}

const workDir = join(root, "data", "downloads");
spawnSync("mkdir", ["-p", workDir]);

const titleClean = title.replace(/[^\wÁÉÍÓÚáéíóúñÑ\- ]/g, "").trim().slice(0, 60);
const rawFile = join(workDir, `${randomUUID()}.mp4`);
const finalFile = join(root, "data", "uploads", `${randomUUID()}.mp4`);

console.log("Descargando...");
const ytArgs = [
  "--ffmpeg-location", dirname(ffmpegPath),
  "-f", "bv*[ext=mp4][height<=1080]+ba[ext=m4a]/b[ext=mp4]/b",
  "--merge-output-format", "mp4",
  "-o", rawFile.replace(/\.mp4$/, ".%(ext)s"),
  "--newline", url,
];
const dl = spawnSync(ytDlp, ytArgs, { stdio: "inherit", timeout: 600000 });
if (dl.status !== 0) {
  console.error("La descarga falló. ¿El enlace es válido y el video es público?");
  process.exit(1);
}

let segment = rawFile;
if (duration > 0) {
  console.log(`Recortando a ${duration} s...`);
  const tmp = join(workDir, `${randomUUID()}.mp4`);
  const ff = spawnSync(ffmpegPath, ["-y", "-i", rawFile, "-t", String(duration), "-c", "copy", tmp], { stdio: "inherit" });
  if (ff.status === 0) segment = tmp;
}

await rename(segment, finalFile);

const probe = spawnSync(ffmpegPath, ["-i", finalFile, "-f", "null", "-"], { stdio: ["ignore", "ignore", "pipe"] });
const probeErr = probe.stderr.toString();
const durMatch = probeErr.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
const durationSeconds = durMatch
  ? Number(durMatch[1]) * 3600 + Number(durMatch[2]) * 60 + Number(durMatch[3])
  : 0;

const sqlite = new Database(join(root, "data", "lente.db"));
const user = sqlite.prepare("SELECT id FROM users WHERE email = ?").get(email);
if (!user) {
  console.error(`No existe usuario con email ${email} en data/lente.db`);
  process.exit(1);
}
const now = new Date().toISOString();
const videoId = randomUUID();
const filename = basename(finalFile);
sqlite
  .prepare(
    `INSERT INTO videos (id, user_id, title, sport, source_type, source_ref, duration_seconds, players, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  .run(videoId, user.id, titleClean, sport, "upload", filename, Math.round(durationSeconds), "[]", "ready", now, now);
sqlite.close();
console.log(`Listo: ${titleClean} (${Math.round(durationSeconds)} s)`);
console.log(`Archivo: ${filename}`);
console.log(`Abrir: http://localhost:3000/app/videos/${videoId}`);

function exists(path) {
  try {
    accessSync(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function rename(from, to) {
  return new Promise((resolve, reject) => {
    const input = createReadStream(from);
    const output = createWriteStream(to);
    input.on("error", reject);
    output.on("error", reject);
    output.on("finish", () => {
      input.destroy();
      unlinkSync(from);
      resolve();
    });
    input.pipe(output);
  });
}