import { z } from "zod";

import { MAX_JOB_AGE_DAYS } from "@/domain/job/freshness";
import { sourceKindPriority } from "@/domain/source/source-kind";
import { getPrismaClient } from "@/infrastructure/database/prisma";

const filterSchema = z.object({
  category: z
    .enum(["ALL", "NEW", "REVIEW", "HOT", "WARM", "COLD"])
    .catch("ALL"),
  workMode: z
    .enum(["ALL", "REMOTE", "HYBRID", "ONSITE", "UNKNOWN"])
    .catch("ALL"),
  query: z.string().trim().max(120).catch(""),
});

export function parseOpportunityDashboardFilter(input: unknown) {
  return filterSchema.parse(input);
}

export async function getOpportunityDashboard(userId: string, input: unknown) {
  const filter = parseOpportunityDashboardFilter(input);
  const prisma = getPrismaClient();
  const freshSince = new Date(
    Date.now() - MAX_JOB_AGE_DAYS * 24 * 60 * 60 * 1_000,
  );
  const baseWhere = {
    profile: { userId },
    occurrences: {
      some: { source: { managementStatus: { not: "BLOCKED" as const } } },
    },
    AND: [
      {
        OR: [
          { application: { isNot: null } },
          { publishedAt: { gte: freshSince } },
          { publishedAt: null, discoveredAt: { gte: freshSince } },
        ],
      },
      {
        OR: [
          { application: { isNot: null } },
          { filterDecision: { in: ["ELIGIBLE" as const, "REVIEW" as const] } },
        ],
      },
    ],
  };
  const categoryWhere =
    filter.category === "NEW"
      ? { match: { is: null } }
      : filter.category === "REVIEW"
        ? { filterDecision: "REVIEW" as const }
        : filter.category === "ALL"
          ? {}
          : {
              filterDecision: "ELIGIBLE" as const,
              match: { is: { classification: filter.category } },
            };
  const workModeWhere =
    filter.workMode === "ALL" ? {} : { workArrangement: filter.workMode };
  const queryWhere = filter.query
    ? {
        OR: [
          { title: { contains: filter.query, mode: "insensitive" as const } },
          { company: { contains: filter.query, mode: "insensitive" as const } },
          {
            location: { contains: filter.query, mode: "insensitive" as const },
          },
        ],
      }
    : {};

  const [jobs, total, newCount, review, hot, warm, cold, preference] =
    await Promise.all([
      prisma.job.findMany({
        where: {
          ...baseWhere,
          ...categoryWhere,
          ...workModeWhere,
          ...queryWhere,
        },
        include: {
          match: true,
          application: true,
          occurrences: {
            where: { source: { managementStatus: { not: "BLOCKED" } } },
            orderBy: { discoveredAt: "desc" },
            include: {
              source: {
                select: { domain: true, kind: true, managementStatus: true },
              },
            },
          },
        },
        orderBy: [
          { publishedAt: { sort: "desc", nulls: "last" } },
          { match: { score: "desc" } },
          { discoveredAt: "desc" },
        ],
        take: 50,
      }),
      prisma.job.count({ where: baseWhere }),
      prisma.job.count({ where: { ...baseWhere, match: { is: null } } }),
      prisma.job.count({
        where: { ...baseWhere, filterDecision: "REVIEW" },
      }),
      prisma.job.count({
        where: {
          ...baseWhere,
          filterDecision: "ELIGIBLE",
          match: { is: { classification: "HOT" } },
        },
      }),
      prisma.job.count({
        where: {
          ...baseWhere,
          filterDecision: "ELIGIBLE",
          match: { is: { classification: "WARM" } },
        },
      }),
      prisma.job.count({
        where: {
          ...baseWhere,
          filterDecision: "ELIGIBLE",
          match: { is: { classification: "COLD" } },
        },
      }),
      prisma.preference.findFirst({
        where: { profile: { userId } },
        select: { technologies: true },
      }),
    ]);

  return {
    filter,
    jobs: jobs
      .map((job) => ({
        ...job,
        occurrences: [...job.occurrences].sort(
          (left, right) =>
            Number(right.source.managementStatus === "PRIORITIZED") -
              Number(left.source.managementStatus === "PRIORITIZED") ||
            right.discoveredAt.getTime() - left.discoveredAt.getTime(),
        ),
      }))
      .sort(
        (left, right) =>
          Number(left.filterDecision === "REVIEW") -
            Number(right.filterDecision === "REVIEW") ||
          Number(
            right.occurrences.some(
              (item) => item.source.managementStatus === "PRIORITIZED",
            ),
          ) -
            Number(
              left.occurrences.some(
                (item) => item.source.managementStatus === "PRIORITIZED",
              ),
            ) ||
          bestSourcePriority(left) - bestSourcePriority(right),
      ),
    counts: {
      ALL: total,
      NEW: newCount,
      REVIEW: review,
      HOT: hot,
      WARM: warm,
      COLD: cold,
    },
    hasPrimaryTechnologies: Boolean(preference?.technologies.length),
  };
}

function bestSourcePriority(job: {
  occurrences: Array<{
    source: {
      domain: string;
      kind:
        "UNKNOWN" | "ATS" | "CAREER_PAGE" | "AGGREGATOR" | "SPECIALIZED_PORTAL";
    };
  }>;
}) {
  return Math.min(
    ...job.occurrences.map((item) =>
      sourceKindPriority(item.source.kind, item.source.domain),
    ),
    5,
  );
}
