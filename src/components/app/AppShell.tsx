"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ListVideo, Target, Plus, LogOut } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { logout } from "@/app/actions/auth";

interface AppShellProps {
  userName: string;
  children: React.ReactNode;
}

const NAV_ITEMS = [
  { href: "/app", label: "Resumen", icon: LayoutDashboard },
  { href: "/app/videos", label: "Videos", icon: ListVideo },
  { href: "/app/okrs", label: "OKRs", icon: Target },
];

export function AppShell({ userName, children }: AppShellProps) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="sticky top-0 z-20 border-b border-hairline bg-canvas/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-6 px-6">
          <Logo href="/app" className="shrink-0" />

          <nav className="hidden items-center gap-1 md:flex" aria-label="Navegación principal">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const active = href === "/app" ? pathname === "/app" : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex items-center gap-2 px-4 py-2 text-[13px] font-medium transition-colors ${
                    active ? "text-ink" : "text-muted hover:text-ink"
                  }`}
                >
                  <Icon size={15} strokeWidth={1.8} aria-hidden="true" />
                  {label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/app/nuevo"
              className="inline-flex items-center gap-2 bg-ink px-4 py-2 text-[13px] font-medium text-canvas transition-colors hover:bg-muted"
            >
              <Plus size={15} strokeWidth={2} aria-hidden="true" />
              <span className="hidden sm:inline">Nuevo análisis</span>
              <span className="sm:hidden">Nuevo</span>
            </Link>
            <div className="hidden items-center gap-3 border-l border-hairline pl-4 sm:flex">
              <span className="flex size-8 items-center justify-center border border-ink/15 bg-surface text-xs font-semibold uppercase text-muted">
                {userName.slice(0, 1)}
              </span>
              <div className="leading-tight">
                <p className="text-[13px] font-medium text-ink">{userName}</p>
                <form action={logout} className="mt-0.5">
                  <button
                    type="submit"
                    className="label inline-flex cursor-pointer items-center gap-1 text-muted transition-colors hover:text-ink"
                  >
                    <LogOut size={12} strokeWidth={2} aria-hidden="true" /> Cerrar sesión
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>

        <nav className="flex items-center border-t border-hairline px-2 md:hidden" aria-label="Navegación móvil">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = href === "/app" ? pathname === "/app" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-1 items-center justify-center gap-1.5 py-3 text-[12px] font-medium ${
                  active ? "border-b-2 border-ink text-ink" : "text-muted"
                }`}
              >
                <Icon size={14} strokeWidth={1.8} aria-hidden="true" />
                {label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">{children}</main>

      <footer className="border-t border-hairline">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
          <p className="text-[11px] tracking-wide text-soft">
            Lente · Análisis deportivo de video · Fútbol, pádel, voleibol y baloncesto
          </p>
          <p className="text-[11px] tracking-wide text-soft">Iteración local</p>
        </div>
      </footer>
    </div>
  );
}