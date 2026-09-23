import { randomUUID } from "node:crypto";

import type { SearchProvider } from "@/application/providers/search-provider";
import {
  calculateNextRunAt,
  parseSearchSchedule,
} from "@/domain/search/search-schedule";
import { Prisma } from "@/generated/prisma/client";
import { getPrismaClient } from "@/infrastructure/database/prisma";

import {
  runSearchWorker,
  type SearchWorkerOptions,
  type SearchWorkerSummary,
} from "./search-worker-service";

interface SchedulerDependencies {
  runWorker: (
    provider: SearchProvider,
    options: SearchWorkerOptions,
  ) => Promise<SearchWorkerSummary>;
  clock: () => Date;
}

const defaultDependencies: SchedulerDependencies = {
  runWorker: (provider, options) =>
    runSearchWorker(provider, undefined, options),
  clock: () => new Date(),
};

export async function saveSearchSchedule(
  userId: string,
  value: unknown,
  now: Date = new Date(),
) {
  const input = parseSearchSchedule(value);
  const prisma = getPrismaClient();
  const profile = await prisma.candidateProfile.upsert({
    where: { userId },
    create: { id: randomUUID(), userId },
    update: {},
  });
  const nextRunAt = input.enabled
    ? calculateNextRunAt(input.scheduledTime, input.timeZone, now)
    : null;
  return prisma.searchSchedule.upsert({
    where: { profileId: profile.id },
    create: {
      id: randomUUID(),
      profileId: profile.id,
      ...input,
      nextRunAt,
    },
    update: { ...input, nextRunAt },
  });
}

export function getSearchSchedule(userId: string) {
  return getPrismaClient().searchSchedule.findFirst({
    where: { profile: { userId } },
  });
}

export function listSearchRuns(userId: string, take = 20) {
  return getPrismaClient().searchRun.findMany({
    where: { profile: { userId } },
    orderBy: { startedAt: "desc" },
    take,
  });
}

export async function executeDueSearches(
  provider: SearchProvider,
  now: Date = new Date(),
  dependencies: SchedulerDependencies = defaultDependencies,
) {
  const prisma = getPrismaClient();
  const due = await prisma.searchSchedule.findMany({
    where: { enabled: true, nextRunAt: { lte: now } },
    include: { profile: { select: { userId: true } } },
    orderBy: { nextRunAt: "asc" },
  });
  let claimed = 0;

  for (const schedule of due) {
    const nextRunAt = calculateNextRunAt(
      schedule.scheduledTime,
      schedule.timeZone,
      now,
    );
    const run = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.searchSchedule.updateMany({
        where: {
          id: schedule.id,
          enabled: true,
          nextRunAt: { lte: now },
        },
        data: { nextRunAt },
      });
      if (!updated.count) return null;
      return transaction.searchRun.create({
        data: {
          id: randomUUID(),
          profileId: schedule.profileId,
          status: "RUNNING",
          startedAt: now,
        },
      });
    });
    if (!run) continue;
    claimed += 1;

    try {
      const summary = await dependencies.runWorker(provider, {
        userId: schedule.profile.userId,
        maxQueries: schedule.maxQueries,
        resultsPerQuery: schedule.resultsPerQuery,
      });
      await prisma.searchRun.update({
        where: { id: run.id },
        data: {
          status: summary.failures.length ? "PARTIAL_FAILURE" : "COMPLETED",
          finishedAt: dependencies.clock(),
          queriesTotal: summary.queries.total,
          queriesSucceeded: summary.queries.succeeded,
          queriesFailed: summary.queries.failed,
          resultsFound: summary.results.found,
          resultsStored: summary.results.stored,
          resultsRejected: summary.results.rejected,
          jobsMatched: summary.matching.matched,
          jobsSkipped: summary.matching.skipped,
          failures: summary.failures.length
            ? (JSON.parse(
                JSON.stringify(summary.failures),
              ) as Prisma.InputJsonValue)
            : Prisma.DbNull,
        },
      });
    } catch {
      await prisma.searchRun.update({
        where: { id: run.id },
        data: {
          status: "FAILED",
          finishedAt: dependencies.clock(),
          failures: [{ reason: "unexpected_error" }],
        },
      });
    }
  }

  return { due: due.length, claimed };
}
