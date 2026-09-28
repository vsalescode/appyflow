import type { QuickFilterResult, QuickFilterRule } from "./quick-filter";

export interface DeterministicMatchJob {
  title: string;
  description?: string | null;
  publishedAt?: Date | null;
  discoveredAt: Date;
}

export interface DeterministicMatchContext {
  skills: readonly string[];
  hasDesiredRoles: boolean;
  hasSeniorities: boolean;
  hasWorkModes: boolean;
  hasLocations: boolean;
}

export interface MatchComponent {
  earned: number;
  available: number;
}

export interface DeterministicMatch {
  score: number;
  classification: "HOT" | "WARM" | "COLD";
  evaluatedWeight: number;
  matchedSkills: string[];
  breakdown: {
    skills: MatchComponent;
    role: MatchComponent;
    seniority: MatchComponent;
    workMode: MatchComponent;
    location: MatchComponent;
    recency: MatchComponent;
  };
  reasons: string[];
}

const DAY_IN_MS = 86_400_000;

export function calculateDeterministicMatch(
  job: DeterministicMatchJob,
  context: DeterministicMatchContext,
  filters: QuickFilterResult,
  now: Date = new Date(),
): DeterministicMatch {
  const text = fold(`${job.title} ${job.description ?? ""}`);
  const skills = unique(context.skills);
  const matchedSkills = skills.filter((skill) => includesTerm(text, skill));
  const breakdown = {
    skills: component(
      skills.length ? (matchedSkills.length / skills.length) * 40 : 0,
      skills.length ? 40 : 0,
    ),
    role: filterComponent(filters, "ROLE", context.hasDesiredRoles, 20),
    seniority: filterComponent(
      filters,
      "SENIORITY",
      context.hasSeniorities,
      15,
    ),
    workMode: filterComponent(filters, "WORK_MODE", context.hasWorkModes, 10),
    location: filterComponent(filters, "LOCATION", context.hasLocations, 5),
    recency: recencyComponent(job.publishedAt, now),
  };
  const totals = Object.values(breakdown).reduce(
    (total, item) => ({
      earned: total.earned + item.earned,
      available: total.available + item.available,
    }),
    { earned: 0, available: 0 },
  );
  const score = Math.round(totals.earned);

  return {
    score,
    classification: score >= 75 ? "HOT" : score >= 50 ? "WARM" : "COLD",
    evaluatedWeight: totals.available,
    matchedSkills,
    breakdown,
    reasons: [
      skills.length
        ? `${matchedSkills.length} de ${skills.length} skills identificadas na vaga`
        : "skills não avaliadas por falta de dados confirmados",
      ...filters.rules
        .filter((rule) =>
          [
            "DESCRIPTION",
            "ROLE",
            "SENIORITY",
            "TECHNOLOGY",
            "WORK_MODE",
            "LOCATION",
          ].includes(rule.code),
        )
        .map((rule) => rule.reason),
    ],
  };
}

function filterComponent(
  filters: QuickFilterResult,
  code: QuickFilterRule["code"],
  enabled: boolean,
  weight: number,
) {
  if (!enabled) return component(0, 0);
  const status = filters.rules.find((rule) => rule.code === code)?.status;
  return component(
    status === "PASS" ? weight : status === "REVIEW" ? weight / 2 : 0,
    weight,
  );
}

function recencyComponent(reference: Date | null | undefined, now: Date) {
  if (!reference) return component(0, 0);
  const days = Math.max(
    0,
    Math.floor((now.getTime() - reference.getTime()) / DAY_IN_MS),
  );
  return component(days <= 7 ? 10 : days <= 30 ? 6 : days <= 45 ? 3 : 0, 10);
}

function component(earned: number, available: number): MatchComponent {
  return { earned: Math.round(earned), available };
}

function unique(values: readonly string[]) {
  const found = new Map<string, string>();
  for (const value of values) {
    const key = fold(value);
    if (key && !found.has(key)) found.set(key, value.trim());
  }
  return [...found.values()];
}

function includesTerm(text: string, term: string) {
  const normalized = fold(term);
  return Boolean(normalized) && ` ${text} `.includes(` ${normalized} `);
}

function fold(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9+#.]+/g, " ")
    .trim();
}
