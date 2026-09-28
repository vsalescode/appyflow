import {
  evaluateQuickFilters,
  type QuickFilterDecision,
  type QuickFilterOptions,
} from "@/domain/job/quick-filter";
import { getPrismaClient } from "@/infrastructure/database/prisma";

export async function listQuickFilteredJobs(
  userId: string,
  decision?: QuickFilterDecision,
  options: QuickFilterOptions = {},
) {
  const profile = await getPrismaClient().candidateProfile.findUnique({
    where: { userId },
    include: {
      preference: true,
      professionalFacts: {
        where: { type: "SKILL", reviewStatus: "CONFIRMED" },
        select: { title: true },
      },
      jobs: { orderBy: { discoveredAt: "desc" } },
    },
  });
  if (!profile) return [];

  const preferences = profile.preference ?? {
    desiredRoles: [],
    seniorities: [],
    workModes: [],
    locations: [],
    technologies: [],
    excludedCompanies: [],
    excludedKeywords: [],
  };
  const evaluated = profile.jobs.map((job) => ({
    job,
    filter: evaluateQuickFilters(job, preferences, {
      ...options,
      candidateSkills:
        options.candidateSkills ??
        profile.professionalFacts.map((fact) => fact.title),
    }),
  }));

  return decision
    ? evaluated.filter((item) => item.filter.decision === decision)
    : evaluated;
}
