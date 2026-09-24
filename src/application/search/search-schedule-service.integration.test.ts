import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { SearchProvider } from "@/application/providers/search-provider";
import { getPrismaClient } from "@/infrastructure/database/prisma";

import {
  executeDueSearches,
  executeManualSearch,
  listSearchRuns,
  saveSearchSchedule,
} from "./search-schedule-service";

const prisma = getPrismaClient();
const provider: SearchProvider = {
  name: "test-provider",
  search: vi.fn(),
  checkHealth: vi.fn(async () => ({ status: "available" as const })),
};

beforeEach(async () => {
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("agendamento de buscas", () => {
  it("reivindica uma execução devida uma única vez e registra o resumo", async () => {
    const userId = randomUUID();
    await prisma.user.create({
      data: {
        id: userId,
        email: `${randomUUID()}@example.com`,
        passwordHash: "test",
        candidateProfile: { create: { id: randomUUID() } },
      },
    });
    await saveSearchSchedule(
      userId,
      {
        enabled: true,
        scheduledTime: "09:00",
        timeZone: "UTC",
        maxQueries: 4,
        resultsPerQuery: 6,
      },
      new Date("2026-09-22T08:00:00.000Z"),
    );
    const runWorker = vi.fn(async () => ({
      queries: { total: 3, succeeded: 2, failed: 1 },
      results: { found: 12, stored: 8, rejected: 3, blocked: 1 },
      matching: { profiles: 1, matched: 7, skipped: 1 },
      failures: [
        {
          stage: "search" as const,
          referenceId: "query-1",
          reason: "rate_limit",
        },
      ],
    }));
    const dueAt = new Date("2026-09-22T09:00:00.000Z");

    await expect(
      executeDueSearches(provider, dueAt, {
        runWorker,
        clock: () => new Date("2026-09-22T09:01:00.000Z"),
      }),
    ).resolves.toEqual({ due: 1, claimed: 1 });
    expect(runWorker).toHaveBeenCalledWith(provider, {
      userId,
      maxQueries: 4,
      resultsPerQuery: 6,
    });
    await expect(listSearchRuns(userId)).resolves.toMatchObject([
      {
        status: "PARTIAL_FAILURE",
        queriesTotal: 3,
        queriesSucceeded: 2,
        queriesFailed: 1,
        resultsFound: 12,
        resultsStored: 8,
        resultsRejected: 3,
        resultsBlocked: 1,
        jobsMatched: 7,
        jobsSkipped: 1,
      },
    ]);
    await expect(
      executeDueSearches(provider, dueAt, {
        runWorker,
        clock: () => dueAt,
      }),
    ).resolves.toEqual({ due: 0, claimed: 0 });
    expect(runWorker).toHaveBeenCalledOnce();
  });

  it("executa uma busca manual sem ativar o agendamento", async () => {
    const userId = randomUUID();
    await prisma.user.create({
      data: {
        id: userId,
        email: `${randomUUID()}@example.com`,
        passwordHash: "test",
        candidateProfile: { create: { id: randomUUID() } },
      },
    });
    const runWorker = vi.fn(async () => ({
      queries: { total: 2, succeeded: 2, failed: 0 },
      results: { found: 10, stored: 8, rejected: 2, blocked: 0 },
      matching: { profiles: 1, matched: 8, skipped: 0 },
      failures: [],
    }));

    await expect(
      executeManualSearch(userId, provider, {
        runWorker,
        clock: () => new Date("2026-09-24T12:00:00.000Z"),
      }),
    ).resolves.toMatchObject({
      status: "COMPLETED",
      queriesTotal: 2,
      resultsStored: 8,
    });
    expect(runWorker).toHaveBeenCalledWith(provider, {
      userId,
      maxQueries: 10,
      resultsPerQuery: 10,
    });
  });
});
