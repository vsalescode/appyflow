import { randomUUID } from "node:crypto";

import { z } from "zod";

import { getPrismaClient } from "@/infrastructure/database/prisma";

export class InvalidProfileError extends Error {}

const optionalText = (maximum: number) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().max(maximum).optional(),
  );

const profileSchema = z.object({
  headline: optionalText(160),
  summary: optionalText(4_000),
  seniority: z.enum([
    "UNSPECIFIED",
    "INTERN",
    "JUNIOR",
    "MID_LEVEL",
    "SENIOR",
    "LEAD",
    "MANAGER",
    "EXECUTIVE",
  ]),
  city: optionalText(120),
  region: optionalText(120),
  country: z.preprocess(
    (value) => (typeof value === "string" ? value.trim().toUpperCase() : value),
    z.string().length(2).optional().or(z.literal("")),
  ),
});

const factSchema = z
  .object({
    type: z.enum(["SKILL", "EXPERIENCE", "PROJECT", "LANGUAGE"]),
    title: z.string().trim().min(1).max(160),
    organization: optionalText(160),
    description: optionalText(4_000),
    startedAt: z.string().date().optional().or(z.literal("")),
    endedAt: z.string().date().optional().or(z.literal("")),
  })
  .superRefine((fact, context) => {
    if (fact.type === "EXPERIENCE" && !fact.organization)
      context.addIssue({
        code: "custom",
        path: ["organization"],
        message: "é obrigatória",
      });
    if (fact.startedAt && fact.endedAt && fact.endedAt < fact.startedAt)
      context.addIssue({
        code: "custom",
        path: ["endedAt"],
        message: "deve ser posterior ao início",
      });
  });

function parseOrThrow<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new InvalidProfileError();
  return result.data;
}

export function getCandidateProfile(userId: string) {
  return getPrismaClient().candidateProfile.findUnique({
    where: { userId },
    include: { professionalFacts: { orderBy: { createdAt: "desc" } } },
  });
}

export async function saveCandidateProfile(userId: string, input: unknown) {
  const data = parseOrThrow(profileSchema, input);
  return getPrismaClient().candidateProfile.upsert({
    where: { userId },
    create: {
      id: randomUUID(),
      userId,
      ...data,
      country: data.country || undefined,
    },
    update: { ...data, country: data.country || null },
  });
}

export async function addProfessionalFact(userId: string, input: unknown) {
  const data = parseOrThrow(factSchema, input);
  const profile = await getPrismaClient().candidateProfile.upsert({
    where: { userId },
    create: { id: randomUUID(), userId },
    update: {},
  });
  return getPrismaClient().professionalFact.create({
    data: {
      id: randomUUID(),
      profileId: profile.id,
      type: data.type,
      title: data.title,
      organization: data.organization,
      description: data.description,
      startedAt: data.startedAt
        ? new Date(`${data.startedAt}T00:00:00.000Z`)
        : undefined,
      endedAt: data.endedAt
        ? new Date(`${data.endedAt}T00:00:00.000Z`)
        : undefined,
      reviewStatus: "CONFIRMED",
    },
  });
}

export async function deleteProfessionalFact(userId: string, factId: string) {
  return getPrismaClient().professionalFact.deleteMany({
    where: { id: factId, profile: { userId } },
  });
}
