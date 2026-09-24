import { getUserBySessionToken } from "@/application/auth/auth-service";
import { getPreference } from "@/application/preferences/preference-service";
import {
  getSearchSchedule,
  listSearchRuns,
} from "@/application/search/search-schedule-service";
import { readSessionCookie } from "@/infrastructure/auth/cookie";

export const dynamic = "force-dynamic";

const seniorities = [
  ["INTERN", "Estágio"],
  ["JUNIOR", "Júnior"],
  ["MID_LEVEL", "Pleno"],
  ["SENIOR", "Sênior"],
  ["LEAD", "Liderança técnica"],
  ["MANAGER", "Gestão"],
  ["EXECUTIVE", "Executiva"],
] as const;
const workModes = [
  ["REMOTE", "Remoto"],
  ["HYBRID", "Híbrido"],
  ["ONSITE", "Presencial"],
] as const;
const runStatuses = {
  RUNNING: "Em execução",
  COMPLETED: "Concluída",
  PARTIAL_FAILURE: "Concluída com falhas",
  FAILED: "Falhou",
} as const;
const asLines = (items: string[] | undefined) => items?.join("\n") ?? "";

export default async function PreferencesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getUserBySessionToken(await readSessionCookie());
  const [preference, schedule, runs] = user
    ? await Promise.all([
        getPreference(user.id),
        getSearchSchedule(user.id),
        listSearchRuns(user.id, 10),
      ])
    : [null, null, []];
  const query = await searchParams;
  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <p className="text-xs font-bold tracking-[0.18em] text-emerald-700 uppercase">
        Critérios de descoberta
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
        Preferências profissionais
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
        Campos vazios não eliminam vagas. Informe somente critérios relevantes
        para você.
      </p>
      {query.sucesso ? (
        <p className="mt-5 text-sm text-emerald-700">
          {query.sucesso === "agendamento"
            ? "Agendamento salvo."
            : "Preferências salvas."}
        </p>
      ) : null}
      {query.erro ? (
        <p className="mt-5 text-sm text-red-700">
          {query.erro === "agendamento"
            ? "Revise horário, fuso e limites do agendamento."
            : "Revise os campos. Salário e moeda devem ser informados juntos."}
        </p>
      ) : null}
      <form
        action="/api/preferences"
        className="mt-8 grid gap-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:grid-cols-2 sm:p-8"
        method="post"
      >
        <ListField
          defaultValue={asLines(preference?.desiredRoles)}
          label="Cargos desejados"
          name="desiredRoles"
          placeholder={"Backend Engineer\nSoftware Engineer"}
        />
        <ListField
          defaultValue={asLines(preference?.locations)}
          label="Localizações aceitas"
          name="locations"
          placeholder={"Brasil\nSão Paulo, SP"}
        />
        <fieldset>
          <legend className="text-sm font-medium">Senioridades</legend>
          <div className="mt-3 grid gap-2">
            {seniorities.map(([value, label]) => (
              <Check
                defaultChecked={preference?.seniorities.includes(value)}
                key={value}
                label={label}
                name="seniorities"
                value={value}
              />
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-sm font-medium">Modalidades</legend>
          <div className="mt-3 grid gap-2">
            {workModes.map(([value, label]) => (
              <Check
                defaultChecked={preference?.workModes.includes(value)}
                key={value}
                label={label}
                name="workModes"
                value={value}
              />
            ))}
          </div>
        </fieldset>
        <ListField
          defaultValue={asLines(preference?.languages)}
          label="Idiomas"
          name="languages"
          placeholder={"Português\nInglês"}
        />
        <ListField
          defaultValue={asLines(preference?.technologies)}
          label="Tecnologias desejadas"
          name="technologies"
          placeholder={"TypeScript\nPostgreSQL"}
        />
        <label className="text-sm font-medium">
          Salário mínimo
          <input
            className="mt-2 block w-full rounded-lg border p-3"
            defaultValue={preference?.salaryMinimum?.toString() ?? ""}
            inputMode="decimal"
            name="salaryMinimum"
            placeholder="12000,00"
          />
        </label>
        <label className="text-sm font-medium">
          Moeda
          <input
            className="mt-2 block w-full rounded-lg border p-3 uppercase"
            defaultValue={preference?.salaryCurrency ?? ""}
            maxLength={3}
            name="salaryCurrency"
            placeholder="BRL"
          />
        </label>
        <ListField
          defaultValue={asLines(preference?.excludedCompanies)}
          label="Empresas excluídas"
          name="excludedCompanies"
          placeholder="Uma empresa por linha"
        />
        <ListField
          defaultValue={asLines(preference?.excludedKeywords)}
          label="Termos excluídos"
          name="excludedKeywords"
          placeholder={"voluntário\nnão remunerado"}
        />
        <button
          className="w-fit rounded-lg bg-slate-950 px-5 py-3 text-sm font-semibold text-white sm:col-span-2"
          type="submit"
        >
          Salvar preferências
        </button>
      </form>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Busca diária</h2>
        <p className="mt-2 text-sm text-slate-600">
          Configure quando o scheduler deve executar as queries cadastradas.
        </p>
        <form
          action="/api/search-schedule"
          className="mt-5 grid gap-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:grid-cols-2 sm:p-8"
          method="post"
        >
          <label className="flex items-center gap-3 text-sm font-medium sm:col-span-2">
            <input
              defaultChecked={schedule?.enabled ?? false}
              name="enabled"
              type="checkbox"
            />
            Ativar busca diária
          </label>
          <label className="text-sm font-medium">
            Horário
            <input
              className="mt-2 block w-full rounded-lg border p-3"
              defaultValue={schedule?.scheduledTime ?? "09:00"}
              name="scheduledTime"
              required
              type="time"
            />
          </label>
          <label className="text-sm font-medium">
            Fuso horário
            <input
              className="mt-2 block w-full rounded-lg border p-3"
              defaultValue={schedule?.timeZone ?? "America/Sao_Paulo"}
              name="timeZone"
              required
            />
          </label>
          <label className="text-sm font-medium">
            Máximo de queries por ciclo
            <input
              className="mt-2 block w-full rounded-lg border p-3"
              defaultValue={schedule?.maxQueries ?? 10}
              max={50}
              min={1}
              name="maxQueries"
              required
              type="number"
            />
          </label>
          <label className="text-sm font-medium">
            Resultados por query
            <input
              className="mt-2 block w-full rounded-lg border p-3"
              defaultValue={schedule?.resultsPerQuery ?? 10}
              max={10}
              min={1}
              name="resultsPerQuery"
              required
              type="number"
            />
          </label>
          {schedule?.nextRunAt ? (
            <p className="text-sm text-slate-600 sm:col-span-2">
              Próxima execução: {schedule.nextRunAt.toLocaleString("pt-BR")}
            </p>
          ) : null}
          <button
            className="w-fit rounded-lg bg-slate-950 px-5 py-3 text-sm font-semibold text-white sm:col-span-2"
            type="submit"
          >
            Salvar agendamento
          </button>
        </form>

        <h3 className="mt-8 font-semibold">Execuções recentes</h3>
        {runs.length ? (
          <ol className="mt-3 space-y-3">
            {runs.map((run) => (
              <li
                className="rounded-xl border bg-white p-4 text-sm"
                key={run.id}
              >
                <span className="font-medium">{runStatuses[run.status]}</span>
                {" · "}
                {run.startedAt.toLocaleString("pt-BR")}
                {" · "}
                {run.queriesSucceeded}/{run.queriesTotal} queries
                {" · "}
                {run.resultsStored} resultados processados
                {run.resultsBlocked
                  ? ` · ${run.resultsBlocked} bloqueados`
                  : ""}
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-3 text-sm text-slate-600">
            Nenhuma execução registrada.
          </p>
        )}
      </section>
    </main>
  );
}

function ListField({
  defaultValue,
  label,
  name,
  placeholder,
}: {
  defaultValue: string;
  label: string;
  name: string;
  placeholder: string;
}) {
  return (
    <label className="text-sm font-medium">
      {label}
      <textarea
        className="mt-2 block min-h-28 w-full rounded-lg border p-3"
        defaultValue={defaultValue}
        maxLength={6000}
        name={name}
        placeholder={placeholder}
      />
      <span className="mt-1 block text-xs font-normal text-slate-500">
        Um item por linha.
      </span>
    </label>
  );
}

function Check({
  defaultChecked,
  label,
  name,
  value,
}: {
  defaultChecked?: boolean;
  label: string;
  name: string;
  value: string;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        defaultChecked={defaultChecked}
        name={name}
        type="checkbox"
        value={value}
      />
      {label}
    </label>
  );
}
