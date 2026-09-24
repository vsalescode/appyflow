import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getUserBySessionToken } from "@/application/auth/auth-service";
import { getJobDetails } from "@/application/search/job-details-service";
import {
  applicationStatusLabels,
  getAllowedApplicationTransitions,
} from "@/domain/application/application-pipeline";
import { readSessionCookie } from "@/infrastructure/auth/cookie";

const workModes = {
  UNKNOWN: "Não informada",
  REMOTE: "Remota",
  HYBRID: "Híbrida",
  ONSITE: "Presencial",
} as const;

const matchLabels = {
  COMPATIBLE: "Compatível",
  PARTIAL: "Parcial",
  INCOMPATIBLE: "Incompatível",
  UNKNOWN: "Não determinada",
} as const;

export default async function JobDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sucesso?: string; erro?: string }>;
}) {
  const user = await getUserBySessionToken(await readSessionCookie());
  if (!user) redirect("/login");
  const job = await getJobDetails(user.id, (await params).id);
  if (!job) notFound();
  const feedback = await searchParams;
  const latestOccurrence = job.occurrences[0];
  const applicationStatus = job.application?.status ?? "FOUND";

  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <Link
        className="text-sm font-semibold text-emerald-700"
        href="/dashboard"
      >
        ← Voltar às oportunidades
      </Link>
      {feedback.sucesso === "analise" && (
        <Notice tone="success">Análise com IA atualizada.</Notice>
      )}
      {feedback.erro === "analise" && (
        <Notice tone="error">Não foi possível analisar esta vaga.</Notice>
      )}
      {feedback.sucesso === "pipeline" && (
        <Notice tone="success">Etapa da candidatura atualizada.</Notice>
      )}
      {feedback.erro === "pipeline" && (
        <Notice tone="error">Esta mudança de etapa não é permitida.</Notice>
      )}
      {feedback.sucesso === "preparacao" && (
        <Notice tone="success">Conteúdo da candidatura preparado.</Notice>
      )}
      {feedback.erro === "preparacao" && (
        <Notice tone="error">Não foi possível preparar a candidatura.</Notice>
      )}

      <header className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              {job.title}
            </h1>
            <p className="mt-2 text-lg text-slate-600">
              {job.company ?? "Empresa não informada"}
            </p>
          </div>
          {job.match ? (
            <div className="rounded-2xl bg-slate-950 px-5 py-3 text-center text-white">
              <strong className="block text-2xl">{job.match.score}%</strong>
              <span className="text-xs text-slate-300">Match Score</span>
            </div>
          ) : (
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
              Nova · aguardando matching
            </span>
          )}
        </div>
        <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-3">
          <Metadata label="Modalidade" value={workModes[job.workArrangement]} />
          <Metadata
            label="Localização"
            value={job.location ?? "Não informada"}
          />
          <Metadata
            label="Publicação"
            value={formatDate(job.publishedAt) ?? "Não informada"}
          />
        </dl>
        <div className="mt-6 flex flex-wrap gap-3">
          {latestOccurrence && (
            <a
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white"
              href={latestOccurrence.canonicalUrl}
              rel="noreferrer"
              target="_blank"
            >
              Abrir vaga original ↗
            </a>
          )}
          {job.match && (
            <form action={`/api/jobs/${job.id}/match/analyze`} method="post">
              <button
                className="rounded-lg border px-4 py-2 text-sm font-semibold"
                type="submit"
              >
                {job.aiAnalysis
                  ? "Atualizar análise com IA"
                  : "Analisar com IA"}
              </button>
            </form>
          )}
        </div>
      </header>

      <Section title="Pipeline da candidatura">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs text-slate-500">Etapa atual</p>
            <p className="mt-1 font-semibold">
              {applicationStatusLabels[applicationStatus]}
            </p>
          </div>
          {getAllowedApplicationTransitions(applicationStatus).length > 0 && (
            <form
              action={`/api/jobs/${job.id}/application/status`}
              className="flex flex-wrap gap-2"
              method="post"
            >
              <select
                className="rounded-lg border bg-white px-3 py-2 text-sm"
                name="status"
              >
                {getAllowedApplicationTransitions(applicationStatus).map(
                  (status) => (
                    <option key={status} value={status}>
                      {applicationStatusLabels[status]}
                    </option>
                  ),
                )}
              </select>
              <button className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
                Atualizar etapa
              </button>
            </form>
          )}
        </div>
        {job.application?.history.length ? (
          <ol className="mt-6 space-y-3 border-l border-slate-200 pl-4">
            {job.application.history.map((event) => (
              <li className="text-sm" key={event.id}>
                <p>
                  {applicationStatusLabels[event.fromStatus]} →{" "}
                  <strong>{applicationStatusLabels[event.toStatus]}</strong>
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {event.changedAt.toLocaleString("pt-BR")}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-5 text-sm text-slate-500">
            Nenhuma mudança registrada.
          </p>
        )}
      </Section>

      <Section title="Preparar candidatura">
        <p className="text-sm text-slate-600">
          Gere conteúdo estruturado usando somente os fatos profissionais
          confirmados. O documento final será criado nas próximas etapas.
        </p>
        <form
          action={`/api/jobs/${job.id}/application/prepare`}
          className="mt-4 flex flex-wrap gap-2"
          method="post"
        >
          <select
            className="rounded-lg border bg-white px-3 py-2 text-sm"
            name="language"
          >
            <option value="AUTO">Detectar automaticamente</option>
            <option value="PT_BR">Português do Brasil</option>
            <option value="EN">Inglês</option>
          </select>
          <button className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">
            {job.application?.preparation
              ? "Gerar novamente"
              : "Preparar candidatura"}
          </button>
        </form>
        {job.application?.preparation && (
          <p className="mt-4 text-sm text-emerald-700">
            Conteúdo preparado em{" "}
            {job.application.preparation.language === "PT_BR"
              ? "português"
              : "inglês"}{" "}
            · {job.application.preparation.updatedAt.toLocaleString("pt-BR")}
          </p>
        )}
      </Section>

      <Section title="Descrição">
        <p className="text-sm leading-7 whitespace-pre-wrap text-slate-700">
          {job.description ??
            "A fonte não forneceu uma descrição para esta vaga."}
        </p>
      </Section>

      {job.match && (
        <Section title="Compatibilidade determinística">
          <p className="text-sm text-slate-500">
            Cobertura avaliada: {job.match.evaluatedWeight}/100
          </p>
          {job.match.matchedSkills.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {job.match.matchedSkills.map((skill) => (
                <span
                  className="rounded-md bg-emerald-50 px-2 py-1 text-xs text-emerald-800"
                  key={skill}
                >
                  {skill}
                </span>
              ))}
            </div>
          )}
          <ul className="mt-5 list-disc space-y-2 pl-5 text-sm text-slate-700">
            {job.match.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </Section>
      )}

      {job.aiAnalysis && (
        <Section title="Análise com IA">
          <p className="text-sm leading-6 text-slate-700">
            {job.aiAnalysis.explanation}
          </p>
          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            <Metadata
              label="Senioridade"
              value={matchLabels[job.aiAnalysis.seniorityMatch]}
            />
            <Metadata
              label="Localização"
              value={matchLabels[job.aiAnalysis.locationMatch]}
            />
          </dl>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <AnalysisList
              title="Pontos fortes"
              items={job.aiAnalysis.strengths}
            />
            <AnalysisList title="Gaps" items={job.aiAnalysis.gaps} />
            <AnalysisList
              title="Skills correspondentes"
              items={job.aiAnalysis.matchedSkills}
            />
            <AnalysisList
              title="Skills ausentes"
              items={job.aiAnalysis.missingSkills}
            />
          </div>
        </Section>
      )}

      <Section title="Origens encontradas">
        <ul className="space-y-3">
          {job.occurrences.map((occurrence) => (
            <li
              className="rounded-xl bg-slate-50 p-4 text-sm"
              key={occurrence.id}
            >
              <div className="flex flex-wrap justify-between gap-2">
                <strong>{occurrence.source.domain}</strong>
                <span className="text-slate-500">
                  {occurrence.discoveredAt.toLocaleString("pt-BR")}
                </span>
              </div>
              <p className="mt-1 text-slate-600">
                Query: {occurrence.searchQuery.query}
              </p>
            </li>
          ))}
        </ul>
      </Section>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Metadata({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}

function AnalysisList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      {items.length ? (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-slate-500">Nenhum item informado.</p>
      )}
    </div>
  );
}

function Notice({
  tone,
  children,
}: {
  tone: "success" | "error";
  children: React.ReactNode;
}) {
  return (
    <p
      className={`mt-5 rounded-xl p-3 text-sm ${
        tone === "success"
          ? "bg-emerald-50 text-emerald-800"
          : "bg-rose-50 text-rose-800"
      }`}
    >
      {children}
    </p>
  );
}

function formatDate(value: Date | null) {
  return value?.toLocaleDateString("pt-BR");
}
