import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Términos y condiciones" };

export default function TerminosPage() {
  return (
    <section className="w-full max-w-2xl border border-hairline bg-canvas px-8 py-10 sm:px-10">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Términos y condiciones</h1>
      <p className="mt-1.5 text-sm text-muted">Última actualización: septiembre de 2026</p>

      <div className="mt-8 space-y-6 text-sm leading-7 text-ink">
        <p>
          Al crear una cuenta en <strong>Lente</strong> usted acepta estos términos. La plataforma ofrece
          análisis deportivo de video por inteligencia artificial para fines de entrenamiento y mejora
          personal.
        </p>

        <h2 className="text-base font-semibold text-ink">1. Datos personales</h2>
        <p>
          Al registrarse le solicitamos nombre, correo, contraseña, peso, altura, los deportes que práctica
          y su rol (alumno o profesor). Estos datos se guardan de forma segura y se usan para personalizar su
          experiencia, administrar la relación alumno/ profesor y mostrar análisis relevantes.
        </p>

        <h2 className="text-base font-semibold text-ink">2. Rol de alumno/a y profesor/a</h2>
        <p>
          Si se registra como alumno/a puede indicar el correo de un profesor/a tutor. La relación se
          establece únicamente cuando ambas personas tienen cuenta en Lente y el correo coincide. Si se
          registra como profesor/a, indica qué deporte enseña y podrá administrar a sus alumnas/os.
        </p>

        <h2 className="text-base font-semibold text-ink">3. Videos y contenido</h2>
        <p>
          Usted es responsable del contenido de los videos que sube. No debe cargar material que viole
          derechos de autor, intimidad o normativa vigente. Lente procesa los videos para generar análisis
          estadísticos y recortes de escenas.
        </p>

        <h2 className="text-base font-semibold text-ink">4. Eliminación de cuenta</h2>
        <p>
          Puede eliminar su cuenta en cualquier momento desde la sección &quot;Mi perfil&quot;. La eliminación es
          permanente e irreversible: se borran su perfil, videos, análisis y relaciones con otros usuarios.
        </p>

        <h2 className="text-base font-semibold text-ink">5. Uso del servicio</h2>
        <p>
          El servicio no sustituye el &quot;criterio&quot; de un profesional de la salud ni de un entrenador titulado.
          Las métricas generadas son orientativas y deben interpretarse con juicio.
        </p>

        <h2 className="text-base font-semibold text-ink">6. Cambios en los términos</h2>
        <p>
          Podemos actualizar estos términos. Los cambios se publicarán en esta página y, cuando sean
          relevantes, le notificaremos por correo.
        </p>
      </div>

      <p className="mt-10 text-sm text-muted">
        ¿Preguntas? Escriba a nuestro soporte.{" "}
        <Link href="/registro" className="font-medium text-ink underline underline-offset-4">
          Volver al registro
        </Link>
      </p>
    </section>
  );
}