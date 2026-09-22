import type { Sport } from "@/lib/analysis/types";
import type { OKRTemplate, OKRSuggestion } from "./types";
import { OKR_TEMPLATES } from "./templates";

interface AnalysisSnapshot {
  score: number;
  metrics: Array<{ key: string; value: string; rating: number }>;
}

export function suggestOKRs(
  sport: Sport,
  analysis: AnalysisSnapshot,
): OKRSuggestion[] {
  const templates = OKR_TEMPLATES.filter(
    (t) => t.sport === sport || t.sport === "general",
  );

  const suggestions: OKRSuggestion[] = [];

  for (const template of templates) {
    const { reason, priority, matches } = evaluateTemplate(template, analysis);

    if (matches) {
      suggestions.push({ template, reason, priority });
    }
  }

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return suggestions.slice(0, 5);
}

function evaluateTemplate(
  template: OKRTemplate,
  analysis: AnalysisSnapshot,
): { reason: string; priority: "high" | "medium" | "low"; matches: boolean } {
  const score = analysis.score;

  // Score-based logic
  if (score < 50) {
    return {
      reason: "Tu puntuación actual es baja. Empecemos con los fundamentos.",
      priority: "high",
      matches: true,
    };
  }

  if (score < 70) {
    return {
      reason: "Hay espacio de mejora. Este objetivo te ayudará a crecer.",
      priority: "high",
      matches: true,
    };
  }

  if (score < 85) {
    return {
      reason: "Buen nivel actual. Este OKR te llevará al siguiente nivel.",
      priority: "medium",
      matches: true,
    };
  }

  // High scorers get advanced suggestions
  if (template.difficulty === "advanced") {
    return {
      reason: "Excelente nivel. Estos objetivos desafiantes te mantendrán en crecimiento.",
      priority: "medium",
      matches: true,
    };
  }

  return { reason: "", priority: "low", matches: false };
}

export function generateCustomOKR(
  title: string,
  objective: string,
  keyResults: Array<{ label: string; target: string; unit?: string }>,
): OKRTemplate {
  return {
    id: `custom-${Date.now()}`,
    sport: "general",
    exercise: null,
    title,
    objective,
    keyResults: keyResults.map((kr) => ({
      label: kr.label,
      target: kr.target,
      unit: kr.unit,
    })),
    difficulty: "intermediate",
  };
}
