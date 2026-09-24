import type { CorreccionConProfesor } from "@/lib/schema";
import { ShareActions } from "@/components/app/ShareActions";

interface CorreccionesListProps {
  correcciones: CorreccionConProfesor[];
  shareUrl: string;
  alumnoName?: string;
}

export function CorreccionesList({ correcciones, shareUrl, alumnoName }: CorreccionesListProps) {
  return (
    <ul className="space-y-3">
      {correcciones.map((correccion) => (
        <li key={correccion.id} className="border border-hairline bg-canvas p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[13px] font-medium text-ink">{correccion.profesorName}</p>
            <span className="label text-soft">min {correccion.minutoInicio ?? "—"}</span>
          </div>
          <p className="mt-2 whitespace-pre-line text-sm leading-6 text-muted">{correccion.mensaje}</p>
          {correccion.minutoInicio || correccion.minutoFin ? (
            <p className="mt-1.5 text-[11px] tracking-wide text-soft">
              {correccion.minutoInicio !== null ? `Desde ${formatMinuto(correccion.minutoInicio)} ` : ""}
              {correccion.minutoFin !== null ? `hasta ${formatMinuto(correccion.minutoFin)}` : ""}
            </p>
          ) : null}
          <div className="mt-3">
            <ShareActions
              videoUrl={shareUrl}
              mensaje={correccion.mensaje}
              minutoInicio={correccion.minutoInicio}
              alumnoName={alumnoName}
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