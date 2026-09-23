import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { getPrismaClient } from "@/infrastructure/database/prisma";
import { normalizeAndStoreSearchResults } from "./job-normalization-service";

const prisma = getPrismaClient();

beforeEach(async () => {
  await prisma.user.deleteMany();
  await prisma.source.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function createQuery() {
  const profileId = randomUUID();
  await prisma.user.create({
    data: {
      id: randomUUID(),
      email: `${randomUUID()}@example.com`,
      passwordHash: "not-used-in-this-test",
      candidateProfile: { create: { id: profileId } },
    },
  });
  return prisma.searchQuery.create({
    data: {
      id: randomUUID(),
      profileId,
      query: "backend engineer remoto",
      normalized: "backend engineer remoto",
      origin: "DETERMINISTIC",
    },
  });
}

describe("job normalization service", () => {
  it("persiste vagas normalizadas e reutiliza a fonte", async () => {
    const query = await createQuery();
    const discoveredAt = new Date("2026-09-16T12:00:00.000Z");
    const summary = await normalizeAndStoreSearchResults(
      query.id,
      "serper",
      [
        {
          title: "Backend Engineer",
          company: "Example",
          location: "Remote - Brazil",
          snippet: "TypeScript and PostgreSQL",
          url: "https://jobs.example.com/1",
          publishedAt: "2026-09-15",
        },
        { title: "Software Engineer", url: "https://jobs.example.com/2" },
        { title: "Invalid", url: "file:///private/result" },
      ],
      () => discoveredAt,
    );

    expect(summary).toEqual({ stored: 2, rejected: 1, blocked: 0 });
    await expect(prisma.source.count()).resolves.toBe(1);
    await expect(prisma.source.findFirst()).resolves.toMatchObject({
      provider: "serper",
      domain: "jobs.example.com",
      kind: "UNKNOWN",
      occurrenceCount: 2,
      uniqueJobCount: 2,
      firstSeenAt: discoveredAt,
      lastSeenAt: discoveredAt,
    });
    await expect(prisma.sourceMetricSnapshot.count()).resolves.toBe(1);
    await expect(
      prisma.job.findFirst({ where: { title: "Backend Engineer" } }),
    ).resolves.toMatchObject({
      company: "Example",
      location: "Remote - Brazil",
      workArrangement: "REMOTE",
      publishedAt: new Date("2026-09-15T00:00:00.000Z"),
      discoveredAt,
    });
    await expect(prisma.job.count()).resolves.toBe(2);
    await expect(prisma.jobOccurrence.count()).resolves.toBe(2);
  });

  it("mantém snapshots históricos mesmo quando a ocorrência já existe", async () => {
    const query = await createQuery();
    const item = { title: "Engineer", url: "https://example.com/job/1" };
    await normalizeAndStoreSearchResults(
      query.id,
      "SERPER",
      [item],
      () => new Date("2026-09-16T10:00:00.000Z"),
    );
    await normalizeAndStoreSearchResults(
      query.id,
      "serper",
      [item],
      () => new Date("2026-09-17T10:00:00.000Z"),
    );

    await expect(prisma.source.findFirst()).resolves.toMatchObject({
      occurrenceCount: 1,
      uniqueJobCount: 1,
      firstSeenAt: new Date("2026-09-16T10:00:00.000Z"),
      lastSeenAt: new Date("2026-09-17T10:00:00.000Z"),
    });
    await expect(prisma.sourceMetricSnapshot.count()).resolves.toBe(2);
  });

  it("deduplica URLs canônicas repetidas na mesma query e fonte", async () => {
    const query = await createQuery();
    await normalizeAndStoreSearchResults(query.id, "serper", [
      {
        title: "Engineer",
        url: "https://example.com/job/1?utm_source=google#apply",
      },
      { title: "Engineer", url: "https://example.com/job/1" },
    ]);

    await expect(prisma.job.count()).resolves.toBe(1);
    await expect(prisma.jobOccurrence.count()).resolves.toBe(1);
    await expect(prisma.jobOccurrence.findFirst()).resolves.toMatchObject({
      originalUrl: "https://example.com/job/1?utm_source=google#apply",
      canonicalUrl: "https://example.com/job/1",
    });
  });

  it("une a mesma vaga entre fontes e preserva cada ocorrência", async () => {
    const query = await createQuery();
    const shared = {
      title: "Backend Engineer",
      company: "Example",
      location: "São Paulo",
    };
    await normalizeAndStoreSearchResults(query.id, "serper", [
      { ...shared, url: "https://jobs.example.com/123" },
    ]);
    await normalizeAndStoreSearchResults(query.id, "another-provider", [
      { ...shared, url: "https://careers.example.org/vacancy/abc" },
    ]);

    await expect(prisma.job.count()).resolves.toBe(1);
    await expect(prisma.source.count()).resolves.toBe(2);
    await expect(prisma.jobOccurrence.count()).resolves.toBe(2);
  });

  it("ignora novos resultados de uma fonte bloqueada", async () => {
    const query = await createQuery();
    await normalizeAndStoreSearchResults(query.id, "serper", [
      { title: "Engineer", url: "https://blocked.example.com/job/1" },
    ]);
    await prisma.source.updateMany({
      where: { domain: "blocked.example.com" },
      data: { managementStatus: "BLOCKED" },
    });

    await expect(
      normalizeAndStoreSearchResults(query.id, "serper", [
        { title: "Another Engineer", url: "https://blocked.example.com/job/2" },
      ]),
    ).resolves.toEqual({ stored: 0, rejected: 0, blocked: 1 });
    await expect(prisma.job.count()).resolves.toBe(1);
    await expect(prisma.jobOccurrence.count()).resolves.toBe(1);
  });
});
