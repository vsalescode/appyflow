import { redirect } from "next/navigation";

import {
  getUserBySessionToken,
  isConfigured,
} from "@/application/auth/auth-service";
import { readSessionCookie } from "@/infrastructure/auth/cookie";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!(await isConfigured())) redirect("/setup");
  if (await getUserBySessionToken(await readSessionCookie()))
    redirect("/dashboard");
  const query = await searchParams;
  return (
    <section className="w-full rounded-3xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/50 sm:p-9">
      <p className="text-xs font-bold tracking-[0.18em] text-emerald-700 uppercase">
        Bem-vindo de volta
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Entrar</h1>
      <p className="mt-2 text-sm text-slate-500">
        Acesse seu workspace profissional.
      </p>
      {query.erro && (
        <p className="mt-4 text-sm text-red-700">Email ou senha inválidos.</p>
      )}
      <form action="/api/auth/login" method="post" className="mt-6 space-y-4">
        <label className="block text-sm font-medium">
          Email
          <input
            className="mt-2 w-full rounded-xl border bg-slate-50 p-3.5"
            name="email"
            type="email"
            required
            autoComplete="username"
          />
        </label>
        <label className="block text-sm font-medium">
          Senha
          <input
            className="mt-2 w-full rounded-xl border bg-slate-50 p-3.5"
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
        </label>
        <button
          className="w-full rounded-xl bg-emerald-600 p-3.5 font-bold text-white shadow-lg shadow-emerald-900/15 hover:bg-emerald-700"
          type="submit"
        >
          Entrar
        </button>
      </form>
    </section>
  );
}
