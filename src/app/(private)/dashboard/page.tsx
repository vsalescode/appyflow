import Link from "next/link";
import { redirect } from "next/navigation";

import { getUserBySessionToken } from "@/application/auth/auth-service";
import { getOpportunityDashboard } from "@/application/dashboard/opportunity-dashboard-service";
import { applicationStatusLabels } from "@/domain/application/application-pipeline";
import { readSessionCookie } from "@/infrastructure/auth/cookie";

const categories = [
  { value: "ALL", label: "Todas" },
  { value: "NEW", label: "Novas" },
  { value: "HOT", label: "Quentes" },
  { value: "WARM", label: "Mornas" },
  { value: "COLD", label: "Frias" },
] as const;

const workModes = {
  UNKNOWN: "Não informada",
  REMOTE: "Remota",
  HYBRID: "Híbrida",
  ONSITE: "Presencial",
} as const;

const classificationStyle = {
  HOT: "bg-rose-50 text-rose-700 ring-rose-200",
  WARM: "bg-amber-50 text-amber-700 ring-amber-200",
  COLD: "bg-sky-50 text-sky-700 ring-sky-200",
} as const;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getUserBySessionToken(await readSessionCookie());
  if (!user) redirect("/login");
  const params = await searchParams;
  const dashboard = await getOpportunityDashboard(user.id, {
    category: first(params.category) ?? "ALL",
    workMode: first(params.workMode) ?? "ALL",
    query: first(params.query) ?? "",
  });

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10">
      <header className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="text-sm font-semibold text-emerald-700">AppyFlow</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Oportunidades
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Vagas descobertas e classificadas pela aderência ao seu perfil.
          </p>
        </div>
        <form action="/api/search-runs/manual" method="post">
          <button
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white"
            type="submit"
          >
            Buscar vagas agora
          </button>
        </form>
      </header>

      {params.sucesso === "busca" ? (
        <Notice tone="success">
          Busca concluída. As oportunidades encontradas já estão no dashboard.
        </Notice>
      ) : params.aviso === "busca" ? (
        <Notice tone="warning">
          Busca concluída parcialmente. Consulte o histórico em Preferências.
        </Notice>
      ) : params.erro === "busca" ? (
        <Notice tone="error">
          Não foi possível executar a busca. Verifique as queries e o provider.
        </Notice>
      ) : null}

      <section className="mt-8 grid gap-3 sm:grid-cols-5">
        {categories.map((category) => (
          <Link
            className={`rounded-2xl border p-4 transition hover:border-slate-400 ${
              dashboard.filter.category === category.value
                ? "bg-slate-950 text-white"
                : "bg-white"
            }`}
            href={`?category=${category.value}`}
            key={category.value}
          >
            <span className="text-sm opacity-75">{category.label}</span>
            <strong className="mt-1 block text-2xl">
              {dashboard.counts[category.value]}
            </strong>
          </Link>
        ))}
      </section>

      <form className="mt-6 grid gap-3 rounded-2xl border bg-white p-4 sm:grid-cols-[1fr_12rem_auto]">
        <input
          name="category"
          type="hidden"
          value={dashboard.filter.category}
        />
        <input
          className="rounded-lg border px-3 py-2 text-sm"
          defaultValue={dashboard.filter.query}
          maxLength={120}
          name="query"
          placeholder="Cargo, empresa ou localização"
        />
        <select
          className="rounded-lg border bg-white px-3 py-2 text-sm"
          defaultValue={dashboard.filter.workMode}
          name="workMode"
        >
          <option value="ALL">Todas as modalidades</option>
          <option value="REMOTE">Remota</option>
          <option value="HYBRID">Híbrida</option>
          <option value="ONSITE">Presencial</option>
          <option value="UNKNOWN">Não informada</option>
        </select>
        <button className="rounded-lg bg-slate-950 px-5 py-2 text-sm font-semibold text-white">
          Filtrar
        </button>
      </form>

      {!dashboard.jobs.length ? (
        <div className="mt-8 rounded-2xl border border-dashed bg-white p-10 text-center">
          <h2 className="font-semibold">Nenhuma oportunidade encontrada</h2>
          <p className="mt-2 text-sm text-slate-600">
            Ajuste os filtros ou execute novas buscas para encontrar vagas.
          </p>
          <Link
            className="mt-4 inline-flex text-sm font-semibold text-emerald-700"
            href="/queries"
          >
            Ver queries de busca
          </Link>
        </div>
      ) : (
        <ul className="mt-8 grid gap-4 lg:grid-cols-2">
          {dashboard.jobs.map((job) => {
            const occurrence = job.occurrences[0];
            return (
              <li
                className="rounded-2xl border bg-white p-5 shadow-sm"
                key={job.id}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="leading-snug font-semibold">
                      <Link
                        className="hover:text-emerald-700"
                        href={`/vagas/${job.id}`}
                      >
                        {job.title}
                      </Link>
                    </h2>
                    <p className="mt-1 text-sm text-slate-600">
                      {job.company ?? "Empresa não informada"}
                    </p>
                  </div>
                  {job.match ? (
                    <span
                      className={`shrink-0 rounded-full px-3 py-1 text-sm font-semibold ring-1 ${classificationStyle[job.match.classification]}`}
                    >
                      {job.match.score}%
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                      Nova
                    </span>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600">
                  <span className="rounded-full bg-violet-50 px-2 py-1 font-medium text-violet-700">
                    {
                      applicationStatusLabels[
                        job.application?.status ?? "FOUND"
                      ]
                    }
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-1">
                    {workModes[job.workArrangement]}
                  </span>
                  {job.location && (
                    <span className="rounded-full bg-slate-100 px-2 py-1">
                      {job.location}
                    </span>
                  )}
                  {occurrence && (
                    <span className="rounded-full bg-slate-100 px-2 py-1">
                      {occurrence.source.domain}
                    </span>
                  )}
                </div>

                {job.match?.matchedSkills.length ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {job.match.matchedSkills.slice(0, 5).map((skill) => (
                      <span
                        className="rounded-md bg-emerald-50 px-2 py-1 text-xs text-emerald-800"
                        key={skill}
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm">
                  <span className="text-slate-500">
                    Descoberta em {job.discoveredAt.toLocaleDateString("pt-BR")}
                  </span>
                  <Link
                    className="font-semibold text-emerald-700"
                    href={`/vagas/${job.id}`}
                  >
                    Ver detalhes →
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

function Notice({
  tone,
  children,
}: {
  tone: "success" | "warning" | "error";
  children: React.ReactNode;
}) {
  const colors = {
    success: "bg-emerald-50 text-emerald-800",
    warning: "bg-amber-50 text-amber-800",
    error: "bg-rose-50 text-rose-800",
  };
  return (
    <p className={`mt-6 rounded-xl p-4 text-sm ${colors[tone]}`}>{children}</p>
  );
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
