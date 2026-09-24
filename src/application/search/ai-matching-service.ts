import { z } from "zod";

import type {
  AIProvider,
  StructuredOutputSchema,
} from "@/application/providers/ai-provider";
import type { Prisma } from "@/generated/prisma/client";
import { getPrismaClient } from "@/infrastructure/database/prisma";

const shortText = z.string().trim().min(1).max(500);
const aiJobMatchSchema = z.object({
  matchedSkills: z.array(z.string().trim().min(1).max(120)).max(30),
  missingSkills: z.array(z.string().trim().min(1).max(120)).max(30),
  strengths: z.array(shortText).max(10),
  gaps: z.array(shortText).max(10),
  seniorityMatch: z.enum(["COMPATIBLE", "PARTIAL", "INCOMPATIBLE", "UNKNOWN"]),
  locationMatch: z.enum(["COMPATIBLE", "PARTIAL", "INCOMPATIBLE", "UNKNOWN"]),
  explanation: z.string().trim().min(1).max(2_000),
});

export type AIJobMatchAnalysis = z.infer<typeof aiJobMatchSchema>;

export const aiJobMatchOutputSchema: StructuredOutputSchema<AIJobMatchAnalysis> =
  {
    name: "job_match_analysis",
    jsonSchema: z.toJSONSchema(aiJobMatchSchema) as Record<string, unknown>,
    parse: (value) => aiJobMatchSchema.parse(value),
  };

export function parseStoredAIJobMatchAnalysis(value: unknown) {
  const parsed = aiJobMatchSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export async function analyzeJobMatchWithAI(
  userId: string,
  jobId: string,
  provider: AIProvider,
  clock: () => Date = () => new Date(),
) {
  const prisma = getPrismaClient();
  const job = await prisma.job.findFirst({
    where: { id: jobId, profile: { userId }, match: { isNot: null } },
    include: {
      match: true,
      profile: {
        include: {
          preference: true,
          professionalFacts: { where: { reviewStatus: "CONFIRMED" } },
        },
      },
    },
  });
  if (!job?.match)
    throw new Error("Vaga elegível com matching não encontrada.");

  const confirmedSkills = unique([
    ...job.profile.professionalFacts
      .filter((fact) => fact.type === "SKILL")
      .map((fact) => fact.title),
    ...(job.profile.preference?.technologies ?? []),
  ]);
  const candidateEvidence = {
    profile: {
      headline: job.profile.headline,
      summary: job.profile.summary,
      seniority: job.profile.seniority,
      location: [
        job.profile.city,
        job.profile.region,
        job.profile.country,
      ].filter(Boolean),
    },
    confirmedSkills,
    confirmedExperiences: job.profile.professionalFacts
      .filter((fact) => fact.type === "EXPERIENCE")
      .map((fact) => ({
        title: fact.title,
        organization: fact.organization,
        description: fact.description,
      })),
    confirmedProjects: job.profile.professionalFacts
      .filter((fact) => fact.type === "PROJECT")
      .map((fact) => ({
        title: fact.title,
        reference: fact.organization,
        description: fact.description,
      })),
    confirmedLanguages: job.profile.professionalFacts
      .filter((fact) => fact.type === "LANGUAGE")
      .map((fact) => ({
        language: fact.title,
        proficiency: fact.description,
      })),
    preferences: job.profile.preference,
  };
  const vacancyEvidence = {
    title: job.title,
    company: job.company,
    description: job.description,
    location: job.location,
    workArrangement: job.workArrangement,
  };
  const result = await provider.generateStructured({
    messages: [
      {
        role: "system",
        content:
          "Compare a vaga somente com as evidências fornecidas. Não estime probabilidade de contratação. Não invente skills, experiências, senioridade ou localização. matchedSkills devem existir tanto nas skills confirmadas quanto na vaga. missingSkills devem estar explícitas na vaga e ausentes das skills confirmadas. Responda em português do Brasil.",
      },
      {
        role: "user",
        content: JSON.stringify({
          candidateEvidence,
          vacancyEvidence,
          deterministicMatch: {
            score: job.match.score,
            breakdown: job.match.breakdown,
          },
        }),
      },
    ],
    outputSchema: aiJobMatchOutputSchema,
    maxOutputTokens: 2_000,
    temperature: 0,
  });
  validateGroundedSkills(
    result.output,
    confirmedSkills,
    `${job.title} ${job.description ?? ""}`,
  );
  const analyzedAt = clock();
  await prisma.jobMatch.update({
    where: { id: job.match.id },
    data: {
      aiAnalysis: JSON.parse(
        JSON.stringify(result.output),
      ) as Prisma.InputJsonValue,
      aiModel: result.model,
      aiRequestId: result.requestId,
      aiAnalyzedAt: analyzedAt,
    },
  });
  return { analysis: result.output, model: result.model, analyzedAt };
}

export function validateGroundedSkills(
  analysis: AIJobMatchAnalysis,
  confirmedSkills: readonly string[],
  vacancyText: string,
) {
  const candidate = new Set(confirmedSkills.map(fold));
  const vacancy = fold(vacancyText);
  for (const skill of analysis.matchedSkills) {
    const normalized = fold(skill);
    if (!candidate.has(normalized) || !includesTerm(vacancy, normalized))
      throw new Error("A análise contém skill correspondente sem evidência.");
  }
  for (const skill of analysis.missingSkills) {
    const normalized = fold(skill);
    if (candidate.has(normalized) || !includesTerm(vacancy, normalized))
      throw new Error("A análise contém skill ausente sem evidência.");
  }
}

function unique(values: readonly string[]) {
  const items = new Map<string, string>();
  for (const value of values) {
    const normalized = fold(value);
    if (normalized && !items.has(normalized))
      items.set(normalized, value.trim());
  }
  return [...items.values()];
}

function includesTerm(text: string, term: string) {
  return ` ${text} `.includes(` ${term} `);
}

function fold(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9+#.]+/g, " ")
    .trim();
}
