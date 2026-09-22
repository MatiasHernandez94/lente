export interface KeyResult {
  label: string;
  target: string;
  current?: string;
  unit?: string;
}

export interface OKR {
  id: string;
  videoId: string;
  userId: string;
  title: string;
  objective: string;
  keyResults: KeyResult[];
  status: "active" | "completed" | "archived";
  createdAt: string;
  updatedAt: string;
}

export interface OKRTemplate {
  id: string;
  sport: string;
  exercise: string | null;
  title: string;
  objective: string;
  keyResults: KeyResult[];
  difficulty: "beginner" | "intermediate" | "advanced";
}

export interface OKRSuggestion {
  template: OKRTemplate;
  reason: string;
  priority: "high" | "medium" | "low";
}
