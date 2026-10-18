"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export interface HiloPendienteDetalle {
  videoId: string;
  unreadCount: number;
  lastAt: string;
  lastMessage: string;
  lastAutorRol: "alumno" | "profesor";
  videoTitle: string;
  alumnoId: string;
  alumnoName: string;
}

export function ConsultasPendientes() {
  const [hilos, setHilos] = useState<HiloPendienteDetalle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/profesor/consultas-pendientes");
        if (active && res.ok) {
          const data = (await res.json()) as { hilos: HiloPendienteDetalle[] };
          setHilos(data.hilos ?? []);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (loading || hilos.length === 0) return null;

  return (
    <section aria-label="Consultas de alumnos" className="space-y-3">
      <h2 className="text-sm font-medium text-muted">Consultas pendientes</h2>
      <ul className="space-y-2">
        {hilos.map((h) => (
          <li key={h.videoId} className="border border-hairline bg-surface px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">
                  {h.alumnoName} ·{" "}
                  <Link
                    href={`/app/profesor/alumnos/${h.alumnoId}/videos/${h.videoId}`}
                    className="underline underline-offset-4 hover:text-muted"
                  >
                    {h.videoTitle}
                  </Link>
                </p>
                <p className="mt-1 line-clamp-2 text-sm text-muted">{h.lastMessage}</p>
                <p className="mt-1 text-[11px] text-soft">
                  {new Date(h.lastAt).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}
                  {" · "}
                  {h.unreadCount} sin leer
                </p>
              </div>
              <Link
                href={`/app/profesor/alumnos/${h.alumnoId}/videos/${h.videoId}`}
                className="inline-flex items-center gap-1.5 border border-ink/20 px-3 py-1.5 text-[12px] font-medium text-ink transition-colors hover:border-ink hover:bg-surface"
              >
                Responder
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
