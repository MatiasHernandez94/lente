import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { listDeportes, listUserDeportes, listTutors } from "@/lib/profile/service";
import { ProfileForm } from "@/components/app/ProfileForm";
import { formatShortDate } from "@/lib/format";
import { deleteAccountAction } from "@/app/actions/profile";
import { Button } from "@/components/ui/Button";

export const metadata: Metadata = { title: "Mi perfil" };

export default async function PerfilPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [deportes, misDeportes, tutores] = await Promise.all([
    listDeportes(),
    listUserDeportes(user.id),
    user.rol === "alumno" ? listTutors(user.id) : [],
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-10">
      <header>
        <p className="label mb-2 text-muted">Cuenta</p>
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Mi perfil</h1>
        <p className="mt-2 text-sm text-muted">Datos personales, deportes y su rol en Lente.</p>
      </header>

      <section className="border border-hairline bg-surface px-6 py-5">
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="label text-muted">Rol</dt>
            <dd className="mt-1 font-medium text-ink capitalize">
              {user.rol === "profesor" ? "Profesor/a" : "Alumno/a"}
              {user.rol === "profesor" && user.deporteDocente ? (
                <span className="ml-1.5 text-muted">— {user.deporteDocente}</span>
              ) : null}
            </dd>
          </div>
          <div>
            <dt className="label text-muted">Peso / altura</dt>
            <dd className="mt-1 font-medium text-ink">
              {user.pesoKg ? `${user.pesoKg} kg` : "—"} / {user.alturaCm ? `${user.alturaCm} cm` : "—"}
            </dd>
          </div>
          <div>
            <dt className="label text-muted">Miembro desde</dt>
            <dd className="mt-1 font-medium text-ink">{formatShortDate(user.createdAt)}</dd>
          </div>
          <div>
            <dt className="label text-muted">Términos aceptados</dt>
            <dd className="mt-1 font-medium text-ink">
              {user.termsAccepted ? `Sí (${formatShortDate(user.termsAcceptedAt ?? user.createdAt)})` : "Pendiente"}
            </dd>
          </div>
        </dl>
        {misDeportes.length > 0 ? (
          <div className="mt-5">
            <dt className="label mb-2 text-muted">Deportes</dt>
            <dd className="flex flex-wrap gap-2">
              {misDeportes.map((deporte) => (
                <span
                  key={deporte.id}
                  className="border border-ink/15 bg-canvas px-3 py-1.5 text-[13px] font-medium text-ink"
                >
                  {deporte.nombre}
                </span>
              ))}
            </dd>
          </div>
        ) : null}
      </section>

      <ProfileForm deportes={deportes} defaultDeportes={misDeportes.map((d) => d.id)} rol={user.rol} />

      {user.rol === "alumno" && tutores.length > 0 ? (
        <section className="border border-hairline bg-surface px-6 py-5">
          <h2 className="text-base font-medium text-ink">Mis profesores/as</h2>
          <ul className="mt-3 space-y-3">
            {tutores.map(({ profesor, createdAt }) => (
              <li key={profesor.id} className="flex items-center justify-between gap-4 text-sm">
                <div>
                  <p className="font-medium text-ink">{profesor.name}</p>
                  <p className="text-xs text-muted">
                    {profesor.email}
                    {profesor.deporteDocente ? ` · ${profesor.deporteDocente}` : ""}
                  </p>
                </div>
                <span className="label shrink-0 text-soft">{formatShortDate(createdAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="border border-red-900/20 bg-red-50/60 px-6 py-5">
        <h2 className="text-base font-medium text-red-900">Zona de peligro</h2>
        <p className="mt-1 text-sm leading-6 text-red-900/80">
          Eliminar la cuenta borra de forma permanente su perfil, videos, análisis y relaciones, tanto con
          alumnas/os como con profesores/as. Esta acción no puede deshacerse.
        </p>
        <form action={deleteAccountAction} className="mt-4">
          <Button type="submit" variant="danger" className="border border-red-900/30">
            Eliminar mi cuenta
          </Button>
        </form>
      </section>
    </div>
  );
}