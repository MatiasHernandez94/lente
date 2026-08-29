import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/AppShell";
import { getSessionUser } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  return <AppShell userName={user.name}>{children}</AppShell>;
}