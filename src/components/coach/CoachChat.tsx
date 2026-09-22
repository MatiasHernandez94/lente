"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  videoId: string;
}

export function CoachChat({ videoId }: Props) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "¡Hola! Soy Coach. Preguntame sobre tus métricas, consejos de mejora o seguimiento de objetivos.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`/api/videos/${videoId}/coach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: messages.slice(0, -1),
        }),
      });

      if (!res.ok) throw new Error("Error");
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.response }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Hubo un error. Intentá de nuevo." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-[400px] flex-col border border-hairline bg-canvas">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role === "assistant" && (
              <div className="flex h-6 w-6 shrink-0 items-center justify-center bg-ink text-white">
                <Bot size={12} />
              </div>
            )}
            <div
              className={`max-w-[80%] px-3 py-2 text-sm ${
                msg.role === "user"
                  ? "bg-ink text-white"
                  : "border border-hairline bg-surface text-ink"
              }`}
            >
              {msg.content}
            </div>
            {msg.role === "user" && (
              <div className="flex h-6 w-6 shrink-0 items-center justify-center border border-ink text-ink">
                <User size={12} />
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="flex gap-2">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center bg-ink text-white">
              <Bot size={12} />
            </div>
            <div className="border border-hairline bg-surface px-3 py-2">
              <LoaderCircle size={14} className="animate-spin text-muted" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-hairline p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Preguntale al coach..."
            className="flex-1 border border-hairline bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-ink"
            disabled={loading}
          />
          <Button type="submit" size="sm" disabled={loading || !input.trim()}>
            <Send size={14} />
          </Button>
        </form>
      </div>
    </div>
  );
}
