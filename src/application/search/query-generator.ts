import { randomUUID } from "node:crypto";

import { z } from "zod";

import type { AIProvider } from "@/application/providers/ai-provider";
import { getPrismaClient } from "@/infrastructure/database/prisma";

export class InsufficientQueryContextError extends Error {}

export function normalizeSearchQuery(query: string) {
  return query
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
}

function uniqueQueries(queries: readonly string[]) {
  const seen = new Set<string>();
  return queries
    .map((query) => query.trim().replace(/\s+/g, " "))
    .filter((query) => query.length >= 3 && query.length <= 300)
    .filter((query) => {
      const normalized = normalizeSearchQuery(query);
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
}

const genericRoleTitles = new Map<string, string>([
  ["backend", "Desenvolvedor Backend"],
  ["back end", "Desenvolvedor Backend"],
  ["front end", "Desenvolvedor Frontend"],
  ["frontend", "Desenvolvedor Frontend"],
  ["estagio", "Estágio em Desenvolvimento de Software"],
  ["internship", "Software Engineering Intern"],
]);

const frontendOnlyTechnologies = new Set([
  "angular",
  "bootstrap",
  "css",
  "html",
  "react",
  "tailwind css",
]);

const backendOnlyTechnologies = new Set([
  "fastify",
  "java",
  "mongodb",
  "mysql",
  "node.js",
  "openfeign",
  "postgresql",
  "prisma",
  "spring boot",
  "spring data jpa",
  "sql",
]);

function foldTerm(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9+#.]+/g, " ")
    .trim();
}

function searchableRole(role: string) {
  return genericRoleTitles.get(foldTerm(role)) ?? role;
}

function technologiesForRole(role: string, technologies: readonly string[]) {
  const normalizedRole = foldTerm(role);
  if (normalizedRole.includes("backend"))
    return technologies.filter(
      (technology) => !frontendOnlyTechnologies.has(foldTerm(technology)),
    );
  if (
    normalizedRole.includes("frontend") ||
    normalizedRole.includes("front end")
  )
    return technologies.filter(
      (technology) => !backendOnlyTechnologies.has(foldTerm(technology)),
    );
  return technologies;
}

function withoutExcludedTerms(
  queries: readonly string[],
  excludedTerms: readonly string[],
) {
  const normalizedTerms = excludedTerms.map(normalizeSearchQuery);
  return queries.filter((query) => {
    const normalized = normalizeSearchQuery(query);
    return !normalizedTerms.some((term) => normalized.includes(term));
  });
}

type QueryContext = Awaited<ReturnType<typeof loadContext>>;

async function loadContext(userId: string) {
  return getPrismaClient().candidateProfile.findUnique({
    where: { userId },
    include: {
      preference: true,
      professionalFacts: {
        where: { type: "SKILL", reviewStatus: "CONFIRMED" },
        orderBy: { createdAt: "desc" },
        take: 12,
      },
    },
  });
}

export function buildDeterministicQueries(context: NonNullable<QueryContext>) {
  const preference = context.preference;
  const roles = preference?.desiredRoles.length
    ? preference.desiredRoles
    : context.headline
      ? [context.headline]
      : [];
  const locations = preference?.locations.slice(0, 3) ?? [];
  const technologies = preference?.technologies.length
    ? preference.technologies.slice(0, 5)
    : [];
  const remote = preference?.workModes.includes("REMOTE") ? "remoto" : "";
  const queries: string[] = [];

  for (const rawRole of roles.slice(0, 5)) {
    const role = searchableRole(rawRole);
    const compatibleTechnologies = technologiesForRole(role, technologies);
    queries.push([role, remote].filter(Boolean).join(" "));
    for (const location of locations)
      queries.push([role, remote, location].filter(Boolean).join(" "));
    for (const technology of compatibleTechnologies.slice(0, 3))
      queries.push([role, technology, remote].filter(Boolean).join(" "));
  }
  return uniqueQueries(queries).slice(0, 20);
}

async function persistQueries(
  profileId: string,
  queries: readonly string[],
  origin: "DETERMINISTIC" | "AI",
  ai?: { model: string; requestId?: string },
  excludedTerms: readonly string[] = [],
) {
  const values = uniqueQueries(withoutExcludedTerms(queries, excludedTerms));
  if (!values.length) throw new InsufficientQueryContextError();
  const prisma = getPrismaClient();
  await prisma.$transaction(async (transaction) => {
    await transaction.searchQuery.updateMany({
      where: { profileId, origin },
      data: { isActive: false },
    });
    for (const query of values) {
      const normalized = normalizeSearchQuery(query);
      await transaction.searchQuery.upsert({
        where: { profileId_normalized: { profileId, normalized } },
        create: {
          id: randomUUID(),
          profileId,
          query,
          normalized,
          origin,
          aiModel: ai?.model,
          aiRequestId: ai?.requestId,
          isActive: true,
        },
        update: {
          query,
          origin,
          aiModel: ai?.model ?? null,
          aiRequestId: ai?.requestId ?? null,
          isActive: true,
        },
      });
    }
  });
  return listSearchQueriesByProfile(profileId);
}

function listSearchQueriesByProfile(profileId: string) {
  return getPrismaClient().searchQuery.findMany({
    where: { profileId, isActive: true },
    orderBy: [{ createdAt: "desc" }, { query: "asc" }],
  });
}

export async function listSearchQueries(userId: string) {
  return getPrismaClient().searchQuery.findMany({
    where: { profile: { userId }, isActive: true },
    orderBy: [{ createdAt: "desc" }, { query: "asc" }],
  });
}

export async function generateDeterministicQueries(userId: string) {
  const context = await loadContext(userId);
  if (!context) throw new InsufficientQueryContextError();
  return persistQueries(
    context.id,
    buildDeterministicQueries(context),
    "DETERMINISTIC",
    undefined,
    context.preference?.excludedKeywords ?? [],
  );
}

const aiOutput = z.object({
  queries: z.array(z.string().trim().min(3).max(300)).min(1).max(10),
});

export async function generateAIQueries(userId: string, provider: AIProvider) {
  const context = await loadContext(userId);
  if (!context) throw new InsufficientQueryContextError();
  const preference = context.preference;
  const payload = {
    headline: context.headline,
    seniority: context.seniority,
    country: context.country,
    roles: preference?.desiredRoles ?? [],
    preferredSeniorities: preference?.seniorities ?? [],
    workModes: preference?.workModes ?? [],
    locations: preference?.locations ?? [],
    languages: preference?.languages ?? [],
    technologies: preference?.technologies ?? [],
    confirmedSkills: context.professionalFacts.map((fact) => fact.title),
    excludedKeywords: preference?.excludedKeywords ?? [],
  };
  if (!payload.headline && !payload.roles.length)
    throw new InsufficientQueryContextError();

  const result = await provider.generateStructured({
    messages: [
      {
        role: "system",
        content:
          "Gere consultas curtas para localizar vagas compatíveis. Cada consulta deve conter um cargo real e pesquisável; não use Backend, Frontend ou Estágio isoladamente. Combine tecnologias somente quando forem coerentes com o cargo, como Java com Backend e React com Frontend ou Full Stack. Use apenas os dados fornecidos, não invente qualificações e não inclua termos explicitamente excluídos.",
      },
      { role: "user", content: JSON.stringify(payload) },
    ],
    outputSchema: {
      name: "job_search_queries",
      jsonSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          queries: {
            type: "array",
            minItems: 1,
            maxItems: 10,
            items: { type: "string", minLength: 3, maxLength: 300 },
          },
        },
        required: ["queries"],
      },
      parse(value) {
        return aiOutput.parse(value);
      },
    },
    maxOutputTokens: 500,
    temperature: 0.2,
  });
  return persistQueries(
    context.id,
    result.output.queries,
    "AI",
    {
      model: result.model,
      requestId: result.requestId,
    },
    preference?.excludedKeywords ?? [],
  );
}
