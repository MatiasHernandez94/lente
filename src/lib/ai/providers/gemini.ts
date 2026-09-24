import { GoogleGenAI } from "@google/genai";
import { AIQuotaError, type AIProvider } from "./types";
import type {
  FrameImage,
  ImprovementsContext,
  ImprovementsResult,
  SportContext,
  SportDetectionResult,
} from "./types";
import { SPORT_LABEL, SPORTS } from "@/lib/sports";
import type { Sport } from "@/lib/analysis/types";

const VALID_SPORTS = SPORTS.map((s) => s.value);

interface GeminiClientCtor {
  apiKey: string;
  visionModel: string;
  agentModel: string;
}

function isQuotaError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("resource exhausted") ||
    msg.includes("rate limit") ||
    msg.includes("quota") ||
    msg.includes("permission to call") ||
    msg.includes("billing")
  );
}

export class GeminiProvider implements AIProvider {
  readonly name: string;

  private readonly ai: GoogleGenAI;
  private readonly visionModel: string;
  private readonly agentModel: string;

  constructor({ apiKey, visionModel, agentModel }: GeminiClientCtor) {
    this.ai = new GoogleGenAI({ apiKey });
    this.visionModel = visionModel;
    this.agentModel = agentModel;
    this.name = `gemini:${visionModel}`;
  }

  async detectSport(ctx: SportContext): Promise<SportDetectionResult> {
    try {
      const prompt = buildSportPrompt(ctx);
      const response = await this.ai.models.generateContent({
        model: this.visionModel,
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              ...ctx.frames.map((f) => toInlineData(f)),
            ],
          },
        ],
      });
      const text = (response.text ?? "").trim();
      return parseSportResponse(text);
    } catch (error) {
      if (isQuotaError(error)) {
        throw new AIQuotaError("quota", error instanceof Error ? error.message : "Cuota agotada");
      }
      throw error;
    }
  }

  async generateImprovements(ctx: ImprovementsContext): Promise<ImprovementsResult> {
    try {
      const prompt = buildImprovementsPrompt(ctx);
      const response = await this.ai.models.generateContent({
        model: this.agentModel,
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              ...ctx.frames.map((f) => toInlineData(f)),
            ],
          },
        ],
      });
      const text = (response.text ?? "").trim();
      return parseImprovementsResponse(text);
    } catch (error) {
      if (isQuotaError(error)) {
        throw new AIQuotaError("quota", error instanceof Error ? error.message : "Cuota agotada");
      }
      throw error;
    }
  }
}

function toInlineData(frame: FrameImage) {
  return { inlineData: { mimeType: frame.mimeType, data: frame.base64 } };
}

function buildSportPrompt(ctx: SportContext): string {
  return `Sos un analista deportivo experto. Observás estos fotogramas extraídos de un video grabado con celular o cámara.

Contexto del video:
- Título: "${ctx.videoTitle}"
- Duración: ${ctx.durationSeconds ?? "desconocida"} segundos
- Fuente: ${ctx.sourceType}

Determiná qué deporte se está practicando. Solo podés elegir UNO de estos valores: ${VALID_SPORTS.join(", ")}.
- "general" si no se puede identificar un deporte específico (entrenamiento libre, gimnasio, sin contexto claro).
- "futbol", "padel", "voleibol" o "baloncesto" si las evidencias lo confirman.

Respondé EXACTAMENTE en este formato JSON (sin markdown, sin texto extra):
{"sport": "uno_de_los_valores", "confidence": 0..1, "reason": "explicación breve en español de qué viste"}

Fijate en: tipo de cancha/espacio, tipo de pelota, arcos/canastas/redes, número de jugadores, uniformes. Si el único deporte razonable es el que ves, subí la confianza.`;
}

function parseSportResponse(text: string): SportDetectionResult {
  const parsed = extractJson(text);
  if (!parsed) {
    throw new Error("La respuesta de IA no fue JSON válido para detectar el deporte.");
  }
  const raw = String(parsed.sport ?? "").toLowerCase().trim();
  const sport: Sport = (VALID_SPORTS as string[]).includes(raw)
    ? (raw as Sport)
    : "general";
  const confidence = clampNumber(parsed.confidence, 0, 1, 0.5);
  const reason = String(parsed.reason ?? "Sin explicación adicional.").trim();
  return { sport, confidence, reason };
}

function buildImprovementsPrompt(ctx: ImprovementsContext): string {
  const metricsBlock =
    ctx.metrics.length > 0
      ? ctx.metrics.map((m) => `- ${m.label}: ${m.value} ${m.unit}`).join("\n")
      : "Sin métricas calculadas.";

  const limitationsBlock =
    ctx.limitations.length > 0
      ? ctx.limitations.map((l) => `- ${l}`).join("\n")
      : "Sin limitaciones reportadas.";

  return `Sos un entrenador personal de ${SPORT_LABEL[ctx.sport]} especializado en análisis de video. A partir de estos fotogramas y las métricas del análisis, proponé mejoras concretas para el deportista o el equipo.

Deporte: ${SPORT_LABEL[ctx.sport]} (modo ${ctx.mode === "team" ? "equipo" : "individual"})
Video: "${ctx.videoTitle}"

MÉTRICAS DETECTADAS:
${metricsBlock}

LIMITACIONES / QUÉ NO SE PUDO MEDIR (respetalo):
${limitationsBlock}

Respondé EXACTAMENTE en JSON:
{"summary": "resumen de 2-3 oraciones del video", "improvements": [{"title": "corto", "detail": "explicación y cómo entrenarlo", "priority": "alta|media|baja", "referenceToMetric": "opcional, nombre de la métrica"}]}

Reglas:
- 3 a 5 mejoras como máximo.
- Basate SOLO en lo que ves y en las métricas. No inventes datos.
- Si no se pudo medir algo relevante, decilo honestamente en "detail".
- En español rioplatense, tono de entrenador. JSON sin markdown.`;
}

function parseImprovementsResponse(text: string): ImprovementsResult {
  const parsed = extractJson(text);
  if (!parsed) {
    throw new Error("La respuesta de IA no fue JSON válido para las mejoras.");
  }
  const summary = String(parsed.summary ?? "Análisis sin resumen.").trim();
  const raw = Array.isArray(parsed.improvements) ? parsed.improvements : [];
  const improvements = raw
    .map((item: Record<string, unknown>) => ({
      title: String(item.title ?? "Mejora").trim(),
      detail: String(item.detail ?? "").trim(),
      priority: sanitizePriority(item.priority),
      referenceToMetric: item.referenceToMetric
        ? String(item.referenceToMetric).trim()
        : undefined,
    }))
    .filter((i: { title: string; detail: string }) => i.title && i.detail)
    .slice(0, 5);
  return { summary, improvements };
}

function extractJson(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/```(?:json)?/g, "").trim();
  try {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function sanitizePriority(value: unknown): "alta" | "media" | "baja" {
  const v = String(value ?? "media").toLowerCase();
  if (v === "alta" || v === "media" || v === "baja") return v;
  return "media";
}