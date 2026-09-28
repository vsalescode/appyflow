export type ClassifiedSourceKind =
  "UNKNOWN" | "ATS" | "CAREER_PAGE" | "AGGREGATOR" | "SPECIALIZED_PORTAL";

const atsDomains = [
  "gupy.io",
  "greenhouse.io",
  "lever.co",
  "myworkdayjobs.com",
  "recrutei.com.br",
  "solides.jobs",
  "workdayjobs.com",
];

const aggregatorDomains = [
  "bebee.com",
  "cadernonacional.com.br",
  "empregandobrasil.com.br",
  "empregos.com.br",
  "glassdoor.com",
  "glassdoor.com.br",
  "indeed.com",
  "indeed.com.br",
  "jobbol.com.br",
  "jobleads.com",
  "simplyhired.com.br",
  "whatjobs.com",
];

const specializedDomains = [
  "casado.dev",
  "eu.dev.br",
  "linkedin.com",
  "nerdin.com.br",
  "programathor.com.br",
  "remote.com",
  "remoterocketship.com",
];

export function classifySourceDomain(domain: string): ClassifiedSourceKind {
  const normalized = domain.toLowerCase().replace(/^www\./, "");
  if (matchesDomain(normalized, atsDomains)) return "ATS";
  if (matchesDomain(normalized, aggregatorDomains)) return "AGGREGATOR";
  if (matchesDomain(normalized, specializedDomains))
    return "SPECIALIZED_PORTAL";
  if (/^(careers?|jobs?|vagas?)\./.test(normalized)) return "CAREER_PAGE";
  return "UNKNOWN";
}

function matchesDomain(domain: string, candidates: readonly string[]) {
  return candidates.some(
    (candidate) => domain === candidate || domain.endsWith(`.${candidate}`),
  );
}

export function sourceKindPriority(kind: ClassifiedSourceKind, domain: string) {
  const normalized = domain.toLowerCase().replace(/^www\./, "");
  const effectiveKind =
    kind === "UNKNOWN" ? classifySourceDomain(normalized) : kind;
  if (normalized === "linkedin.com" || normalized.endsWith(".linkedin.com"))
    return 0;
  if (effectiveKind === "ATS" || effectiveKind === "CAREER_PAGE") return 1;
  if (effectiveKind === "SPECIALIZED_PORTAL") return 2;
  if (effectiveKind === "UNKNOWN") return 3;
  return 4;
}
