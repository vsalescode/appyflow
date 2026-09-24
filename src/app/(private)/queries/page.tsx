import { getUserBySessionToken } from "@/application/auth/auth-service";
import { listSearchQueries } from "@/application/search/query-generator";
import { readSessionCookie } from "@/infrastructure/auth/cookie";

export const dynamic = "force-dynamic";

export default async function QueriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getUserBySessionToken(await readSessionCookie());
  const queries = user ? await listSearchQueries(user.id) : [];
  const query = await searchParams;

  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <p className="text-xs font-bold tracking-[0.18em] text-emerald-700 uppercase">
        Estratégia de busca
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
        Queries de busca
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
        Gere e revise as consultas que serão usadas por um SearchProvider em uma
        etapa posterior.
      </p>
      {query.sucesso ? (
        <p className="mt-5 text-sm text-emerald-700">
          Queries geradas e deduplicadas.
        </p>
      ) : null}
      {query.erro ? (
        <p className="mt-5 text-sm text-red-700">
          Não foi possível gerar queries. Verifique o perfil, as preferências e
          a configuração de IA.
        </p>
      ) : null}
      <div className="mt-8 flex flex-wrap gap-3">
        <form action="/api/search-queries/generate" method="post">
          <button
            className="rounded-lg bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
            name="mode"
            type="submit"
            value="deterministic"
          >
            Gerar queries determinísticas
          </button>
        </form>
        <form action="/api/search-queries/generate" method="post">
          <button
            className="rounded-lg border border-emerald-700 px-5 py-3 text-sm font-semibold text-emerald-800"
            name="mode"
            type="submit"
            value="ai"
          >
            Gerar queries com IA
          </button>
        </form>
        <form action="/api/search-runs/manual" method="post">
          <button
            className="rounded-lg bg-emerald-700 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!queries.length}
            type="submit"
          >
            Buscar vagas agora
          </button>
        </form>
      </div>
      <section className="mt-10">
        <h2 className="text-xl font-semibold">Consultas registradas</h2>
        {!queries.length ? (
          <p className="mt-4 text-slate-600">Nenhuma query gerada.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {queries.map((item) => (
              <li
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                key={item.id}
              >
                <p className="font-medium">{item.query}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {item.origin === "AI"
                    ? `IA · ${item.aiModel ?? "modelo não informado"}`
                    : "Determinística"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
