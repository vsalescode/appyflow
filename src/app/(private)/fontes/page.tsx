import { getUserBySessionToken } from "@/application/auth/auth-service";
import { listDiscoveredSources } from "@/application/search/source-service";
import { readSessionCookie } from "@/infrastructure/auth/cookie";

export const dynamic = "force-dynamic";

const sourceKinds = {
  UNKNOWN: "Não classificada",
  ATS: "ATS",
  CAREER_PAGE: "Página de carreiras",
  AGGREGATOR: "Agregador",
  SPECIALIZED_PORTAL: "Portal especializado",
} as const;

const scoreLevels = {
  HIGH: "Alta",
  MEDIUM: "Média",
  LOW: "Baixa",
} as const;

const managementLabels = {
  DEFAULT: "Padrão",
  PRIORITIZED: "Priorizada",
  BLOCKED: "Bloqueada",
} as const;

export default async function SourcesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getUserBySessionToken(await readSessionCookie());
  const sources = user ? await listDiscoveredSources(user.id) : [];
  const query = await searchParams;

  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <p className="text-xs font-bold tracking-[0.18em] text-emerald-700 uppercase">
        Qualidade da descoberta
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
        Fontes descobertas
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
        Domínios encontrados durante a normalização e suas métricas observadas.
      </p>
      {query.sucesso ? (
        <p className="mt-4 text-sm text-emerald-700">Decisão salva.</p>
      ) : null}
      {query.erro ? (
        <p className="mt-4 text-sm text-red-700">
          Não foi possível atualizar a fonte.
        </p>
      ) : null}

      {!sources.length ? (
        <p className="mt-8 text-slate-600">Nenhuma fonte descoberta.</p>
      ) : (
        <ul className="mt-8 space-y-4">
          {sources.map((source) => (
            <li
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              key={source.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{source.domain}</h2>
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">
                      {source.score.value}/100 ·{" "}
                      {scoreLevels[source.score.level]}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                      {managementLabels[source.managementStatus]}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600">
                    {source.provider} · {sourceKinds[source.kind]}
                  </p>
                </div>
                <p className="text-sm text-slate-600">
                  Primeira observação:{" "}
                  {source.firstSeenAt.toLocaleString("pt-BR")}
                  {" · "}
                  Última: {source.lastSeenAt.toLocaleString("pt-BR")}
                </p>
              </div>
              <dl className="mt-4 grid gap-3 sm:grid-cols-3">
                <Metric label="Ocorrências" value={source.occurrenceCount} />
                <Metric label="Vagas únicas" value={source.uniqueJobCount} />
                <Metric label="Snapshots" value={source.metricHistory.length} />
              </dl>
              <form
                action={`/api/sources/${source.id}/management`}
                className="mt-4 flex flex-wrap items-end gap-3"
                method="post"
              >
                <label className="text-sm font-medium">
                  Tratamento no pipeline
                  <select
                    className="mt-1 block rounded-lg border bg-white px-3 py-2"
                    defaultValue={source.managementStatus}
                    name="status"
                  >
                    <option value="DEFAULT">Padrão</option>
                    <option value="PRIORITIZED">Priorizar</option>
                    <option value="BLOCKED">Bloquear</option>
                  </select>
                </label>
                <button
                  className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
                  type="submit"
                >
                  Salvar
                </button>
              </form>
              <details className="mt-4 text-sm text-slate-600">
                <summary className="cursor-pointer font-medium text-slate-800">
                  Como a pontuação foi calculada
                </summary>
                <dl className="mt-3 grid gap-2 sm:grid-cols-4">
                  <Metric
                    label="Volume"
                    value={source.score.breakdown.volume}
                  />
                  <Metric
                    label="Baixa duplicação"
                    value={source.score.breakdown.uniqueness}
                  />
                  <Metric
                    label="Recência"
                    value={source.score.breakdown.freshness}
                  />
                  <Metric
                    label="Crescimento"
                    value={source.score.breakdown.momentum}
                  />
                </dl>
                <ul className="mt-3 list-disc space-y-1 pl-5">
                  {source.score.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </details>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-lg font-semibold">{value}</dd>
    </div>
  );
}
