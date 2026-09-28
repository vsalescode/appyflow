import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { getOpportunityDashboard } from "@/application/dashboard/opportunity-dashboard-service";
import { getPrismaClient } from "@/infrastructure/database/prisma";

import { calculateAndStoreDeterministicMatches } from "./deterministic-matching-service";

const prisma = getPrismaClient();

beforeEach(async () => {
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("deterministic matching persistence", () => {
  it("persiste a decisão do filtro e oculta rejeitadas sem candidatura", async () => {
    const now = new Date();
    const userId = randomUUID();
    const profileId = randomUUID();
    await prisma.user.create({
      data: {
        id: userId,
        email: `${randomUUID()}@example.com`,
        passwordHash: "test",
        candidateProfile: {
          create: {
            id: profileId,
            preference: {
              create: {
                id: randomUUID(),
                desiredRoles: ["Backend"],
                seniorities: ["JUNIOR"],
                workModes: ["REMOTE"],
                locations: ["Brasil"],
              },
            },
            professionalFacts: {
              create: {
                id: randomUUID(),
                type: "SKILL",
                title: "Java",
                reviewStatus: "CONFIRMED",
              },
            },
          },
        },
      },
    });
    const query = await prisma.searchQuery.create({
      data: {
        id: randomUUID(),
        profileId,
        query: "Backend Java remoto",
        normalized: "backend java remoto",
        origin: "DETERMINISTIC",
      },
    });
    const source = await prisma.source.create({
      data: {
        id: randomUUID(),
        provider: "test",
        domain: "example.com",
      },
    });
    const eligible = await createJob({
      profileId,
      queryId: query.id,
      sourceId: source.id,
      title: "Backend Java Junior",
      fingerprint: "a".repeat(64),
      url: "https://example.com/jobs/junior",
      now,
    });
    const rejected = await createJob({
      profileId,
      queryId: query.id,
      sourceId: source.id,
      title: "Backend Java Senior",
      fingerprint: "b".repeat(64),
      url: "https://example.com/jobs/senior",
      now,
    });
    await prisma.jobMatch.create({
      data: {
        id: randomUUID(),
        jobId: rejected.id,
        score: 80,
        classification: "HOT",
        evaluatedWeight: 100,
        breakdown: {},
        calculatedAt: now,
      },
    });

    await expect(
      calculateAndStoreDeterministicMatches(userId, () => now),
    ).resolves.toEqual({ matched: 1, skipped: 1 });
    await expect(
      prisma.job.findUnique({
        where: { id: rejected.id },
        include: { match: true },
      }),
    ).resolves.toMatchObject({
      filterDecision: "REJECTED",
      match: null,
      filterRules: expect.arrayContaining([
        expect.objectContaining({ code: "SENIORITY", status: "REJECT" }),
      ]),
    });
    await expect(
      prisma.job.findUnique({ where: { id: eligible.id } }),
    ).resolves.toMatchObject({ filterDecision: "ELIGIBLE" });

    const dashboard = await getOpportunityDashboard(userId, {});
    expect(dashboard.jobs.map((job) => job.id)).toEqual([eligible.id]);
    expect(dashboard.counts.ALL).toBe(1);

    await prisma.application.create({
      data: { id: randomUUID(), jobId: rejected.id },
    });
    const dashboardWithTrackedApplication = await getOpportunityDashboard(
      userId,
      {},
    );
    expect(dashboardWithTrackedApplication.jobs.map((job) => job.id)).toEqual(
      expect.arrayContaining([eligible.id, rejected.id]),
    );
  });
});

async function createJob(input: {
  profileId: string;
  queryId: string;
  sourceId: string;
  title: string;
  fingerprint: string;
  url: string;
  now: Date;
}) {
  return prisma.job.create({
    data: {
      id: randomUUID(),
      profileId: input.profileId,
      fingerprint: input.fingerprint,
      title: input.title,
      company: "Example",
      description:
        "Desenvolvimento de serviços backend em Java, Spring Boot e PostgreSQL, com testes automatizados, revisão de código, documentação de APIs e colaboração com produto.",
      location: "Brasil",
      workArrangement: "REMOTE",
      publishedAt: input.now,
      discoveredAt: input.now,
      occurrences: {
        create: {
          id: randomUUID(),
          searchQueryId: input.queryId,
          sourceId: input.sourceId,
          originalUrl: input.url,
          canonicalUrl: input.url,
          discoveredAt: input.now,
        },
      },
    },
  });
}
