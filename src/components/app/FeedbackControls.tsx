"use client";

import { useState } from "react";
import { ThumbsUp, ThumbsDown, Check, LoaderCircle } from "lucide-react";

/**
 * Feedback sobre la corrección prioritaria.
 *
 * Es la señal que cierra el bucle de auto-aprendizaje: un pulgar arriba fija el
 * ajuste como válido, uno abajo lo guarda como restricción ("no repitas esto")
 * para que no vuelva a aparecer. Sin esta señal el agente no tiene forma de
 * saber si acertó.
 */
export function FeedbackControls({ videoId }: { videoId: string }) {
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [choice, setChoice] = useState<boolean | null>(null);
  // Solo se pide la corrección cuando el feedback es negativo: si la
  // recomendación funcionó, no hay nada que agregar.
  const [showCorrection, setShowCorrection] = useState(false);
  const [correction, setCorrection] = useState("");

  const send = async (helpful: boolean, text?: string) => {
    setState("saving");
    try {
      const res = await fetch(`/api/videos/${videoId}/coach/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ helpful, correction: text }),
      });
      if (!res.ok) throw new Error("Error");
      setState("done");
    } catch {
      setState("error");
    }
  };

  if (state === "done") {
    return (
      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted">
        <Check size={12} className="text-green-600" />
        Gracias, guardado. El coach lo va a tener en cuenta en los próximos análisis.
      </p>
    );
  }

  if (state === "saving") {
    return (
      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted">
        <LoaderCircle size={12} className="animate-spin" /> Guardando…
      </p>
    );
  }

  if (showCorrection) {
    return (
      <div className="mt-3 space-y-2">
        <label className="block text-[11px] text-muted" htmlFor={`fix-${videoId}`}>
          ¿Qué habría sido lo correcto?
        </label>
        <textarea
          id={`fix-${videoId}`}
          value={correction}
          onChange={(e) => setCorrection(e.target.value)}
          rows={2}
          maxLength={400}
          placeholder="Ej.: el ritmo estaba bien, el problema era la altura del salto"
          className="w-full border border-hairline bg-canvas px-2 py-1.5 text-[12px] text-ink outline-none focus:border-ink"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void send(false, correction.trim() || undefined)}
            className="border border-ink/20 px-2.5 py-1 text-[11px] font-medium text-ink transition-colors hover:border-ink"
          >
            Enviar
          </button>
          <button
            type="button"
            onClick={() => setShowCorrection(false)}
            className="px-2 py-1 text-[11px] text-muted hover:text-ink"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="text-[11px] text-muted">¿Te sirvió esta corrección?</span>
      <button
        type="button"
        aria-label="Me sirvió"
        title="Me sirvió"
        onClick={() => {
          setChoice(true);
          void send(true);
        }}
        className={`p-1 transition-colors ${
          choice === true ? "text-green-600" : "text-muted hover:text-ink"
        }`}
      >
        <ThumbsUp size={13} />
      </button>
      <button
        type="button"
        aria-label="No me sirvió"
        title="No me sirvió"
        onClick={() => {
          setChoice(false);
          setShowCorrection(true);
        }}
        className={`p-1 transition-colors ${
          choice === false ? "text-red-600" : "text-muted hover:text-ink"
        }`}
      >
        <ThumbsDown size={13} />
      </button>
      {state === "error" && (
        <span className="text-[11px] text-red-700">No se pudo guardar, probá de nuevo.</span>
      )}
    </div>
  );
}
