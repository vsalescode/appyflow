import { randomUUID } from "node:crypto";

import { z } from "zod";

import type {
  AIProvider,
  StructuredOutputSchema,
} from "@/application/providers/ai-provider";
import { getPrismaClient } from "@/infrastructure/database/prisma";

const extractedFactSchema = z.object({
  type: z.enum(["SKILL", "EXPERIENCE"]),
  title: z.string().min(1).max(160),
  organization: z.string().max(160).nullable(),
  description: z.string().max(4_000).nullable(),
  startedAt: z.string().date().nullable(),
  endedAt: z.string().date().nullable(),
  evidenceQuote: z.string().min(1).max(2_000),
});

const extractedProfileSchema = z.object({
  headline: z.string().min(1).max(160).nullable(),
  summary: z.string().min(1).max(4_000).nullable(),
  seniority: z
    .enum([
      "UNSPECIFIED",
      "INTERN",
      "JUNIOR",
      "MID_LEVEL",
      "SENIOR",
      "LEAD",
      "MANAGER",
      "EXECUTIVE",
    ])
    .nullable(),
  city: z.string().min(1).max(120).nullable(),
  region: z.string().min(1).max(120).nullable(),
  country: z.string().regex(/^[A-Z]{2}$/).nullable(),
});

const interpretationSchema = z.object({
  profile: extractedProfileSchema,
  facts: z.array(extractedFactSchema).max(50),
});
type Interpretation = z.infer<typeof interpretationSchema>;

export const resumeInterpretationOutputSchema: StructuredOutputSchema<Interpretation> =
  {
    name: "resume_interpretation",
    jsonSchema: z.toJSONSchema(interpretationSchema) as Record<string, unknown>,
    parse: (value) => interpretationSchema.parse(value),
  };

function normalizeEvidence(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

export async function interpretActiveResume(
  userId: string,
  provider: AIProvider,
) {
  const prisma = getPrismaClient();
  const resume = await prisma.resume.findFirst({
    where: { userId, isActive: true },
  });
  if (!resume) throw new Error("Currículo mestre não encontrado.");

  const result = await provider.generateStructured({
    messages: [
      {
        role: "system",
        content:
          "Extraia um perfil profissional e somente skills e experiências sustentadas pelo currículo. Produza headline e summary concisos usando apenas informações presentes no documento. Use null para localização ou outros campos ausentes; nunca invente, complete ou estime dados. country deve ser um código ISO 3166-1 alpha-2 maiúsculo. Cada fato deve conter em evidenceQuote uma citação literal do currículo.",
      },
      { role: "user", content: resume.extractedText },
    ],
    outputSchema: resumeInterpretationOutputSchema,
    maxOutputTokens: 4_000,
    temperature: 0,
  });

  const source = normalizeEvidence(resume.extractedText);
  for (const fact of result.output.facts) {
    if (!source.includes(normalizeEvidence(fact.evidenceQuote)))
      throw new Error("A interpretação contém fato sem evidência literal.");
    if (fact.type === "EXPERIENCE" && !fact.organization)
      throw new Error("Experiência sem organização não pode ser importada.");
    if (fact.startedAt && fact.endedAt && fact.endedAt < fact.startedAt)
      throw new Error("A interpretação contém datas inválidas.");
  }

  const profileData = {
    headline: result.output.profile.headline ?? undefined,
    summary: result.output.profile.summary ?? undefined,
    seniority: result.output.profile.seniority ?? undefined,
    city: result.output.profile.city ?? undefined,
    region: result.output.profile.region ?? undefined,
    country: result.output.profile.country ?? undefined,
  };

  return prisma.$transaction(async (transaction) => {
    const profile = await transaction.candidateProfile.upsert({
      where: { userId },
      create: { id: randomUUID(), userId, ...profileData },
      update: profileData,
    });
    await transaction.professionalFact.deleteMany({
      where: {
        profileId: profile.id,
        sourceResumeId: resume.id,
        reviewStatus: "PENDING",
      },
    });
    await transaction.professionalFact.createMany({
      data: result.output.facts.map((fact) => ({
        id: randomUUID(),
        profileId: profile.id,
        sourceResumeId: resume.id,
        reviewStatus: "PENDING" as const,
        type: fact.type,
        title: fact.title,
        organization: fact.organization,
        description: fact.description,
        startedAt: fact.startedAt
          ? new Date(`${fact.startedAt}T00:00:00.000Z`)
          : null,
        endedAt: fact.endedAt
          ? new Date(`${fact.endedAt}T00:00:00.000Z`)
          : null,
        evidenceQuote: fact.evidenceQuote,
        aiModel: result.model,
        aiRequestId: result.requestId,
      })),
    });
    return { count: result.output.facts.length };
  });
}

export function reviewProfessionalFact(
  userId: string,
  factId: string,
  decision: "CONFIRMED" | "REJECTED",
) {
  return getPrismaClient().professionalFact.updateMany({
    where: { id: factId, profile: { userId }, reviewStatus: "PENDING" },
    data: { reviewStatus: decision },
  });
}
