"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Clapperboard, LoaderCircle, RefreshCw, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface ClipButtonProps {
  correccionId: string;
  clipUrl: string | null;
}

export function ClipButton({ correccionId, clipUrl }: ClipButtonProps) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function generate(): Promise<void> {
    if (state === "loading") return;
    setState("loading");
    setError(null);
    try {
      const res = await fetch("/api/clips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ correccionId }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; clipUrl?: string };
      if (!res.ok || !data.clipUrl) {
        throw new Error(data.error ?? "No se pudo generar el clip.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar el clip.");
      setState("error");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {clipUrl ? (
        <Button type="button" variant="outline" size="sm" onClick={() => void window.open(clipUrl, "_blank")}>
          <ExternalLink size={13} aria-hidden="true" /> Ver clip
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void generate()}
          disabled={state === "loading"}
        >
          {state === "loading" ? (
            <span className="inline-flex items-center gap-1.5">
              <LoaderCircle size={13} className="animate-spin" aria-hidden="true" /> Generando…
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <Clapperboard size={13} aria-hidden="true" /> Generar clip
            </span>
          )}
        </Button>
      )}
      {clipUrl ? (
        <button
          type="button"
          onClick={() => void generate()}
          disabled={state === "loading"}
          className="label flex items-center gap-1 text-soft underline underline-offset-4 hover:text-ink"
        >
          <RefreshCw size={12} aria-hidden="true" /> Regenerar
        </button>
      ) : null}
      {error ? (
        <p role="alert" className="w-full text-xs text-red-900">
          {error}
        </p>
      ) : null}
    </div>
  );
}