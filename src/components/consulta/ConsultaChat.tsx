"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send, User, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface ConsultaMessage {
  id: string;
  autorRol: "alumno" | "profesor";
  autorName: string;
  mensaje: string;
  createdAt: string;
}

interface ConsultaState {
  role: "alumno" | "profesor" | null;
  contraparteName: string;
  messages: ConsultaMessage[];
}

const EMPTY: ConsultaState = { role: null, contraparteName: "Profesor", messages: [] };

interface Props {
  videoId: string;
  readonly?: boolean;
  canWrite?: boolean;
}

export function ConsultaChat({ videoId, readonly = false, canWrite = true }: Props) {
  const [state, setState] = useState<ConsultaState>(EMPTY);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(
    () =>
      fetch(`/api/videos/${videoId}/consulta`)
        .then((r) => (r.ok ? (r.json() as Promise<ConsultaState>) : null))
        .then((data) => {
          if (data) setState(data);
        })
        .catch(() => undefined),
    [videoId],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading || readonly || !canWrite) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/videos/${videoId}/consulta`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (res.ok) {
        setInput("");
        await refresh();
      } else {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "No se pudo enviar el mensaje.");
      }
    } catch {
      setError("Hubo un error de red.");
    } finally {
      setLoading(false);
    }
  };

  const showInput = !readonly && canWrite;

  return (
    <div className="flex h-[320px] flex-col border border-hairline bg-canvas">
      <div className="flex items-center justify-between border-b border-hairline px-3 py-2">
        <p className="text-[12px] font-medium text-ink">Consultas al profesor/a</p>
        {state.contraparteName && <span className="text-[11px] text-muted">Con {state.contraparteName}</span>}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {state.messages.map((m) => {
          const isUser = state.role !== null && m.autorRol === state.role;
          return (
            <div key={m.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
              {!isUser && (
                <div className="mr-1.5 flex h-5 w-5 shrink-0 items-center justify-center bg-ink text-white">
                  <User size={11} />
                </div>
              )}
              <div
                className={`max-w-[85%] px-2.5 py-1.5 text-sm ${
                  isUser ? "bg-ink text-white" : "border border-hairline bg-surface text-ink"
                }`}
              >
                <p className="whitespace-pre-wrap leading-snug">{m.mensaje}</p>
                <p className={`mt-1 text-[10px] ${isUser ? "text-white/70" : "text-muted"}`}>
                  {new Date(m.createdAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              {isUser && (
                <div className="ml-1.5 flex h-5 w-5 shrink-0 items-center justify-center border border-ink text-ink">
                  <User size={11} />
                </div>
              )}
            </div>
          );
        })}
        {state.messages.length === 0 && (
          <p className="py-4 text-center text-xs text-muted">No hay mensajes todavía.</p>
        )}
        {loading && (
          <div className="flex items-center gap-1.5 px-1 text-xs text-muted">
            <LoaderCircle size={12} className="animate-spin" /> Enviando…
          </div>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div ref={endRef} />
      </div>

      {showInput && (
        <div className="border-t border-hairline p-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="flex gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Preguntale a tu profesor/a sobre este video…"
              className="flex-1 border border-hairline bg-canvas px-2.5 py-1.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-ink"
              disabled={loading}
              maxLength={2000}
            />
            <Button type="submit" size="sm" disabled={loading || !input.trim()}>
              <Send size={14} />
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
