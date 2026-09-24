"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
  { href: "/dashboard", label: "Oportunidades", icon: "briefcase" },
  { href: "/perfil", label: "Perfil profissional", icon: "user" },
  { href: "/curriculos", label: "Currículos", icon: "document" },
  { href: "/preferencias", label: "Preferências", icon: "sliders" },
  { href: "/queries", label: "Queries de busca", icon: "search" },
  { href: "/fontes", label: "Fontes", icon: "globe" },
] as const;

export function DesktopNavigation({
  displayName,
  email,
}: {
  displayName?: string | null;
  email: string;
}) {
  return (
    <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col bg-slate-950 px-4 py-5 text-slate-300 lg:flex">
      <Brand />
      <div className="mt-8 px-3 text-[0.68rem] font-semibold tracking-[0.18em] text-slate-500 uppercase">
        Workspace
      </div>
      <Navigation className="mt-3 flex flex-col gap-1" />
      <div className="mt-auto border-t border-white/10 pt-4">
        <div className="mb-3 flex items-center gap-3 rounded-xl bg-white/5 p-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-emerald-400/15 text-sm font-bold text-emerald-300">
            {(displayName ?? email).slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">
              {displayName ?? "Conta principal"}
            </p>
            <p className="truncate text-xs text-slate-500">{email}</p>
          </div>
        </div>
        <LogoutButton />
      </div>
    </aside>
  );
}

export function MobileNavigation() {
  return (
    <div className="border-b border-slate-200 bg-white lg:hidden">
      <div className="flex items-center justify-between px-5 py-4">
        <Brand compact />
        <LogoutButton compact />
      </div>
      <Navigation
        className="flex scrollbar-none gap-1 overflow-x-auto px-4 pb-3"
        compact
      />
    </div>
  );
}

function Navigation({
  className,
  compact = false,
}: {
  className: string;
  compact?: boolean;
}) {
  const pathname = usePathname();
  return (
    <nav className={className}>
      {navigation.map((item) => {
        const active =
          pathname === item.href ||
          (item.href === "/dashboard" && pathname.startsWith("/vagas/"));
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={
              compact
                ? `flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${active ? "bg-emerald-50 text-emerald-800" : "text-slate-600"}`
                : `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${active ? "bg-emerald-400/15 text-emerald-300" : "text-slate-400 hover:bg-white/5 hover:text-white"}`
            }
            href={item.href}
            key={item.href}
          >
            <Icon name={item.icon} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className="flex items-center gap-3 px-2" href="/dashboard">
      <span className="grid size-9 place-items-center rounded-xl bg-emerald-400 font-black text-slate-950 shadow-lg shadow-emerald-950/20">
        A
      </span>
      <span>
        <strong
          className={`block tracking-tight ${compact ? "text-slate-950" : "text-white"}`}
        >
          AppyFlow
        </strong>
        {!compact && (
          <span className="block text-[0.68rem] tracking-[0.16em] text-slate-500 uppercase">
            Career workspace
          </span>
        )}
      </span>
    </Link>
  );
}

function LogoutButton({ compact = false }: { compact?: boolean }) {
  return (
    <form action="/api/auth/logout" method="post">
      <button
        className={
          compact
            ? "rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600"
            : "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-400 transition hover:bg-white/5 hover:text-white"
        }
        type="submit"
      >
        <Icon name="logout" />
        Sair
      </button>
    </form>
  );
}

function Icon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    briefcase: <path d="M3 7h18v12H3zM8 7V5h8v2M3 12h18M10 12v2h4v-2" />,
    user: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 8a7 7 0 0 0-14 0" />,
    document: <path d="M6 3h8l4 4v14H6zM14 3v5h5M9 13h6M9 17h6" />,
    sliders: (
      <path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h7M15 18h5M14 4v4M6 10v4M11 16v4" />
    ),
    search: (
      <path d="m20 20-4.2-4.2M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Z" />
    ),
    globe: (
      <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18M4.8 7.5h14.4M4.8 16.5h14.4" />
    ),
    logout: <path d="M10 5H5v14h5M14 8l4 4-4 4M18 12H9" />,
  };
  return (
    <svg
      aria-hidden="true"
      className="size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      {paths[name]}
    </svg>
  );
}
