import Link from "next/link";
import { redirect } from "next/navigation";

import { getUserBySessionToken } from "@/application/auth/auth-service";
import { readSessionCookie } from "@/infrastructure/auth/cookie";

export const dynamic = "force-dynamic";

export default async function PrivateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await getUserBySessionToken(await readSessionCookie())))
    redirect("/login");
  return (
    <>
      <header className="border-b bg-white">
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-6 py-4">
          <Link
            className="mr-3 font-semibold text-emerald-700"
            href="/dashboard"
          >
            AppyFlow
          </Link>
          <NavLink href="/dashboard">Vagas</NavLink>
          <NavLink href="/perfil">Perfil</NavLink>
          <NavLink href="/curriculos">Currículos</NavLink>
          <NavLink href="/preferencias">Preferências</NavLink>
          <NavLink href="/queries">Queries</NavLink>
          <NavLink href="/fontes">Fontes</NavLink>
          <form className="ml-auto" action="/api/auth/logout" method="post">
            <button
              className="rounded-lg border px-3 py-2 text-sm"
              type="submit"
            >
              Sair
            </button>
          </form>
        </nav>
      </header>
      {children}
    </>
  );
}

function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      className="rounded-lg px-3 py-2 text-sm hover:bg-slate-100"
      href={href}
    >
      {children}
    </Link>
  );
}
