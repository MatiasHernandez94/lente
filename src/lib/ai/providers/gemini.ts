import { GoogleGenAI } from "@google/genai";
import { AIQuotaError, type AIProvider } from "./types";
import type {
  AuditContext,
  AuditVerdict,
  CoachChatContext,
  CoachContext,
  CoachReportDrill,
  CoachReportResult,
  ErrorType,
  FrameImage,
  ImprovementsContext,
  ImprovementsResult,
  SportContext,
  SportDetectionResult,
} from "./types";
import { SPORT_LABEL, SPORTS } from "@/lib/sports";
import { sportKnowledgeBlock, sportVisualClues } from "@/lib/sports/domain";
import type { Sport } from "@/lib/analysis/types";

const VALID_SPORTS = SPORTS.map((s) => s.value);

/**
 * Tope por request hacia Gemini.
 *
 * Sin timeout, una conexión colgada deja al worker atascado en `processing`
 * para siempre (el loop es secuencial) hasta que `reviveStaleJobs` lo mate.
 * 60s es holgado para vision + texto y acota el peor caso del SDK: 5 intentos
 * por defecto (408/429/5xx, backoff 1s ×2) → ≈ 5 min por intento de job.
 */
export const GEMINI_TIMEOUT_MS = 60_000;

/** Cliente Gemini con timeout. El retry lo trae el SDK (5 intentos por defecto). */
export function createGeminiClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({ apiKey, httpOptions: { timeout: GEMINI_TIMEOUT_MS } });
}

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
    this.ai = createGeminiClient(apiKey);
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

  async generateCoachReport(ctx: CoachContext): Promise<CoachReportResult> {
    try {
      const prompt = buildCoachReportPrompt(ctx);
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
      return parseCoachReportResponse(text, ctx.durationSeconds);
    } catch (error) {
      if (isQuotaError(error)) {
        throw new AIQuotaError("quota", error instanceof Error ? error.message : "Cuota agotada");
      }
      throw error;
    }
  }

  async coachChat(ctx: CoachChatContext): Promise<string> {
    try {
      const prompt = buildCoachChatPrompt(ctx);
      const response = await this.ai.models.generateContent({
        model: this.agentModel,
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
      });
      return (response.text ?? "").trim();
    } catch (error) {
      if (isQuotaError(error)) {
        throw new AIQuotaError("quota", error instanceof Error ? error.message : "Cuota agotada");
      }
      throw error;
    }
  }

  /**
   * Pasada 1 del razonamiento: pasos 3 (clasificar el error) y 4 (elegir la
   * corrección más crítica).
   *
   * El paso 2 (auditar métricas contra rangos) ya viene resuelto de forma
   * determinista en `auditBlock`: acá solo se juzga. La restricción de UNA sola
   * corrección es deliberada — es lo que evita la lista genérica de 5 mejoras
   * que no prioriza nada.
   */
  async auditAnalysis(ctx: AuditContext): Promise<AuditVerdict> {
    try {
      const prompt = buildAuditPrompt(ctx);
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
      return parseAuditResponse(text, ctx);
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

/**
 * Describe los fotogramas recibidos.
 *
 * Cuando llega un mosaico 2×2 (una sola imagen con cuatro momentos), hay que
 * decirle al modelo cómo leerlo: sin esa aclaración puede interpretar el grid
 * como una escena única con gente duplicada. El orden de las celdas es fijo
 * (ffmpeg `tile` llena de izquierda a derecha y de arriba abajo).
 */
function describeFrames(frames: FrameImage[]): string {
  if (frames.length === 0) return "Sin fotogramas.";

  const first = frames[0];
  if (first.gridCells && first.gridCells > 1) {
    const covered = first.gridCoveredFrames ?? first.gridCells;
    const cols = first.gridCells === 9 ? 3 : 2;
    return `Recibís UNA sola imagen que es un mosaico de ${covered} fotogramas del mismo video, ordenados en una grilla de ${cols} columnas:
- Se lee de izquierda a derecha y de arriba abajo: la celda 1 (arriba a la izquierda) es el momento más temprano y la última (abajo a la derecha) el más tardío.
- Los ${covered} cuadros son el MISMO Video en distintos momentos, no personas distintas ni planos distintos.
- Usalos para ver la evolución de la técnica a lo largo del video.`;
  }

  return `Recibís ${frames.length} fotograma(s) del video en orden, con su marca de tiempo.`;
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

PISTAS VISUALES POR DEPORTE:
${SPORTS.filter((s) => s.value !== "general").map((s) => `- ${s.label}: ${sportVisualClues(s.value)}`).join("\n")}

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
  const metricsBlock = compactMetricsBlock(ctx.metrics);

  const limitationsBlock =
    ctx.limitations.length > 0
      ? ctx.limitations.map((l) => `- ${l}`).join("\n")
      : "Sin limitaciones reportadas.";

  return `Sos un entrenador personal de ${SPORT_LABEL[ctx.sport]} especializado en análisis de video. A partir de estos fotogramas y las métricas del análisis, proponé mejoras concretas para el deportista o el equipo.

Deporte: ${SPORT_LABEL[ctx.sport]} (modo ${ctx.mode === "team" ? "equipo" : "individual"})
Video: "${ctx.videoTitle}"

CONOCIMIENTO DEL DEPORTE (usalo como referencia táctica y de técnica):
${sportKnowledgeBlock(ctx.sport)}

MÉTRICAS DETECTADAS [etiqueta, valor, unidad]:
${metricsBlock}

LIMITACIONES / QUÉ NO SE PUDO MEDIR (respetalo):
${limitationsBlock}

${describeFrames(ctx.frames)}

Respondé EXACTAMENTE en JSON:
{"summary": "resumen de 2-3 oraciones del video", "improvements": [{"title": "corto", "detail": "explicación y cómo entrenarlo", "priority": "alta|media|baja", "referenceToMetric": "opcional, nombre de la métrica"}]}

Reglas:
- 3 a 5 mejoras como máximo.
- Basate SOLO en lo que ves y en las métricas. No inventes datos.
- Si no se pudo medir algo relevante, decilo honestamente en "detail".
- Si entre las limitaciones hay alertas de desgaste o riesgo de lesión, mencionalas al principio del "summary" y asignale prioridad "alta".
- Usá el vocabulario del deporte (posiciones, roles, sistemas) que ves arriba, no vocabulario genérico.
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

function buildCoachReportPrompt(ctx: CoachContext): string {
  const metricsBlock = compactMetricsBlock(ctx.metrics);

  const timelineBlock =
    ctx.timeline.length > 0 ? ctx.timeline : "Sin eventos detectados con marca de tiempo.";

  const limitationsBlock =
    ctx.limitations.length > 0
      ? ctx.limitations.map((l) => `- ${l}`).join("\n")
      : "Sin limitaciones reportadas.";

  // El veredicto de la pasada 1 ya clasificó la falla y eligió la corrección
  // crítica. El informe la desarrolla con contexto táctico: NO la contradice ni
  // la reemplaza por otra.
  const auditBlock = ctx.audit
    ? `VEREDICTO DEL ANÁLISIS PREVIO (respetalo, es tu hallazgo principal):
- Tipo de falla: ${ctx.audit.error_type}
- Basado en: ${ctx.audit.based_on || "métricas del análisis"}
- Corrección prioritaria: ${ctx.audit.critical_fix.title} — ${ctx.audit.critical_fix.detail}
- Cue de entrenamiento: "${ctx.audit.critical_fix.cue}"
${
  ctx.audit.discarded.length > 0
    ? `- Alternativas ya descartadas (no las vuelvas a proponer): ${ctx.audit.discarded
        .map((d) => `${d.option} (${d.why_discarded})`)
        .join("; ")}`
    : ""
}
- Confianza: ${ctx.audit.confidence}
`
    : "Sin veredicto previo: razoná desde las métricas y los fotogramas.";

  return `Sos un Director Técnico y analista táctico de ${SPORT_LABEL[ctx.sport]} con mucha experiencia. Analizás el video del que recibís fotogramas y una línea de tiempo de eventos detectada automáticamente. Tu objetivo es dar un informe de coaching táctico completo y accionable.

Deporte: ${SPORT_LABEL[ctx.sport]} (modo ${ctx.mode === "team" ? "equipo" : "individual"})
Video: "${ctx.videoTitle}"
Duración: ${ctx.durationSeconds ?? "desconocida"} segundos

CONOCIMIENTO DEL DEPORTE (usalo como referencia táctica y de técnica):
${sportKnowledgeBlock(ctx.sport)}

MÉTRICAS DETECTADAS [etiqueta, valor, unidad]:
${metricsBlock}

${auditBlock}

LÍNEA DE TIEMPO DE EVENTOS (minuto y tipo):
${timelineBlock}

LIMITACIONES / QUÉ NO SE PUDO MEDIR:
${limitationsBlock}

${describeFrames(ctx.frames)}

Respondé EXACTAMENTE en JSON (sin markdown, sin texto extra):
{"summary": "resumen de 2-3 oraciones del partido/sesión",

Respondé EXACTAMENTE en JSON (sin markdown, sin texto extra):
{"summary": "resumen de 2-3 oraciones del partido/sesión", "positives": [{"title": "corto", "detail": "explicación de la situación táctica y por qué es un punto fuerte", "time_s": segundos_enteros_o_null}], "improvements": [{"title": "corto", "detail": "explicación de qué hacer distinto, cómo y por qué", "time_s": segundos_enteros_o_null}], "plan": [{"title": "corto", "detail": "ejercicio o cue de entrenamiento concreto"}]}

Reglas:
- 3 a 5 positives, 3 a 5 improvements y 2 a 3 elementos de "plan".
- En "time_s" usá SIEMPRE un segundo exacto que exista en la línea de tiempo de eventos (mm:ss → segundos), así el usuario puede ir a ese momento del video. Si una observación es general y no corresponde a un evento específico, poné null.
- Basate SOLO en los fotogramas, las métricas y la línea de tiempo. No inventes jugadas que no están.
- Si recibiste un VEREDICTO DEL ANÁLISIS PREVIO: su corrección prioritaria es TU hallazgo principal. Desarrollala con contexto táctico, no la contradigas ni la reemplaces. Las alternativas descartadas no las vuelvas a proponer.
- Sé específico y táctico: usá las posiciones, roles y conceptos del CONOCIMIENTO DEL DEPORTE de arriba (por ejemplo, en baloncesto hablá de box out, ayudas, pick & roll y espaciado; en pádel de cuadrar con la pareja y cubrir el medio).
- "plan" es el plan de corrección: 2 a 3 ejercicios o frases cortas de entrenamiento para atacar los problemas que encontraste. El primero tiene que atacar la corrección prioritaria del veredicto.
- Si entre las limitaciones aparece un riesgo de lesión o desgaste severo, ponelo primero en el "summary" antes que las mejoras tácticas.
- En español rioplatense, tono de entrenador directo pero constructivo.`;
}

function parseCoachReportResponse(text: string, durationSeconds: number | null): CoachReportResult {
  const parsed = extractJson(text);
  if (!parsed) {
    throw new Error("La respuesta de IA no fue JSON válido para el informe del coach.");
  }
  const summary = String(parsed.summary ?? "Informe sin resumen.").trim();
  const positives = sanitizeCoachPoints(parsed.positives, durationSeconds);
  const improvements = sanitizeCoachPoints(parsed.improvements, durationSeconds);
  const plan = sanitizeDrills(parsed.plan);
  return plan.length > 0 ? { summary, positives, improvements, plan } : { summary, positives, improvements };
}

function sanitizeDrills(raw: unknown): CoachReportDrill[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item: Record<string, unknown>) => ({
      title: String(item?.title ?? "").trim(),
      detail: String(item?.detail ?? "").trim(),
    }))
    .filter((drill: CoachReportDrill) => drill.title && drill.detail)
    .slice(0, 3);
}

function sanitizeCoachPoints(
  raw: unknown,
  durationSeconds: number | null,
): CoachReportResult["positives"] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item: Record<string, unknown>) => {
      const title = String(item.title ?? "").trim();
      const detail = String(item.detail ?? "").trim();
      let time: number | null = null;
      if (item.time_s != null) {
        const n = parseInt(String(item.time_s), 10);
        if (Number.isFinite(n) && n >= 0 && (durationSeconds == null || n < durationSeconds)) {
          time = n;
        }
      }
      return { title, detail, time_s: time };
    })
    .filter((p: CoachReportResult["positives"][number]) => p.title && p.detail)
    .slice(0, 5);
}

function buildCoachChatPrompt(ctx: CoachChatContext): string {
  const sportName = ctx.sport === "general" ? "actividad física" : SPORT_LABEL[ctx.sport];
  const metricsBlock = compactMetricsBlock(ctx.metrics);
  const timelineBlock =
    ctx.timeline.length > 0 ? ctx.timeline : "Sin eventos detectados con marca de tiempo.";

  const reportBlock = ctx.report
    ? `INFORME TÁCTICO GENERADO:
RESUMEN: ${ctx.report.summary}
COSAS QUE SE HACEN BIEN:
${ctx.report.positives.map((p) => `- ${p.title} (${p.time_s != null ? formatCoachTime(p.time_s) : "general"}): ${p.detail}`).join("\n")}
PARA MEJORAR:
${ctx.report.improvements.map((p) => `- ${p.title} (${p.time_s != null ? formatCoachTime(p.time_s) : "general"}): ${p.detail}`).join("\n")}${
        ctx.report.plan && ctx.report.plan.length > 0
          ? `
PLAN DE CORRECCIÓN:
${ctx.report.plan.map((d) => `- ${d.title}: ${d.detail}`).join("\n")}`
          : ""
      }`
    : "Aún no se generó un informe táctico. Respondé con lo que puedas deducir de los datos sin inventar.";

  const historyBlock =
    ctx.history.length > 0
      ? ctx.history.map((h) => `${h.role === "user" ? "Usuario" : "Coach"}: ${h.content}`).join("\n")
      : "Sin historial previo.";

  return `Sos un coach deportivo virtual de Lente especializado en ${sportName}. Respondés en español rioplatense, como un entrenador directo pero motivador, y usás TUS datos para responder.

Video: "${ctx.videoTitle}"
CONOCIMIENTO DEL DEPORTE (para usar vocabulario correcto):
${sportKnowledgeBlock(ctx.sport, true)}
CONVERSACIÓN ANTERIOR:
${historyBlock}

DATOS DEL ANÁLISIS:
MÉTRICAS [etiqueta, valor, unidad]:
${metricsBlock}

LÍNEA DE TIEMPO:
${timelineBlock}

${reportBlock}

CONSULTA DEL USUARIO: ${ctx.message}

Reglas:
- Respondé en 1-4 oraciones, concretas y accionables.
- Cuando cites un momento del video, da la marca de tiempo en el formato "minuto MM" o "MM:SS" usando eventos reales.
- Si no tenés el dato, decilo honestamente.
- No menciones "según el informe" ni te refieras a estos metadatos técnicos: hablá como coach.`;
}

function formatCoachTime(timeS: number): string {
  const mins = Math.floor(timeS / 60);
  const secs = Math.round(timeS % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

const VALID_ERROR_TYPES: ErrorType[] = [
  "postural",
  "timing",
  "espacial",
  "tactico",
  "condicion_fisica",
  "ninguno",
];

/**
 * Serializa métricas en formato compacto.
 *
 * En vez de `- Consistencia del ritmo: 69% (referencia: ≥ 85%)` por línea, manda
 * `[label, value, unit]`. El modelo no necesita la prosa para comparar números,
 * y el bloque de métricas se repetía completo en cada llamada.
 */
function compactMetricsBlock(metrics: { label: string; value: string; unit: string }[]): string {
  if (metrics.length === 0) return "[]";
  return JSON.stringify(metrics.map((m) => [m.label, m.value, m.unit || null]));
}

/**
 * Pasos 3 y 4: clasificar la falla y elegir UNA corrección.
 *
 * Del prompt original se conservan las tres ideas que funcionan: cruzar el
 * fotograma con los datos para tipificar el error, filtrar por la base de
 * conocimiento del deporte, y quedarse con la corrección más crítica en vez de
 * enumerar todas. El XML del prompt original se reemplaza por JSON porque el
 * resto del pipeline parsea JSON.
 */
function buildAuditPrompt(ctx: AuditContext): string {
  const metricsBlock = compactMetricsBlock(ctx.metrics);

  const limitationsBlock =
    ctx.limitations.length > 0
      ? ctx.limitations.map((l) => `- ${l}`).join("\n")
      : "Sin limitaciones reportadas.";

  // La memoria dinámica solo se manda si hay algo que inyectar: una sección
  // vacía haría creer al modelo que existen aprendizajes.
  const learningsBlock = ctx.learningsBlock ? `\n${ctx.learningsBlock}\n` : "";

  return `Sos 'SportsAnalytics-Engine', un analista de biomecánica y táctica deportiva. Recibís mét medidas sobre un video, una auditoría de esas métricas contra rangos de referencia, y fotogramas.

Deporte: ${SPORT_LABEL[ctx.sport]} (modo ${ctx.mode === "team" ? "equipo" : "individual"})
Video: "${ctx.videoTitle}"

MÉTRICAS MEDIDAS [etiqueta, valor, unidad]:
${metricsBlock}

AUDITORÍA DE MÉTRICAS (paso 2, ya resuelta — es tu ground truth, no la reaudites):
${ctx.auditBlock}
${learningsBlock}
CONOCIMIENTO DEL DEPORTE (errores típicos y correcciones validadas):
${ctx.knowledgeBlock}

LIMITACIONES / QUÉ NO SE PUDO MEDIR:
${limitationsBlock}

Completá este razonamiento EN SILENCIO (no lo escribas en la respuesta):
1. Contrastá lo que ves en los fotogramas con la auditoría. ¿El problema que muestra el video coincide con el que marcan los números?
2. Clasificá la falla en UNO de estos tipos: postural (técnica del cuerpo), timing (momento de ejecución), espacial (dónde se ubica o hacia dónde se mueve), tactico (decisión o lectura de juego), condicion_fisica (ritmo, resistencia, desgaste), ninguno (no hay falla clara).
3. De las correcciones posibles, quedate con UNA sola: la más crítica. Descartá el resto y decí por qué.

Respondé EXACTAMENTE en JSON (sin markdown, sin texto extra):
{"error_type": "postural|timing|espacial|tactico|condicion_fisica|ninguno", "based_on": "métrica o hallazgo de la auditoría en el que te basás", "critical_fix": {"title": "corto", "detail": "qué corregir y por qué importa", "cue": "frase corta de entrenamiento, la que le dirías al deportista"}, "discarded": [{"option": "corrección alternativa que consideraste", "why_discarded": "por qué no es la prioridad"}], "time_s": segundos_enteros_o_null, "confidence": "alta|media|baja"}

Reglas:
- UNA sola corrección en "critical_fix". No enumeres varias.
- "based_on" tiene que apuntar a una métrica o hallazgo concreto de la auditoría, no a una impresión general.
- Si recibiste AJUSTES APRENDIDOS, tienen prioridad sobre tu criterio inicial: ya son correcciones validadas de análisis anteriores. No los contradigas.
- "discarded" con 1 a 2 alternativas como máximo. Si descartás algo, explicá el porqué: eso es lo que evita recomendaciones genéricas.
- Si la auditoría dice que una métrica es NO MEDIBLE, no inventes una conclusión sobre ella. Usá otra evidencia o bajá la confianza.
- Si la confianza del análisis no es "alta", tu "confidence" no puede ser "alta".
- "cue" en imperativo y corto: es la frase que el deportista repite mientras entrena.
- En español rioplatense. JSON sin markdown.`;
}

function parseAuditResponse(text: string, ctx: AuditContext): AuditVerdict {
  const parsed = extractJson(text);
  if (!parsed) {
    throw new Error("La respuesta de IA no fue JSON válido para la auditoría.");
  }

  const rawType = String(parsed.error_type ?? "ninguno").toLowerCase().trim();
  const error_type: ErrorType = (VALID_ERROR_TYPES as string[]).includes(rawType)
    ? (rawType as ErrorType)
    : "ninguno";

  // La confianza no puede superar la del análisis determinista: si no se pudo
  // medir el ritmo, el modelo no puede estar "seguro" de nada que dependa de él.
  const auditConfidence = inferAuditConfidence(ctx.auditBlock);

  const rawFix = (parsed.critical_fix ?? {}) as Record<string, unknown>;
  const fix = {
    title: String(rawFix.title ?? "").trim() || "Sin corrección priorizada",
    detail: String(rawFix.detail ?? "").trim(),
    cue: String(rawFix.cue ?? "").trim() || String(rawFix.title ?? "").trim(),
  };

  const rawDiscarded = Array.isArray(parsed.discarded) ? parsed.discarded : [];
  const discarded = rawDiscarded
    .map((item: unknown) => {
      const rec = (item ?? {}) as Record<string, unknown>;
      return {
        option: String(rec.option ?? "").trim(),
        why_discarded: String(rec.why_discarded ?? "").trim(),
      };
    })
    .filter((d: { option: string; why_discarded: string }) => d.option && d.why_discarded)
    .slice(0, 2);

  let time: number | null = null;
  if (parsed.time_s != null) {
    const n = parseInt(String(parsed.time_s), 10);
    if (Number.isFinite(n) && n >= 0) time = n;
  }

  const confidence = clampConfidence(parsed.confidence, auditConfidence);

  return { error_type, based_on: String(parsed.based_on ?? "").trim(), critical_fix: fix, discarded, time_s: time, confidence };
}

function inferAuditConfidence(auditBlock: string): "alta" | "media" | "baja" {
  const match = auditBlock.match(/Confianza del análisis:\s*(alta|media|baja)/i);
  return (match?.[1]?.toLowerCase() as "alta" | "media" | "baja") ?? "media";
}

function clampConfidence(value: unknown, ceiling: "alta" | "media" | "baja"): "alta" | "media" | "baja" {
  const order = { baja: 0, media: 1, alta: 2 } as const;
  const v = String(value ?? "").toLowerCase();
  const parsed = v === "alta" || v === "media" || v === "baja" ? v : "media";
  return order[parsed] > order[ceiling] ? ceiling : parsed;
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