import { randomUUID } from "node:crypto";

import { calculateDeterministicMatch } from "@/domain/job/deterministic-match";
import { evaluateQuickFilters } from "@/domain/job/quick-filter";
import { confirmedKnownTechnologies } from "@/domain/job/technology";
import { Prisma } from "@/generated/prisma/client";
import { getPrismaClient } from "@/infrastructure/database/prisma";

export async function calculateAndStoreDeterministicMatches(
  userId: string,
  clock: () => Date = () => new Date(),
) {
  const prisma = getPrismaClient();
  const profile = await prisma.candidateProfile.findUnique({
    where: { userId },
    include: {
      preference: true,
      professionalFacts: {
        where: { type: "SKILL", reviewStatus: "CONFIRMED" },
      },
      jobs: {
        where: {
          occurrences: {
            some: { source: { managementStatus: { not: "BLOCKED" } } },
          },
        },
      },
    },
  });
  if (!profile) return { matched: 0, skipped: 0 };
  const preference = profile.preference ?? {
    desiredRoles: [],
    seniorities: [],
    workModes: [],
    locations: [],
    technologies: [],
    excludedCompanies: [],
    excludedKeywords: [],
  };
  const now = clock();
  const confirmedSkills = profile.professionalFacts.map((fact) => fact.title);
  const skills = preference.technologies.length
    ? preference.technologies
    : confirmedKnownTechnologies(confirmedSkills);
  let matched = 0;
  let skipped = 0;

  for (const job of profile.jobs) {
    const filters = evaluateQuickFilters(job, preference, {
      now,
      candidateSkills: confirmedSkills,
    });
    const filterData = {
      filterDecision: filters.decision,
      filterRules: JSON.parse(
        JSON.stringify(filters.rules),
      ) as Prisma.InputJsonValue,
      filteredAt: now,
    };
    if (filters.decision === "REJECTED") {
      await prisma.$transaction([
        prisma.job.update({ where: { id: job.id }, data: filterData }),
        prisma.jobMatch.deleteMany({ where: { jobId: job.id } }),
      ]);
      skipped += 1;
      continue;
    }
    const result = calculateDeterministicMatch(
      job,
      {
        skills,
        hasDesiredRoles: preference.desiredRoles.length > 0,
        hasSeniorities: preference.seniorities.length > 0,
        hasWorkModes: preference.workModes.length > 0,
        hasLocations: preference.locations.length > 0,
      },
      filters,
      now,
    );
    const matchData = {
      score: result.score,
      classification: result.classification,
      evaluatedWeight: result.evaluatedWeight,
      matchedSkills: result.matchedSkills,
      breakdown: JSON.parse(
        JSON.stringify(result.breakdown),
      ) as Prisma.InputJsonValue,
      reasons: result.reasons,
      calculatedAt: now,
    };
    await prisma.$transaction([
      prisma.job.update({ where: { id: job.id }, data: filterData }),
      prisma.jobMatch.upsert({
        where: { jobId: job.id },
        create: {
          id: randomUUID(),
          jobId: job.id,
          ...matchData,
        },
        update: {
          ...matchData,
          aiAnalysis: Prisma.DbNull,
          aiModel: null,
          aiRequestId: null,
          aiAnalyzedAt: null,
        },
      }),
    ]);
    matched += 1;
  }
  return { matched, skipped };
}
