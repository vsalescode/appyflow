import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { getPrismaClient } from "@/infrastructure/database/prisma";

import { normalizeAndStoreSearchResults } from "./job-normalization-service";
import {
  listDiscoveredSources,
  updateSourceManagement,
} from "./source-service";

const prisma = getPrismaClient();

beforeEach(async () => {
  await prisma.user.deleteMany();
  await prisma.source.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("gestão de fontes", () => {
  it("prioriza e bloqueia somente fontes visíveis ao usuário", async () => {
    const userId = randomUUID();
    const profileId = randomUUID();
    const queryId = randomUUID();
    await prisma.user.create({
      data: {
        id: userId,
        email: `${randomUUID()}@example.com`,
        passwordHash: "test",
        candidateProfile: {
          create: {
            id: profileId,
            searchQueries: {
              create: {
                id: queryId,
                query: "backend",
                normalized: "backend",
                origin: "DETERMINISTIC",
              },
            },
          },
        },
      },
    });
    await normalizeAndStoreSearchResults(queryId, "serper", [
      { title: "Backend", url: "https://jobs.example.com/1" },
    ]);
    const source = await prisma.source.findFirstOrThrow();
    const managedAt = new Date("2026-09-22T16:00:00.000Z");

    await updateSourceManagement(
      userId,
      source.id,
      "PRIORITIZED",
      () => managedAt,
    );
    await expect(listDiscoveredSources(userId)).resolves.toMatchObject([
      { id: source.id, managementStatus: "PRIORITIZED", managedAt },
    ]);
    await expect(
      updateSourceManagement(randomUUID(), source.id, "BLOCKED"),
    ).rejects.toThrow("Fonte não encontrada");
  });
});
