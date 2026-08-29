"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export function DemoExamplesButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/videos/demo", { method: "POST" });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(body.error ?? "No se pudieron cargar los ejemplos.");
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
    <div className="flex flex-col items-start gap-2">
      <Button size="sm" variant="outline" onClick={handleClick} disabled={busy}>
        {busy ? "Cargando ejemplos…" : "Cargar ejemplos de demostración"}
      </Button>
      {error ? <span className="text-xs text-red-900">{error}</span> : null}
    </div>
  );
}