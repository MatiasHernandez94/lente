"use client";

import { useState } from "react";
import { Save, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, TextInput, Select } from "@/components/ui/Field";
import { SPORTS } from "@/lib/sports";
import type { Sport } from "@/lib/analysis/types";

interface Props {
  videoId: string;
  initialTitle: string;
  initialSport: Sport;
  onSaved?: () => void;
}

export function SaveAnalysisPrompt({ videoId, initialTitle, initialSport, onSaved }: Props) {
  const [title, setTitle] = useState(initialTitle);
  const [sport, setSport] = useState<Sport>(initialSport);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const isDefault = initialTitle === "Video sin título" || initialTitle === "Video de YouTube" || initialTitle === "Video grabado";

  if (saved) return null;
  if (!isDefault && sport !== "general") return null;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/videos/${videoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), sport }),
      });
      if (!res.ok) throw new Error("No se pudo guardar.");
      setSaved(true);
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border border-amber-200 bg-amber-50">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <Save size={14} className="text-amber-600" />
          <span className="text-sm font-medium text-amber-900">
            {isDefault ? "Guardá este análisis con un título y deporte" : "Editá título y deporte"}
          </span>
        </div>
        <ChevronDown
          size={14}
          className={`text-amber-600 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded && (
        <div className="border-t border-amber-200 px-4 py-4 space-y-3">
          <Field label="Título">
            <TextInput
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej.: Final de liga"
              maxLength={120}
            />
          </Field>
          <Field label="Deporte">
            <Select value={sport} onChange={(e) => setSport(e.target.value as Sport)}>
              {SPORTS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </Select>
          </Field>
          {error && <p className="text-xs text-red-700">{error}</p>}
          <Button size="sm" onClick={handleSave} disabled={saving || !title.trim()}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      )}
    </div>
  );
}
