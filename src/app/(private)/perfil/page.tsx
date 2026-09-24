import { getCandidateProfile } from "@/application/profile/profile-service";
import { getUserBySessionToken } from "@/application/auth/auth-service";
import { readSessionCookie } from "@/infrastructure/auth/cookie";

export const dynamic = "force-dynamic";

const seniorities = [
  ["UNSPECIFIED", "Não informada"],
  ["INTERN", "Estágio"],
  ["JUNIOR", "Júnior"],
  ["MID_LEVEL", "Pleno"],
  ["SENIOR", "Sênior"],
  ["LEAD", "Liderança técnica"],
  ["MANAGER", "Gestão"],
  ["EXECUTIVE", "Executiva"],
] as const;

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getUserBySessionToken(await readSessionCookie());
  const profile = user ? await getCandidateProfile(user.id) : null;
  const query = await searchParams;
  const pendingFacts =
    profile?.professionalFacts.filter(
      (fact) => fact.reviewStatus === "PENDING",
    ) ?? [];

  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <p className="text-xs font-bold tracking-[0.18em] text-emerald-700 uppercase">
        Sua base profissional
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
        Perfil profissional
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
        Registre apenas informações verdadeiras e verificáveis.
      </p>

      <form action="/api/profile/interpret" className="mt-6" method="post">
        <button
          className="rounded-lg border border-emerald-700 px-5 py-3 text-sm font-semibold text-emerald-800"
          type="submit"
        >
          Interpretar currículo atual com IA
        </button>
        <p className="mt-2 text-xs text-slate-500">
          Os fatos extraídos ficam pendentes até sua revisão.
        </p>
      </form>

      {query.sucesso === "interpretacao" ? (
        <p className="mt-5 text-sm text-emerald-700">
          Análise concluída: {query.skills ?? "0"} skills e{" "}
          {query.experiencias ?? "0"} experiências e {query.projetos ?? "0"}
          {" projetos e "}
          {query.idiomas ?? "0"} idiomas novos encontrados. Revise os campos e
          confirme ou rejeite os fatos profissionais extraídos.
          {query.descartados && query.descartados !== "0"
            ? ` ${query.descartados} item(ns) sem evidência verificável foram descartados.`
            : ""}
        </p>
      ) : query.sucesso === "fatos-confirmados" ? (
        <p className="mt-5 text-sm text-emerald-700">
          {query.confirmados ?? "0"} fatos restantes foram confirmados.
        </p>
      ) : query.sucesso ? (
        <p className="mt-5 text-sm text-emerald-700">Alterações salvas.</p>
      ) : null}
      {query.erro ? (
        <p className="mt-5 text-sm text-red-700">
          {query.erro === "limite-ia"
            ? "A IA atingiu o limite temporário de uso. Aguarde um minuto e tente novamente."
            : query.erro === "interpretacao"
              ? "Não foi possível interpretar o currículo. Tente novamente ou verifique o provider de IA."
              : "Revise os campos informados."}
        </p>
      ) : null}

      <form
        action="/api/profile"
        className="mt-8 grid gap-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:grid-cols-2 sm:p-8"
        method="post"
      >
        <label className="text-sm font-medium sm:col-span-2">
          Título profissional
          <input
            className="mt-2 block w-full rounded-lg border p-3"
            defaultValue={profile?.headline ?? ""}
            maxLength={160}
            name="headline"
          />
        </label>
        <label className="text-sm font-medium">
          Senioridade
          <select
            className="mt-2 block w-full rounded-lg border p-3"
            defaultValue={profile?.seniority ?? "UNSPECIFIED"}
            name="seniority"
          >
            {seniorities.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          País (código de duas letras)
          <input
            className="mt-2 block w-full rounded-lg border p-3"
            defaultValue={profile?.country ?? ""}
            maxLength={2}
            name="country"
            placeholder="BR"
          />
        </label>
        <label className="text-sm font-medium">
          Cidade
          <input
            className="mt-2 block w-full rounded-lg border p-3"
            defaultValue={profile?.city ?? ""}
            maxLength={120}
            name="city"
          />
        </label>
        <label className="text-sm font-medium">
          Estado ou região
          <input
            className="mt-2 block w-full rounded-lg border p-3"
            defaultValue={profile?.region ?? ""}
            maxLength={120}
            name="region"
          />
        </label>
        <label className="text-sm font-medium sm:col-span-2">
          Resumo
          <textarea
            className="mt-2 block min-h-32 w-full rounded-lg border p-3"
            defaultValue={profile?.summary ?? ""}
            maxLength={4000}
            name="summary"
          />
        </label>
        <button
          className="w-fit rounded-lg bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
          type="submit"
        >
          Salvar perfil
        </button>
      </form>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Adicionar fato profissional</h2>
        <form
          action="/api/profile/facts"
          className="mt-4 grid gap-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:grid-cols-2 sm:p-8"
          method="post"
        >
          <label className="text-sm font-medium">
            Tipo
            <select
              className="mt-2 block w-full rounded-lg border p-3"
              name="type"
            >
              <option value="SKILL">Skill</option>
              <option value="EXPERIENCE">Experiência</option>
              <option value="PROJECT">Projeto</option>
              <option value="LANGUAGE">Idioma</option>
            </select>
          </label>
          <label className="text-sm font-medium">
            Skill ou cargo
            <input
              className="mt-2 block w-full rounded-lg border p-3"
              maxLength={160}
              name="title"
              required
            />
          </label>
          <label className="text-sm font-medium">
            Empresa (obrigatória para experiência)
            <input
              className="mt-2 block w-full rounded-lg border p-3"
              maxLength={160}
              name="organization"
            />
          </label>
          <label className="text-sm font-medium">
            Início
            <input
              className="mt-2 block w-full rounded-lg border p-3"
              name="startedAt"
              type="date"
            />
          </label>
          <label className="text-sm font-medium">
            Término
            <input
              className="mt-2 block w-full rounded-lg border p-3"
              name="endedAt"
              type="date"
            />
          </label>
          <label className="text-sm font-medium sm:col-span-2">
            Descrição ou evidência
            <textarea
              className="mt-2 block min-h-24 w-full rounded-lg border p-3"
              maxLength={4000}
              name="description"
            />
          </label>
          <button
            className="w-fit rounded-lg bg-slate-950 px-5 py-3 text-sm font-semibold text-white"
            type="submit"
          >
            Adicionar fato
          </button>
        </form>
      </section>

      <section className="mt-10" id="fatos-profissionais">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Fatos profissionais</h2>
            {pendingFacts.length ? (
              <p className="mt-1 text-sm text-slate-600">
                Exclua ou rejeite os itens incorretos antes de confirmar o
                restante.
              </p>
            ) : null}
          </div>
          {pendingFacts.length ? (
            <form action="/api/profile/facts/confirm-all" method="post">
              <button
                className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
                type="submit"
              >
                Aceitar todas as restantes ({pendingFacts.length})
              </button>
            </form>
          ) : null}
        </div>
        {!profile?.professionalFacts.length ? (
          <p className="mt-4 text-slate-600">Nenhum fato registrado.</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {profile.professionalFacts.map((fact) => (
              <li
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                key={fact.id}
              >
                <div className="flex justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold text-emerald-700">
                      {fact.type === "SKILL"
                        ? "SKILL"
                        : fact.type === "PROJECT"
                          ? "PROJETO"
                          : fact.type === "LANGUAGE"
                            ? "IDIOMA"
                            : "EXPERIÊNCIA"}
                      {` · ${fact.reviewStatus === "PENDING" ? "PENDENTE" : fact.reviewStatus === "REJECTED" ? "REJEITADO" : "CONFIRMADO"}`}
                    </p>
                    <h3 className="font-semibold">{fact.title}</h3>
                    {fact.organization ? (
                      <p className="text-sm text-slate-600">
                        {fact.organization}
                      </p>
                    ) : null}
                  </div>
                  <form
                    action={`/api/profile/facts/${fact.id}/delete`}
                    method="post"
                  >
                    <button className="text-sm text-red-700" type="submit">
                      Excluir
                    </button>
                  </form>
                </div>
                {fact.description ? (
                  <p className="mt-3 text-sm whitespace-pre-wrap text-slate-700">
                    {fact.description}
                  </p>
                ) : null}
                {fact.evidenceQuote ? (
                  <blockquote className="mt-3 border-l-2 border-slate-300 pl-3 text-sm text-slate-600">
                    Evidência: {fact.evidenceQuote}
                  </blockquote>
                ) : null}
                {fact.reviewStatus === "PENDING" ? (
                  <form
                    action={`/api/profile/facts/${fact.id}/review`}
                    className="mt-4 flex gap-3"
                    method="post"
                  >
                    <button
                      className="text-sm font-medium text-emerald-700"
                      name="decision"
                      type="submit"
                      value="CONFIRMED"
                    >
                      Confirmar
                    </button>
                    <button
                      className="text-sm font-medium text-red-700"
                      name="decision"
                      type="submit"
                      value="REJECTED"
                    >
                      Rejeitar
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
