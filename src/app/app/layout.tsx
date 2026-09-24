import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { getSessionUser } from "@/lib/session";
import { countUnreadNotificaciones } from "@/lib/notificacion/service";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  const unreadAlumnos = user.rol === "profesor" ? await countUnreadNotificaciones(user.id) : 0;

  return (
    <AppShell userName={user.name} userRol={user.rol} unreadAlumnos={unreadAlumnos}>
      {children}
    </AppShell>
  );
}