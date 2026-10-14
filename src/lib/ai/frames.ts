import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, readdirSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { FrameImage } from "./providers/types";

const execFileAsync = promisify(execFile);

function ffmpegBin(): string {
  const bin = path.join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg");
  if (!existsSync(bin)) {
    throw new Error("ffmpeg no está disponible en este servidor.");
  }
  return bin;
}

export interface ExtractFramesOptions {
  count?: number;
  maxWidth?: number;
  /**
   * Ancho de cada celda al armar el grid. Si se pasa, los fotogramas se combinan
   * en UNA sola imagen (2×2) en vez de devolverse por separado.
   */
  gridCellWidth?: number;
  sampleFps?: number;
}

export interface ExtractedFrame extends FrameImage {
  timeSeconds: number;
}

/**
 * Extrae fotogramas del video como JPEG base64.
 *
 * Con `gridCellWidth` arma un único mosaico 2×2: una sola imagen en el request
 * en lugar de cuatro. El ahorro no viene de "juntar" (los tokens de visión se
 * cuentan por píxeles) sino de que permite bajar la resolución total manteniendo
 * los cuatro momentos del video — que es la palanca real de costo.
 */
export async function extractVideoFrames(
  videoPath: string,
  { count = 3, maxWidth = 640, gridCellWidth, sampleFps }: ExtractFramesOptions = {},
): Promise<ExtractedFrame[]> {
  const ffmpeg = ffmpegBin();
  if (count <= 0) return [];

  const outDir = path.join(tmpdir(), `lente-frames-${randomUUID()}`);
  const outPattern = path.join(outDir, "frame-%03d.jpg");
  mkdirSync(outDir, { recursive: true });

  const durationArg = await probeDuration(videoPath, ffmpeg);
  // Extraer frames distribuidos: fps tal que obtengamos ~count frames.
  const targetFps = Math.min(Math.max(0.5, count / Math.max(1, durationArg)), 1.0);
  const fpsFilter = `fps=${targetFps.toFixed(4)}`;

  if (gridCellWidth) {
    return extractGrid(ffmpeg, videoPath, outDir, {
      count,
      cellWidth: gridCellWidth,
      fpsFilter,
      duration: durationArg,
    });
  }

  try {
    await execFileAsync(
      ffmpeg,
      ["-i", videoPath, "-vf", `${fpsFilter},scale=${maxWidth}:-1`, "-frames:v", String(count), "-q:v", "3", outPattern],
      { timeout: 120_000 },
    );
  } catch (error) {
    throw new Error(`No se pudieron extraer los fotogramas: ${error instanceof Error ? error.message : "error"}`);
  }

  const files = readdirSync(outDir)
    .filter((f) => f.endsWith(".jpg"))
    .sort();
  if (files.length === 0) {
    throw new Error("No se pudieron extraer fotogramas del video.");
  }

  const frames: ExtractedFrame[] = files.map((file, i) => {
    const buf = readFileSync(path.join(outDir, file));
    const t0 = durationArg / Math.max(1, files.length);
    return {
      base64: buf.toString("base64"),
      mimeType: "image/jpeg",
      timeSeconds: Math.min(durationArg, i * t0),
    };
  });

  return frames;
}

/**
 * Arma un mosaico con los `count` fotogramas y lo devuelve como una sola imagen.
 *
 * ffmpeg hace el trabajo con el filtro `tile`: no hace falta canvas ni ninguna
 * dependencia extra. El `timeSeconds` devuelto es el del centro del video,
 * porque la imagen ya no representa un instante sino el conjunto; el orden de
 * las celdas se declara en el prompt (arriba a la izquierda = más temprano).
 */
async function extractGrid(
  ffmpeg: string,
  videoPath: string,
  outDir: string,
  opts: { count: number; cellWidth: number; fpsFilter: string; duration: number },
): Promise<ExtractedFrame[]> {
  const { count, cellWidth, fpsFilter, duration } = opts;
  // 2×2 cubre 4 fotogramas; para menos, el grid se completa con marcos negros.
  const grid = count <= 1 ? "1x1" : count <= 4 ? "2x2" : "3x3";
  const cells = grid === "1x1" ? 1 : grid === "2x2" ? 4 : 9;

  const outFile = path.join(outDir, "grid.jpg");

  try {
    await execFileAsync(
      ffmpeg,
      [
        "-i", videoPath,
        "-vf", `${fpsFilter},scale=${cellWidth}:-1,tile=${grid}`,
        "-frames:v", "1",
        "-q:v", "4",
        outFile,
      ],
      { timeout: 120_000 },
    );
  } catch (error) {
    throw new Error(`No se pudo armar el mosaico de fotogramas: ${error instanceof Error ? error.message : "error"}`);
  }

  if (!existsSync(outFile)) {
    throw new Error("No se pudo generar el mosaico de fotogramas del video.");
  }

  const buf = readFileSync(outFile);
  return [
    {
      base64: buf.toString("base64"),
      mimeType: "image/jpeg",
      timeSeconds: Math.round(duration / 2),
      gridCells: cells,
      gridCoveredFrames: Math.min(count, cells),
    },
  ];
}

async function probeDuration(videoPath: string, ffmpeg: string): Promise<number> {
  try {
    await execFileAsync(ffmpeg, ["-i", videoPath], { timeout: 15_000 });
  } catch (error) {
    // ffmpeg con "-i" solo termina en error pero imprime la metadata en stderr.
    const stderr = String(
      typeof error === "object" && error && "stderr" in error
        ? (error as { stderr: string }).stderr
        : "",
    );
    const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (match) {
      return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
    }
  }
  return 10;
}