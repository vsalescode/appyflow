import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { interpretActiveResume } from "./resume-interpretation-service";
import type { AIProvider } from "@/application/providers/ai-provider";
import { getPrismaClient } from "@/infrastructure/database/prisma";

const prisma = getPrismaClient();

beforeEach(async () => {
  await prisma.user.deleteMany();
});
afterAll(async () => prisma.$disconnect());

async function createResume() {
  const user = await prisma.user.create({
    data: {
      id: randomUUID(),
      email: `${randomUUID()}@example.com`,
      passwordHash: "test",
    },
  });
  const resume = await prisma.resume.create({
    data: {
      id: randomUUID(),
      userId: user.id,
      originalName: "resume.pdf",
      mediaType: "application/pdf",
      sizeBytes: 100,
      checksum: "a".repeat(64),
      storageKey: `${randomUUID()}.pdf`,
      extractedText:
        "TypeScript. Backend Engineer at Example from 2022 to 2024.",
      pageCount: 1,
    },
  });
  return { user, resume };
}

function fakeProvider(output: unknown): AIProvider {
  return {
    name: "fake",
    checkHealth: async () => ({ status: "available" }),
    generateStructured: async (request) => ({
      output: request.outputSchema.parse(output),
      model: "fake-model",
      requestId: "request-1",
      usage: { inputTokens: 10, outputTokens: 5 },
    }),
  };
}

describe("resume interpretation", () => {
  it("persiste somente fatos pendentes com evidência literal", async () => {
    const { user, resume } = await createResume();
    await interpretActiveResume(
      user.id,
      fakeProvider({
        profile: {
          headline: "Backend Engineer",
          summary: "Backend Engineer com experiência em TypeScript.",
          seniority: "MID_LEVEL",
          city: null,
          region: null,
          country: null,
        },
        facts: [
          {
            type: "SKILL",
            title: "TypeScript",
            organization: null,
            description: null,
            startedAt: null,
            endedAt: null,
            evidenceQuote: "TypeScript",
          },
        ],
      }),
    );
    await expect(prisma.professionalFact.findFirst()).resolves.toMatchObject({
      sourceResumeId: resume.id,
      reviewStatus: "PENDING",
      evidenceQuote: "TypeScript",
      aiModel: "fake-model",
      aiRequestId: "request-1",
    });
    await expect(
      prisma.candidateProfile.findUnique({ where: { userId: user.id } }),
    ).resolves.toMatchObject({
      headline: "Backend Engineer",
      summary: "Backend Engineer com experiência em TypeScript.",
      seniority: "MID_LEVEL",
    });
  });

  it("rejeita a resposta inteira quando a evidência não existe", async () => {
    const { user } = await createResume();
    await expect(
      interpretActiveResume(
        user.id,
        fakeProvider({
          profile: {
            headline: "Backend Engineer",
            summary: null,
            seniority: "UNSPECIFIED",
            city: null,
            region: null,
            country: null,
          },
          facts: [
            {
              type: "SKILL",
              title: "Kubernetes",
              organization: null,
              description: null,
              startedAt: null,
              endedAt: null,
              evidenceQuote: "Kubernetes avançado",
            },
          ],
        }),
      ),
    ).rejects.toThrow("sem evidência literal");
    await expect(prisma.professionalFact.count()).resolves.toBe(0);
    await expect(prisma.candidateProfile.count()).resolves.toBe(0);
  });
});
