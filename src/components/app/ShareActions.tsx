"use client";

import { useState } from "react";
import { Copy, Mail, MessageCircle } from "lucide-react";

interface ShareActionsProps {
  videoUrl: string;
  mensaje: string;
  minutoInicio?: number | null;
  alumnoName?: string;
}

export function ShareActions({ videoUrl, mensaje, minutoInicio, alumnoName }: ShareActionsProps) {
  const [copied, setCopied] = useState(false);

  const texto = [
    alumnoName ? `Hola ${alumnoName},` : "Hola,",
    "",
    mensaje,
    minutoInicio ? `Mira el video desde el minuto ${minutoInicio}.` : "",
    "",
    videoUrl,
  ]
    .filter(Boolean)
    .join("\n");

  const shareContent = encodeURIComponent(texto);
  const whatsappUrl = `https://wa.me/?text=${shareContent}`;
  const mailtoUrl = `mailto:?subject=${encodeURIComponent("Corrección de técnica · Lente")}&body=${shareContent}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 border border-ink/20 px-3 py-1.5 text-[12px] font-medium text-ink transition-colors hover:border-ink hover:bg-surface"
      >
        <MessageCircle size={13} aria-hidden="true" /> WhatsApp
      </a>
      <a
        href={mailtoUrl}
        className="inline-flex items-center gap-1.5 border border-ink/20 px-3 py-1.5 text-[12px] font-medium text-ink transition-colors hover:border-ink hover:bg-surface"
      >
        <Mail size={13} aria-hidden="true" /> E-mail
      </a>
      <button
        type="button"
        onClick={copy}
        className="inline-flex items-center gap-1.5 border border-ink/20 px-3 py-1.5 text-[12px] font-medium text-ink transition-colors hover:border-ink hover:bg-surface"
      >
        <Copy size={13} aria-hidden="true" /> {copied ? "¡Copiado!" : "Copiar"}
      </button>
    </div>
  );
}