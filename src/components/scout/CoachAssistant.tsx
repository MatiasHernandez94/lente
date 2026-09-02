"use client";

import { Bot, Send } from "lucide-react";

interface CoachAssistantProps {
  playerName: string | null;
}

export function CoachAssistant({ playerName }: CoachAssistantProps) {
  return (
    <div className="flex flex-col border border-hairline bg-surface">
      <div className="flex items-center gap-2 border-b border-hairline px-4 py-3">
        <span className="flex size-7 items-center justify-center rounded-full bg-ink text-canvas">
          <Bot size={15} aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-medium text-ink">Consulta al Asistente Técnico</p>
          <p className="label text-soft">Análisis táctico con IA · próximamente</p>
        </div>
      </div>
      <div className="flex max-h-56 flex-col gap-2 overflow-y-auto px-4 py-3">
        <div className="max-w-[85%] rounded-lg bg-ink/5 px-3 py-2 text-sm text-muted">
          ¡Hola! Soy tu asistente técnico. En breve podré responder preguntas sobre rendimiento,
          velocidad y posiciones de cada jugador.
        </div>
        {playerName ? (
          <div className="self-end max-w-[85%] rounded-lg bg-soft/15 px-3 py-2 text-sm text-ink">
            ¿Cómo está jugando {playerName}?
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-2 border-t border-hairline px-3 py-2.5">
        <input
          type="text"
          className="h-9 w-full rounded-md border border-hairline bg-transparent px-3 text-sm text-ink placeholder:text-soft focus:border-ink focus:outline-none disabled:opacity-50"
          placeholder="Escribe una consulta táctica…"
          disabled
          aria-disabled="true"
        />
        <button
          type="button"
          className="flex size-9 shrink-0 items-center justify-center rounded-md border border-hairline text-soft disabled:opacity-40"
          disabled
          aria-label="Enviar consulta"
        >
          <Send size={15} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
