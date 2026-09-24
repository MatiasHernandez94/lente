import Link from "next/link";
import type { CorreccionConProfesor } from "@/lib/schema";
import { ShareActions } from "@/components/app/ShareActions";
import { ClipButton } from "@/components/app/ClipButton";

interface CorreccionesListProps {
  correcciones: CorreccionConProfesor[];
  shareUrl: string;
  alumnoName?: string;
  clipHrefPrefix?: string;
  puntaje?: number | null;
}

export function CorreccionesList({ correcciones, shareUrl, alumnoName, clipHrefPrefix, puntaje }: CorreccionesListProps) {
  return (
    <ul className="space-y-3">
      {correcciones.map((correccion) => (
        <li key={correccion.id} className="border border-hairline bg-canvas p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[13px] font-medium text-ink">{correccion.profesorName}</p>
            {correccion.minutoInicio !== null ? (
              <Link
                href={`${clipHrefPrefix ?? "/app/videos"}/${correccion.videoId}?t=${correccion.minutoInicio * 60}`}
                className="label text-soft underline underline-offset-4 hover:text-ink"
                title="Ver el video en ese instante"
              >
                min {correccion.minutoInicio}
              </Link>
            ) : (
              <span className="label text-soft">—</span>
            )}
          </div>
          <p className="mt-2 whitespace-pre-line text-sm leading-6 text-muted">{correccion.mensaje}</p>
          {correccion.minutoInicio || correccion.minutoFin ? (
            <p className="mt-1.5 text-[11px] tracking-wide text-soft">
              {correccion.minutoInicio !== null ? `Desde ${formatMinuto(correccion.minutoInicio)} ` : ""}
              {correccion.minutoFin !== null ? `hasta ${formatMinuto(correccion.minutoFin)}` : ""}
            </p>
          ) : null}
          {correccion.minutoInicio !== null ? (
            <div className="mt-2.5 border-t border-hairline pt-2.5">
              <ClipButton correccionId={correccion.id} clipUrl={correccion.clipUrl} />
            </div>
          ) : null}
          <div className="mt-3">
            <ShareActions
              videoUrl={shareUrl}
              mensaje={correccion.mensaje}
              minutoInicio={correccion.minutoInicio}
              alumnoName={alumnoName}
              puntaje={puntaje}
              clipUrl={correccion.clipUrl}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function formatMinuto(minuto: number): string {
  const m = Math.floor(minuto);
  const s = Math.round((minuto - m) * 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}