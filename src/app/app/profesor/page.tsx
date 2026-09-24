import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { GraduationCap, ArrowRight } from "lucide-react";
import { getSessionUser } from "@/lib/session";
import { listAlumnosConDetalle } from "@/lib/profile/service";

export const metadata: Metadata = { title: "Mis alumnos" };

export default async function ProfesorPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.rol !== "profesor") redirect("/app");

  const alumnos = await listAlumnosConDetalle(user.id);

  return (
    <div className="space-y-10">
      <header>
        <p className="label mb-2 text-muted">Panel del profesor</p>
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          {user.deporteDocente ? `Mis ${user.deporteDocente}` : "Mis alumnos"}
        </h1>
        <p className="mt-2 text-sm text-muted">
          Revisa los análisis que te comparten tus alumnas y alumnos, y deja correcciones con un toque.
        </p>
      </header>

      {alumnos.length === 0 ? (
        <section className="border border-hairline bg-surface px-6 py-16 text-center">
          <GraduationCap size={32} strokeWidth={1.5} className="mx-auto text-muted" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-medium text-ink">Aún no tienes alumnas/os vinculados</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
            Tus alumnas y alumnos te vinculan escribiendo tu correo en su perfil. Cuando lo hagan, sus videos
            aparecerán aquí para que los corrijas.
          </p>
        </section>
      ) : (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-medium text-ink">Alumnas/os vinculados</h2>
          </div>
          <div className="grid gap-px border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-3">
            {alumnos.map((alumno) => (
              <Link
                key={alumno.id}
                href={`/app/profesor/alumnos/${alumno.id}`}
                className="group flex flex-col justify-between gap-6 bg-canvas px-5 py-5 transition-colors hover:bg-surface"
              >
                <div>
                  <div className="flex size-10 items-center justify-center border border-ink/15 bg-surface text-sm font-semibold uppercase text-muted">
                    {alumno.name.slice(0, 1)}
                  </div>
                  <h3 className="mt-3 text-[15px] font-medium leading-6 text-ink group-hover:underline">
                    {alumno.name}
                  </h3>
                  <p className="mt-1 text-[11px] tracking-wide text-soft">{alumno.email}</p>
                </div>
                <div className="flex items-end justify-between">
                  <span className="label text-muted">
                    {alumno.videoCount === 0
                      ? "Sin videos aún"
                      : `${alumno.videoCount} ${alumno.videoCount === 1 ? "video" : "videos"}`}
                  </span>
                  <ArrowRight size={15} strokeWidth={1.8} className="text-muted group-hover:text-ink" aria-hidden="true" />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}