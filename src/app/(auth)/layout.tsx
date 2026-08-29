import { Logo } from "@/components/ui/Logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <header className="flex items-center justify-between border-b border-hairline px-6 py-5">
        <Logo />
        <p className="label hidden text-muted sm:block">Acceso restringido</p>
      </header>
      <main className="flex flex-1 items-center justify-center px-6 py-16">{children}</main>
      <footer className="border-t border-hairline px-6 py-4 text-center">
        <p className="text-[11px] tracking-wide text-soft">Análisis deportivo de video · Iteración local</p>
      </footer>
    </div>
  );
}