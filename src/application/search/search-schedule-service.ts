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

export async function executeManualSearch(
  userId: string,
  provider: SearchProvider,
  dependencies: SchedulerDependencies = defaultDependencies,
) {
  const prisma = getPrismaClient();
  const profile = await prisma.candidateProfile.findUnique({
    where: { userId },
    include: { searchSchedule: true },
  });
  if (!profile) throw new Error("Perfil profissional não encontrado.");

  const running = await prisma.searchRun.findFirst({
    where: { profileId: profile.id, status: "RUNNING" },
  });
  if (running) throw new Error("Já existe uma busca em execução.");

  const run = await prisma.searchRun.create({
    data: {
      id: randomUUID(),
      profileId: profile.id,
      status: "RUNNING",
      startedAt: dependencies.clock(),
    },
  });
  return executeSearchRun(
    run.id,
    provider,
    {
      userId,
      maxQueries: profile.searchSchedule?.maxQueries ?? 10,
      resultsPerQuery: profile.searchSchedule?.resultsPerQuery ?? 10,
    },
    dependencies,
  );
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

    await executeSearchRun(
      run.id,
      provider,
      {
        userId: schedule.profile.userId,
        maxQueries: schedule.maxQueries,
        resultsPerQuery: schedule.resultsPerQuery,
      },
      dependencies,
    );
  }

  return { due: due.length, claimed };
}

async function executeSearchRun(
  runId: string,
  provider: SearchProvider,
  options: SearchWorkerOptions,
  dependencies: SchedulerDependencies,
) {
  const prisma = getPrismaClient();
  try {
    const summary = await dependencies.runWorker(provider, options);
    return prisma.searchRun.update({
      where: { id: runId },
      data: {
        status: summary.failures.length ? "PARTIAL_FAILURE" : "COMPLETED",
        finishedAt: dependencies.clock(),
        queriesTotal: summary.queries.total,
        queriesSucceeded: summary.queries.succeeded,
        queriesFailed: summary.queries.failed,
        resultsFound: summary.results.found,
        resultsStored: summary.results.stored,
        resultsRejected: summary.results.rejected,
        resultsBlocked: summary.results.blocked,
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
    return prisma.searchRun.update({
      where: { id: runId },
      data: {
        status: "FAILED",
        finishedAt: dependencies.clock(),
        failures: [{ reason: "unexpected_error" }],
      },
    });
  }
}
