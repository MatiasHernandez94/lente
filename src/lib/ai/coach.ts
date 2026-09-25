import type { AnalysisResult, Sport } from "@/lib/analysis/types";
import type { OKR } from "@/lib/okrs/types";

export interface CoachMessage {
  role: "user" | "assistant";
  content: string;
}

interface CoachContext {
  sport: Sport;
  analysis: AnalysisResult | null;
  okrs: OKR[];
  videoTitle: string;
}

/** Formatea segundos como "MM:SS". */
export function formatClockTime(timeS: number): string {
  const mins = Math.floor(timeS / 60);
  const secs = Math.round(timeS % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

interface CoachEventLike {
  time_s: number;
  type: string;
  [key: string]: unknown;
}

interface CoachAnalysisLike {
  events?: {
    events?: CoachEventLike[];
  };
  tactical?: {
    transitions?: {
      events?: CoachEventLike[];
    };
  };
  fatigue?: {
    players?: Record<string, { injury_risks?: Array<{ type: string; time_s: number; severity: string }> }>;
  };
}

/**
 * Construye una línea de tiempo legible (con marca MM:SS) a partir del análisis
 * deportivo, para que la IA del coach pueda referenciar momentos exactos del video.
 * Función pura: testeable sin red ni sistema de archivos.
 */
export function buildCoachTimeline(analysis: CoachAnalysisLike | null | undefined, maxEvents = 80): string {
  if (!analysis) return "";

  const lines: string[] = [];

  const eventMap = new Map<string, string>();
  if (analysis.events) {
    const events = analysis.events.events ?? [];
    for (const ev of events.slice(0, maxEvents)) {
      eventMap.set(`E:${ev.time_s}:${ev.type}`, detailForEvent(ev));
    }
  }

  if (analysis.tactical?.transitions?.events) {
    for (const ev of analysis.tactical.transitions.events.slice(0, maxEvents)) {
      const detail = ev.type === "counterattack" ? "contraataque" : String(ev.type ?? "transición");
      eventMap.set(`T:${ev.time_s}:${detail}`, `[${formatClockTime(ev.time_s)}] ${detail} (transición)`);
    }
  }

  if (analysis.fatigue?.players) {
    for (const [, player] of Object.entries(analysis.fatigue.players)) {
      for (const risk of player.injury_risks ?? []) {
        if (typeof risk.time_s !== "number" || !risk.time_s) continue;
        eventMap.set(
          `R:${risk.time_s}:${risk.type}`,
          `[${formatClockTime(risk.time_s)}] riesgo ${risk.type} (severidad ${risk.severity})`,
        );
      }
    }
  }

  for (const ev of [...eventMap.values()].slice(0, maxEvents)) {
    lines.push(ev);
  }

  lines.sort((a, b) => {
    const timeA = timePrefixSeconds(a);
    const timeB = timePrefixSeconds(b);
    return timeA - timeB;
  });

  return lines.join("\n");
}

function detailForEvent(ev: CoachEventLike): string {
  const time = `[${formatClockTime(ev.time_s)}]`;
  const type = String(ev.type ?? "evento");
  const extras: string[] = [];
  if (ev.player_id != null) extras.push(`jugador ${ev.player_id}`);
  if (typeof ev.speed_mps === "number") extras.push(`${ev.speed_mps.toFixed(1)} m/s`);
  if (typeof ev.distance_m === "number") extras.push(`${ev.distance_m.toFixed(1)} m`);
  const suffix = extras.length > 0 ? `: ${extras.join(", ")}` : "";
  return `${time} ${type}${suffix}`;
}

function timePrefixSeconds(line: string): number {
  const match = line.match(/^\[(\d+):(\d+)\]/);
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function buildCoachSystemPrompt(ctx: CoachContext): string {
  const sportName = ctx.sport === "general" ? "actividad física" : ctx.sport;

  let prompt = `Sos un coach deportivo virtual de Lente. Tu nombre es Coach. Respondés en español, sé conciso y directo. Usás datos del análisis de video para dar feedback.

Deporte/actividad: ${sportName}
Video: "${ctx.videoTitle}"
`;

  if (ctx.analysis) {
    const a = ctx.analysis;
    prompt += `
PUNTUACIÓN: ${a.score}/100
RESUMEN: ${a.summary}

MÉTRICAS:
${a.metrics.map((m) => `- ${m.label}: ${m.value} ${m.unit} (objetivo: ${m.target}, rating: ${m.rating})`).join("\n")}
`;
  }

  if (ctx.okrs.length > 0) {
    prompt += `
OKRs ACTIVOS:
${ctx.okrs.map((okr) => `- ${okr.title}: ${okr.objective} [${okr.status}]`).join("\n")}
`;
  }

  prompt += `
INSTRUCCIONES:
- Si te preguntan por métricas, usá los datos del análisis
- Si te sugieren mejoras, basate en las métricas y OKRs
- Sé motivador pero realista
- Si no tenés datos de algo, decilo honestamente
- Respondé en 1-3 oraciones como máximo
`;

  return prompt;
}

export function generateCoachResponse(
  userMessage: string,
  ctx: CoachContext,
): string {
  const lower = userMessage.toLowerCase();

  // Simple pattern matching for demo (would be replaced with real LLM)
  if (lower.includes("puntuación") || lower.includes("score") || lower.includes("calificación")) {
    if (ctx.analysis) {
      return `Tu puntuación actual es ${ctx.analysis.score}/100. ${ctx.analysis.summary.slice(0, 150)}.`;
    }
    return "Aún no hay datos de análisis disponibles. Subí un video para obtener tu puntuación.";
  }

  if (lower.includes("mejorar") || lower.includes("consejo") || lower.includes("tip")) {
    if (ctx.analysis) {
      const weakest = ctx.analysis.metrics.reduce((min, m) =>
        m.rating < min.rating ? m : min
      );
      return `Tu área de mejora principal es "${weakest.label}" (${weakest.value} ${weakest.unit}, objetivo: ${weakest.target}). Concentrate en subir esta métrica en tus próximas sesiones.`;
    }
    return "Subí un video primero para que pueda darte consejos personalizados basados en tus datos.";
  }

  if (lower.includes("okr") || lower.includes("objetivo") || lower.includes("meta")) {
    if (ctx.okrs.length > 0) {
      const active = ctx.okrs.filter((o) => o.status === "active");
      if (active.length > 0) {
        return `Tenés ${active.length} OKR(es) activo(s): ${active.map((o) => o.title).join(", ")}. ¿Querés que analice tu progreso en alguno?`;
      }
      return "No tenés OKRs activos actualmente. ¿Querés que te sugiera algunos basados en tu análisis?";
    }
    return "Aún no tenés OKRs definidos. Subí un video y te sugeriré objetivos personalizados.";
  }

  if (lower.includes("hola") || lower.includes("hey") || lower.includes("buenas")) {
    return `¡Hola! Soy Coach. ¿En qué puedo ayudarte? Puedo analizar tus métricas, darte consejos de mejora o revisar tus OKRs.`;
  }

  if (lower.includes("gracias")) {
    return "¡De nada! ¿Algo más en lo que pueda ayudarte?";
  }

  // Default response
  if (ctx.analysis) {
    return `Basado en tu análisis (${ctx.analysis.score}/100), tu métrica más fuerte es "${ctx.analysis.metrics[0]?.label}" y tu área de mejora es "${ctx.analysis.metrics[ctx.analysis.metrics.length - 1]?.label}". ¿Querés que profundice en alguna?`;
  }

  return "¿Qué necesitás? Puedo ayudarte con métricas, consejos de mejora o seguimiento de objetivos.";
}
