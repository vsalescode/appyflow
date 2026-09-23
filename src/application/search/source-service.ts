import { getPrismaClient } from "@/infrastructure/database/prisma";
import { calculateSourceScore } from "@/domain/source/source-score";
import { parseSourceManagementStatus } from "@/domain/source/source-management";

export async function listDiscoveredSources(
  userId: string,
  clock: () => Date = () => new Date(),
) {
  const sources = await getPrismaClient().source.findMany({
    where: { occurrences: { some: { job: { profile: { userId } } } } },
    include: {
      metricHistory: {
        orderBy: { observedAt: "desc" },
        take: 10,
      },
    },
    orderBy: { domain: "asc" },
  });

  return sources
    .map((source) => ({
      ...source,
      score: calculateSourceScore(source, clock()),
    }))
    .sort(
      (left, right) =>
        managementOrder(left.managementStatus) -
          managementOrder(right.managementStatus) ||
        right.score.value - left.score.value ||
        left.domain.localeCompare(right.domain),
    );
}

export async function updateSourceManagement(
  userId: string,
  sourceId: string,
  value: unknown,
  clock: () => Date = () => new Date(),
) {
  const managementStatus = parseSourceManagementStatus(value);
  const result = await getPrismaClient().source.updateMany({
    where: {
      id: sourceId,
      occurrences: { some: { job: { profile: { userId } } } },
    },
    data: {
      managementStatus,
      managedAt: managementStatus === "DEFAULT" ? null : clock(),
    },
  });
  if (!result.count) throw new Error("Fonte não encontrada.");
}

function managementOrder(status: "DEFAULT" | "PRIORITIZED" | "BLOCKED") {
  return status === "PRIORITIZED" ? 0 : status === "DEFAULT" ? 1 : 2;
}
