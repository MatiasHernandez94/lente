"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, RotateCcw } from "lucide-react";

export function ReintentarJobButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const onClick = async () => {
    setPending(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/ops/jobs/${jobId}/requeue`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Error");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo re-intentar.");
      setPending(false);
    }
  };

  return (
    <span>
      <button
        onClick={onClick}
        disabled={pending}
        className="inline-flex items-center gap-1.5 border border-ink/20 px-2.5 py-1 text-[11px] font-medium text-ink transition-colors hover:border-ink disabled:opacity-45"
      >
        {pending ? <LoaderCircle size={12} className="animate-spin" /> : <RotateCcw size={12} />}
        Re-intentar
      </button>
      {message ? <span className="ml-2 text-[11px] text-red-600">{message}</span> : null}
    </span>
  );
}