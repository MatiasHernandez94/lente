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
