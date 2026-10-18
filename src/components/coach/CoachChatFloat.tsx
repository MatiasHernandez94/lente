"use client";

import { useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { CoachChat } from "@/components/coach/CoachChat";

interface Props {
  videoId: string;
}

export function CoachChatFloat({ videoId }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed right-6 top-[calc(var(--header-height,4rem)+1.25rem)] z-20">
      {open && (
        <div className="mb-3 w-[360px] overflow-hidden rounded-md border border-hairline bg-canvas shadow-lg">
          <div className="flex items-center justify-between border-b border-hairline px-4 py-2.5">
            <div className="flex items-center gap-1.5 text-xs font-medium text-ink">
              <MessageCircle size={13} /> Coach Virtual
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded p-1 text-muted transition-colors hover:text-ink"
              aria-label="Cerrar coach virtual"
            >
              <X size={14} />
            </button>
          </div>
          <CoachChat videoId={videoId} className="h-[380px]" />
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-11 w-11 items-center justify-center rounded-full bg-ink text-canvas shadow-lg transition-colors hover:bg-muted"
        aria-label={open ? "Cerrar coach virtual" : "Abrir coach virtual"}
        title={open ? "Cerrar coach virtual" : "Abrir coach virtual"}
      >
        {open ? <X size={16} /> : <MessageCircle size={16} />}
      </button>
    </div>
  );
}
