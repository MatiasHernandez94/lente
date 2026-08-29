"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { VideoStatus } from "@/lib/analysis/types";
import { Button } from "@/components/ui/Button";

interface AnalyzeButtonProps {
  videoId: string;
  status: VideoStatus;
}

export function AnalyzeButton({ videoId, status }: AnalyzeButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "ready") {
    return null;
  }

  const handleClick = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/videos/${videoId}/analizar`, { method: "POST" });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? "No se pudo iniciar el análisis.");
        return;
      }
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" onClick={handleClick} disabled={busy || status === "analyzing"}>
        {busy || status === "analyzing" ? "Analizando…" : "Analizar"}
      </Button>
      {error ? <span className="text-xs text-red-900">{error}</span> : null}
    </div>
  );
}