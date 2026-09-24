import { redirect } from "next/navigation";

import { getUserBySessionToken } from "@/application/auth/auth-service";
import { readSessionCookie } from "@/infrastructure/auth/cookie";

import { DesktopNavigation, MobileNavigation } from "./private-navigation";

export const dynamic = "force-dynamic";

export default async function PrivateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUserBySessionToken(await readSessionCookie());
  if (!user) redirect("/login");
  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      <DesktopNavigation displayName={user.displayName} email={user.email} />
      <div className="min-w-0 flex-1">
        <MobileNavigation />
        {children}
      </div>
    </div>
  );
}
