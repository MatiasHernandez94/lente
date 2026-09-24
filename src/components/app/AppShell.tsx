"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useActionState } from "react";
import { LayoutDashboard, ListVideo, Target, Plus, Radio, LogOut, User, GraduationCap, Repeat } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { logout } from "@/app/actions/auth";
import { switchProfile } from "@/app/actions/admin";
import type { UserRol } from "@/lib/schema";

interface AppShellProps {
  userName: string;
  userRol: UserRol;
  unreadAlumnos?: number;
  isAdmin?: boolean;
  children: React.ReactNode;
}

const NAV_ITEMS = [
  { href: "/app", label: "Resumen", icon: LayoutDashboard },
  { href: "/app/videos", label: "Videos", icon: ListVideo },
  { href: "/app/okrs", label: "OKRs", icon: Target },
  { href: "/app/perfil", label: "Perfil", icon: User },
];

const PROFESOR_NAV_ITEM = { href: "/app/profesor", label: "Alumnos", icon: GraduationCap };

export function AppShell({ userName, userRol, unreadAlumnos = 0, isAdmin = false, children }: AppShellProps) {
  const pathname = usePathname();
  const navItems = userRol === "profesor" ? [...NAV_ITEMS.slice(0, 1), PROFESOR_NAV_ITEM, ...NAV_ITEMS.slice(1)] : NAV_ITEMS;

  const [_, switchAction] = useActionState(switchProfile, undefined);
  const isProfesorView = userRol === "profesor";
  const targetRol: UserRol = isProfesorView ? "alumno" : "profesor";

  function Badge() {
    if (unreadAlumnos === 0) return null;
    return (
      <span
        className="flex size-4 items-center justify-center rounded-full bg-ink text-[10px] font-semibold leading-none text-canvas"
        aria-label={`${unreadAlumnos} notificaciones sin leer`}
      >
        {unreadAlumnos > 9 ? "9+" : unreadAlumnos}
      </span>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="sticky top-0 z-20 border-b border-hairline bg-canvas/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-6 px-6">
          <Logo href="/app" className="shrink-0" />

          <nav className="hidden items-center gap-1 md:flex" aria-label="Navegación principal">
            {navItems.map(({ href, label, icon: Icon }) => {
              const active = href === "/app" ? pathname === "/app" : pathname.startsWith(href);
              const badge = href === PROFESOR_NAV_ITEM.href ? <Badge /> : null;
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
                  {badge}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/app/live"
              className="inline-flex items-center gap-2 border border-ink/20 px-4 py-2 text-[13px] font-medium text-ink transition-colors hover:bg-surface"
            >
              <Radio size={15} strokeWidth={2} aria-hidden="true" />
              <span className="hidden sm:inline">En vivo</span>
            </Link>
            <Link
              href="/app/nuevo"
              className="inline-flex items-center gap-2 bg-ink px-4 py-2 text-[13px] font-medium text-canvas transition-colors hover:bg-muted"
            >
              <Plus size={15} strokeWidth={2} aria-hidden="true" />
              <span className="hidden sm:inline">Nuevo análisis</span>
              <span className="sm:hidden">Nuevo</span>
            </Link>
            <div className="hidden items-center gap-3 border-l border-hairline pl-4 sm:flex">
              {isAdmin ? (
                <form action={switchAction}>
                  <input type="hidden" name="rol" value={targetRol} />
                  <button
                    type="submit"
                    title={isProfesorView ? "Ver como alumno/a" : "Ver como profesor/a"}
                    className="inline-flex cursor-pointer items-center gap-1.5 border border-ink/20 px-3 py-1.5 text-[12px] font-medium text-ink transition-colors hover:border-ink hover:bg-surface"
                  >
                    <Repeat size={13} strokeWidth={2} aria-hidden="true" />
                    {isProfesorView ? "Ver como alumno/a" : "Ver como profesor/a"}
                  </button>
                </form>
              ) : null}
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
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = href === "/app" ? pathname === "/app" : pathname.startsWith(href);
            const badge = href === PROFESOR_NAV_ITEM.href ? <Badge /> : null;
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
                {badge}
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