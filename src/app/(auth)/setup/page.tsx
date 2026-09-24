import { redirect } from "next/navigation";

import { isConfigured } from "@/application/auth/auth-service";

export const dynamic = "force-dynamic";

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (await isConfigured()) redirect("/login");
  const query = await searchParams;
  return (
    <section className="w-full rounded-3xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/50 sm:p-9">
      <p className="text-xs font-bold tracking-[0.18em] text-emerald-700 uppercase">
        Primeiro acesso
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">
        Configurar instalação
      </h1>
      <p className="mt-2 text-slate-600">
        Crie o único usuário desta instalação.
      </p>
      {query.erro && (
        <p className="mt-4 text-sm text-red-700">
          Verifique os dados. A senha deve ter ao menos 12 caracteres.
        </p>
      )}
      <form action="/api/auth/setup" method="post" className="mt-6 space-y-4">
        <label className="block text-sm font-medium">
          Nome
          <input
            className="mt-2 w-full rounded-xl border bg-slate-50 p-3.5"
            name="displayName"
            maxLength={120}
          />
        </label>
        <label className="block text-sm font-medium">
          Email
          <input
            className="mt-2 w-full rounded-xl border bg-slate-50 p-3.5"
            name="email"
            type="email"
            required
            maxLength={320}
          />
        </label>
        <label className="block text-sm font-medium">
          Senha
          <input
            className="mt-2 w-full rounded-xl border bg-slate-50 p-3.5"
            name="password"
            type="password"
            required
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
          />
        </label>
        <button
          className="w-full rounded-xl bg-emerald-600 p-3.5 font-bold text-white shadow-lg shadow-emerald-900/15 hover:bg-emerald-700"
          type="submit"
        >
          Criar usuário
        </button>
      </form>
    </section>
  );
}
