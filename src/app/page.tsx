import Link from "next/link";
import { ArrowRight, UserRound, Clapperboard, Target, Camera, Upload, CirclePlay } from "lucide-react";
import { Logo } from "@/components/ui/Logo";

const MODULES = [
  {
    number: "01",
    title: "Inicio de usuario",
    text: "Acceso personal con sesión segura. Cada cuenta administra su propio acervo de material.",
    icon: UserRound,
  },
  {
    number: "02",
    title: "Análisis de videos",
    text: "Grabe desde su cámara, suba un archivo o detecte material público de YouTube para analizarlo.",
    icon: Clapperboard,
  },
  {
    number: "03",
    title: "OKRs y destacados",
    text: "Objetivos y resultados clave por análisis, con los momentos más relevantes de cada material.",
    icon: Target,
  },
];

const SPORTS = ["Fútbol", "Pádel", "Voleibol", "Baloncesto"];

function YoutubeSpot() {
  return <CirclePlay size={20} strokeWidth={1.5} className="shrink-0 text-ink" aria-hidden="true" />;
}

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="border-b border-hairline">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
          <Logo />
          <nav className="flex items-center gap-1" aria-label="Acceso">
            <Link href="/login" className="px-4 py-2 text-[13px] font-medium text-muted transition-colors hover:text-ink">
              Ingresar
            </Link>
            <Link
              href="/registro"
              className="inline-flex items-center gap-2 bg-ink px-4 py-2 text-[13px] font-medium text-canvas transition-colors hover:bg-muted"
            >
              Crear cuenta <ArrowRight size={14} strokeWidth={2} aria-hidden="true" />
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6">
        <section className="flex flex-col items-start gap-6 border-b border-hairline py-20 lg:py-28">
          <p className="label flex items-center gap-2 text-muted">
            <span className="size-1.5 rounded-full bg-ink" aria-hidden="true" />
            Análisis deportivo de video
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-6xl">
            Del video al dato,
            <br />
            en cuatro disciplinas.
          </h1>
          <p className="max-w-xl text-base leading-7 text-muted">
            Una plataforma local para analizar material deportivo — fútbol, pádel, voleibol y baloncesto — y
            obtener OKRs objetivos con lo más destacado de cada tramo.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/registro"
              className="inline-flex items-center gap-2 bg-ink px-6 py-3 text-sm font-medium text-canvas transition-colors hover:bg-muted"
            >
              Comenzar <ArrowRight size={15} strokeWidth={2} aria-hidden="true" />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 border border-ink/20 px-6 py-3 text-sm font-medium text-ink transition-colors hover:border-ink"
            >
              Ingresar
            </Link>
          </div>
        </section>

        <section className="border-b border-hairline py-14">
          <h2 className="label mb-8 text-muted">Módulos de la primera iteración</h2>
          <div className="grid gap-px border border-hairline bg-hairline md:grid-cols-3">
            {MODULES.map(({ number, title, text, icon: Icon }) => (
              <article key={number} className="flex flex-col gap-5 bg-canvas px-6 py-8">
                <div className="flex items-center justify-between">
                  <span className="label text-soft">{number}</span>
                  <Icon size={20} strokeWidth={1.5} className="text-ink" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-ink">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted">{text}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="border-b border-hairline py-14">
          <h2 className="label mb-8 text-muted">Fuentes de material</h2>
          <div className="grid gap-px border border-hairline bg-hairline sm:grid-cols-3">
            <article className="flex items-center gap-4 bg-canvas px-6 py-6">
              <Camera size={20} strokeWidth={1.5} className="shrink-0 text-ink" aria-hidden="true" />
              <p className="text-sm text-ink">
                <span className="font-medium">Cámara en vivo</span>
                <span className="block text-muted">Grabación desde su webcam.</span>
              </p>
            </article>
            <article className="flex items-center gap-4 bg-canvas px-6 py-6">
              <Upload size={20} strokeWidth={1.5} className="shrink-0 text-ink" aria-hidden="true" />
              <p className="text-sm text-ink">
                <span className="font-medium">Subida de archivo</span>
                <span className="block text-muted">MP4, WebM o MOV local.</span>
              </p>
            </article>
            <article className="flex items-center gap-4 bg-canvas px-6 py-6">
              <YoutubeSpot />
              <p className="text-sm text-ink">
                <span className="font-medium">Detección en YouTube</span>
                <span className="block text-muted">Análisis por enlace público.</span>
              </p>
            </article>
          </div>
        </section>

        <section className="py-14">
          <h2 className="label mb-8 text-muted">Disciplinas cubiertas</h2>
          <ul className="flex flex-wrap items-center justify-between gap-y-4">
            {SPORTS.map((sport) => (
              <li key={sport} className="border-b border-hairline pb-2">
                <span className="text-xl font-medium tracking-tight text-ink sm:text-2xl">{sport}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="border-t border-hairline">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-5">
          <p className="text-[11px] tracking-wide text-soft">Lente · Análisis deportivo de video</p>
          <p className="text-[11px] tracking-wide text-soft">Iteración local · Interfaz de escritorio</p>
        </div>
      </footer>
    </div>
  );
}