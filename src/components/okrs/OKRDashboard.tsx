"use client";

import { useState, useEffect } from "react";
import { Target, Plus, Check, Archive, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface KeyResult {
  label: string;
  target: string;
  current?: string;
  unit?: string;
}

interface OKR {
  id: string;
  title: string;
  objective: string;
  keyResults: KeyResult[];
  status: "active" | "completed" | "archived";
}

interface Suggestion {
  template: {
    title: string;
    objective: string;
    keyResults: KeyResult[];
  };
  reason: string;
  priority: "high" | "medium" | "low";
}

interface Props {
  videoId: string;
}

export function OKRDashboard({ videoId }: Props) {
  const [okrs, setOkrs] = useState<OKR[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/videos/${videoId}/okrs`)
      .then((r) => r.json())
      .then((data) => {
        setOkrs(data.okrs || []);
        setSuggestions(data.suggestions || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [videoId]);

  const addFromSuggestion = async (suggestion: Suggestion) => {
    setAdding(suggestion.template.title);
    try {
      const res = await fetch(`/api/videos/${videoId}/okrs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: suggestion.template.title,
          objective: suggestion.template.objective,
          keyResults: suggestion.template.keyResults,
        }),
      });
      if (res.ok) {
        const { okr } = await res.json();
        setOkrs((prev) => [okr, ...prev]);
        setSuggestions((prev) => prev.filter((s) => s.template.title !== suggestion.template.title));
      }
    } finally {
      setAdding(null);
    }
  };

  const toggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "completed" : "active";
    await fetch(`/api/videos/${videoId}/okrs`, { method: "PATCH" });
    // Simple toggle for demo
    setOkrs((prev) =>
      prev.map((o) => (o.id === id ? { ...o, status: newStatus as OKR["status"] } : o))
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <LoaderCircle size={20} className="animate-spin text-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Active OKRs */}
      {okrs.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-muted">Mis OKRs</h3>
          {okrs.map((okr) => (
            <div
              key={okr.id}
              className={`border p-3 ${
                okr.status === "completed"
                  ? "border-green-200 bg-green-50"
                  : "border-hairline bg-surface"
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-ink">{okr.title}</p>
                  <p className="text-xs text-muted">{okr.objective}</p>
                </div>
                <button
                  onClick={() => toggleStatus(okr.id, okr.status)}
                  className="text-muted hover:text-ink"
                >
                  {okr.status === "completed" ? (
                    <Check size={14} className="text-green-600" />
                  ) : (
                    <Target size={14} />
                  )}
                </button>
              </div>
              <div className="mt-2 space-y-1">
                {okr.keyResults.map((kr, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-muted">
                    <span className="h-1 w-1 rounded-full bg-ink/30" />
                    <span>{kr.label}</span>
                    {kr.current && (
                      <span className="text-ink">
                        {kr.current}/{kr.target} {kr.unit}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-muted">Sugerencias para vos</h3>
          {suggestions.map((s, i) => (
            <div key={i} className="border border-hairline bg-surface p-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-ink">{s.template.title}</p>
                  <p className="text-xs text-muted">{s.reason}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => addFromSuggestion(s)}
                  disabled={adding === s.template.title}
                >
                  {adding === s.template.title ? (
                    <LoaderCircle size={12} className="animate-spin" />
                  ) : (
                    <Plus size={12} />
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {okrs.length === 0 && suggestions.length === 0 && (
        <div className="p-6 text-center">
          <Target className="mx-auto mb-2 text-muted" size={24} />
          <p className="text-sm text-muted">
            Subí un video para obtener OKRs sugeridos.
          </p>
        </div>
      )}
    </div>
  );
}
