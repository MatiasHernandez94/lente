"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Check, Loader, RefreshCw, Send, Sparkles, TrendingDown, TrendingUp } from "lucide-react";

interface CoachReportPoint {
  title: string;
  detail: string;
  time_s: number | null;
}

interface CoachReport {
  summary: string;
  positives: CoachReportPoint[];
  improvements: CoachReportPoint[];
  provider: string;
  cached: boolean;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface CoachAssistantProps {
  playerName: string | null;
  videoId: string;
  onSeek?: (timeS: number) => void;
}

function formatMinute(timeS: number): string {
  const mins = Math.floor(timeS / 60);
  const secs = Math.round(timeS % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function CoachAssistant({ playerName, videoId, onSeek }: CoachAssistantProps) {
  const [report, setReport] = useState<CoachReport | null>(null);
  const [generating, setGenerating] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportHint, setReportHint] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "¡Hola! Soy tu asistente técnico. Genero un informe táctico del video marcando los momentos buenos y los que hay que mejorar, y respondo consultas con la referencia al minuto exacto.",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void fetch(`/api/videos/${videoId}/coach/report`)
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => {
        if (d?.summary) {
          setReport(d);
          setReportHint(null);
        } else if (d?.status === "queued") {
          setReportHint("El informe se está generando en la cola de procesamiento…");
        } else if (d?.status === "error") {
          setReportError(String(d.error ?? "La generación del informe falló."));
        }
      })
      .catch(() => setReportError("No se pudo consultar el informe del coach."));
  }, [videoId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    void fetch(`/api/videos/${videoId}/coach`)
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => {
        if (d?.messages && Array.isArray(d.messages) && d.messages.length > 0) {
          setMessages(d.messages);
        }
      })
      .catch(() => undefined);
  }, [videoId]);

  const pollUntilReport = async (): Promise<void> => {
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      await sleep(3000);
      try {
        const res = await fetch(`/api/videos/${videoId}/coach/report`);
        const d = await res.json();
        if (d?.summary) {
          setReport(d);
          setReportHint(null);
          return;
        }
        if (d?.status === "error") {
          setReportError(String(d.error ?? "La generación del informe falló."));
          return;
        }
      } catch {
        // reintentar
      }
    }
    setReportError("Tiempo de espera agotado mientras se generaba el informe.");
  };

  const generateReport = async () => {
    setGenerating(true);
    setReportError(null);
    setReportHint(null);
    try {
      const res = await fetch(`/api/videos/${videoId}/coach/report`, { method: "POST" });
      const data = await res.json();
      if (data?.status === "queued") {
        setReportHint("Informe encolado. Esperando al worker de procesamiento…");
        await pollUntilReport();
        return;
      }
      if (data?.summary) {
        setReport(data);
      } else if (data?.error) {
        setReportError(String(data.error));
      }
    } catch {
      setReportError("Error de red al generar el informe.");
    } finally {
      setGenerating(false);
    }
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setChatError(null);
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    setSending(true);
    try {
      const res = await fetch(`/api/videos/${videoId}/coach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      if (res.ok && data?.response) {
        setMessages((prev) => [...prev, { role: "assistant", content: String(data.response) }]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: String(data?.error ?? "No se pudo responder. Intentá de nuevo.") },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Hubo un error de red. Intentá de nuevo." },
      ]);
    } finally {
      setSending(false);
    }
  };

  const chipButton = (timeS: number) => (
    <button
      type="button"
      onClick={() => onSeek?.(timeS)}
      disabled={!onSeek}
      title={onSeek ? "Ir a este momento del video" : "Momento del video"}
      className="inline-flex items-center gap-1 rounded-sm border border-ink/20 px-1.5 py-0.5 text-[10px] font-medium text-ink transition-colors hover:border-ink hover:bg-surface disabled:cursor-default disabled:opacity-60"
      aria-label={`Ir al minuto ${formatMinute(timeS)} del video`}
    >
      <span className="size-1 rounded-full bg-ink" aria-hidden="true" />
      min {formatMinute(timeS)}
    </button>
  );

  return (
    <section className="flex flex-col border border-hairline bg-surface" aria-label="Asistente Técnico">
      <div className="flex items-center gap-2 border-b border-hairline px-4 py-3">
        <span className="flex size-7 items-center justify-center rounded-full bg-ink text-canvas">
          <Bot size={15} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">Consulta al Asistente Técnico</p>
          <p className="label text-soft">Coach de IA con datos del video y del análisis</p>
        </div>
        {report ? (
          <button
            type="button"
            onClick={generateReport}
            disabled={generating}
            className="inline-flex items-center gap-1.5 border border-ink/20 px-2.5 py-1.5 text-xs font-medium text-ink transition-colors hover:border-ink hover:bg-surface disabled:opacity-50"
          >
            <RefreshCw size={12} aria-hidden="true" /> {generating ? "Generando…" : "Regenerar informe"}
          </button>
        ) : null}
      </div>

      {/* Informe táctico */}
      <div className="flex flex-col gap-3 px-4 py-3">
        {!report ? (
          <div className="flex flex-col items-start gap-2 rounded-lg border border-hairline bg-canvas px-4 py-3">
            <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
              <Sparkles size={14} aria-hidden="true" /> Informe táctico del video
            </p>
            <p className="text-[13px] leading-5 text-muted">
              La IA analiza el video y el análisis deportivo, y destaca lo que haces bien y qué mejorar
              con la referencia al minuto exacto (por ejemplo: &ldquo;en el minuto 13 deberías haber quedado
              más cerrado con tu partner&rdquo;).
            </p>
            {playerName ? (
              <p className="text-[13px] leading-5 text-muted">
                Jugador en foco: <span className="font-medium text-ink">{playerName}</span>
              </p>
            ) : null}
            <button
              type="button"
              onClick={generateReport}
              disabled={generating}
              className="mt-1 inline-flex items-center gap-2 border border-ink/20 px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-ink hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
            >
              {generating ? <Loader size={12} className="animate-spin" aria-hidden="true" /> : <Sparkles size={12} aria-hidden="true" />}
              {generating ? "Generando informe…" : "Generar informe táctico"}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {report.summary ? (
              <p className="rounded-lg bg-canvas px-4 py-3 text-[13px] leading-5 text-muted">
                <span className="font-semibold text-ink">Resumen: </span>
                {report.summary}
              </p>
            ) : null}
            {report.positives.length > 0 ? (
              <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-green-800">
                  <TrendingUp size={13} aria-hidden="true" /> Lo que estás haciendo bien
                </p>
                <ul className="space-y-2">
                  {report.positives.map((point, i) => (
                    <li key={i} className="text-[13px] leading-5 text-green-900">
                      <p className="flex flex-wrap items-center gap-1.5 font-medium">
                        <Check size={13} className="shrink-0" aria-hidden="true" />
                        {point.title}
                        {point.time_s != null ? chipButton(point.time_s) : null}
                      </p>
                      <p className="mt-0.5 pl-[21px] text-green-700">{point.detail}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {report.improvements.length > 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-800">
                  <TrendingDown size={13} aria-hidden="true" /> A mejorar
                </p>
                <ul className="space-y-2">
                  {report.improvements.map((point, i) => (
                    <li key={i} className="text-[13px] leading-5 text-amber-900">
                      <p className="flex flex-wrap items-center gap-1.5 font-medium">
                        <span className="size-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
                        {point.title}
                        {point.time_s != null ? chipButton(point.time_s) : null}
                      </p>
                      <p className="mt-0.5 pl-[22px] text-amber-700">{point.detail}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <button
              type="button"
              onClick={generateReport}
              disabled={generating}
              className="inline-flex items-center gap-1.5 border border-ink/20 px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-ink hover:bg-surface disabled:opacity-50"
            >
              <RefreshCw size={12} aria-hidden="true" /> {generating ? "Generando…" : "Volver a generar"}
            </button>
          </div>
        )}

        {generating ? (
          <p className="flex items-center gap-1.5 text-[12px] text-muted">
            <Loader size={12} className="animate-spin" aria-hidden="true" /> Procesando el informe…
          </p>
        ) : null}
        {reportHint ? <p className="text-[12px] text-muted">{reportHint}</p> : null}
        {reportError ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-4 text-amber-800">
            {reportError}
          </p>
        ) : null}
      </div>

      {/* Chat */}
      <div className="flex max-h-56 flex-col border-t border-hairline">
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-3">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`max-w-[85%] px-3 py-2 text-sm ${
                msg.role === "user"
                  ? "self-end rounded-lg bg-ink text-canvas"
                  : "self-start rounded-lg bg-ink/5 text-muted"
              }`}
            >
              {msg.content}
            </div>
          ))}
          {sending ? (
            <div className="self-start flex items-center gap-2 rounded-lg bg-ink/5 px-3 py-2 text-xs text-soft">
              <Loader size={12} className="animate-spin" aria-hidden="true" /> Coach escribiendo…
            </div>
          ) : null}
          {chatError ? <p className="text-[12px] text-amber-700">{chatError}</p> : null}
          <div ref={messagesEndRef} />
        </div>
        <form
          className="flex items-center gap-2 border-t border-hairline px-3 py-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            void sendMessage();
          }}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="h-9 w-full rounded-md border border-hairline bg-transparent px-3 text-sm text-ink placeholder:text-soft focus:border-ink focus:outline-none"
            placeholder="Preguntale al coach: ¿qué hizo bien en el minuto 13?"
            aria-label="Consulta táctica al asistente"
            maxLength={400}
          />
          <button
            type="submit"
            disabled={sending || input.trim() === ""}
            className="flex size-9 shrink-0 items-center justify-center rounded-md border border-hairline text-ink transition-colors hover:border-ink disabled:opacity-40"
            aria-label="Enviar consulta"
          >
            <Send size={15} aria-hidden="true" />
          </button>
        </form>
      </div>
    </section>
  );
}