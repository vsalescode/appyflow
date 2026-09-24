import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  confirmAllPendingProfessionalFacts,
  extractExplicitLanguages,
  interpretActiveResume,
} from "./resume-interpretation-service";
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
        "TypeScript. Backend Engineer at Example from 2022 to 2024. Projeto Nilo. Português: Nativo. autenticação, autorização e integrações entre sistemas.",
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
      output: request.outputSchema.parse(
        request.outputSchema.name === "resume_skills_interpretation" &&
          typeof output === "object" &&
          output !== null &&
          "skills" in output
          ? { skills: output.skills }
          : output,
      ),
      model: "fake-model",
      requestId: "request-1",
      usage: { inputTokens: 10, outputTokens: 5 },
    }),
  };
}

describe("resume interpretation", () => {
  it("extrai individualmente todos os idiomas explícitos na mesma linha", () => {
    expect(
      extractExplicitLanguages(
        "Português: Nativo • Inglês: Intermediário • Espanhol: Básico",
      ),
    ).toEqual([
      {
        title: "Português",
        proficiency: "Nativo",
        evidenceQuote: "Português: Nativo",
      },
      {
        title: "Inglês",
        proficiency: "Intermediário",
        evidenceQuote: "Inglês: Intermediário",
      },
      {
        title: "Espanhol",
        proficiency: "Básico",
        evidenceQuote: "Espanhol: Básico",
      },
    ]);
  });

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
        experiences: [],
        projects: [
          {
            type: "PROJECT",
            title: "Nilo",
            organization: null,
            description: null,
            startedAt: null,
            endedAt: null,
            evidenceQuote: "Projeto Nilo",
          },
          {
            type: "PROJECT",
            title: "Nilo",
            organization: "GitHub",
            description: null,
            startedAt: null,
            endedAt: null,
            evidenceQuote: "Projeto Nilo",
          },
        ],
        languages: [
          {
            title: "Português",
            proficiency: "Nativo",
            evidenceQuote: "Português: Nativo",
          },
        ],
        skills: [
          {
            title: "TypeScript",
            description: null,
            evidenceQuote: "TypeScript",
          },
        ],
      }),
    );
    await expect(
      prisma.professionalFact.findFirst({ where: { type: "SKILL" } }),
    ).resolves.toMatchObject({
      sourceResumeId: resume.id,
      reviewStatus: "PENDING",
      evidenceQuote: "TypeScript",
      aiModel: "fake-model",
      aiRequestId: "request-1",
    });
    await expect(
      prisma.professionalFact.count({ where: { type: "PROJECT" } }),
    ).resolves.toBe(1);
    await expect(
      prisma.professionalFact.count({ where: { type: "LANGUAGE" } }),
    ).resolves.toBe(1);
    await expect(
      prisma.candidateProfile.findUnique({ where: { userId: user.id } }),
    ).resolves.toMatchObject({
      headline: "Backend Engineer",
      summary: "Backend Engineer com experiência em TypeScript.",
      seniority: "MID_LEVEL",
    });
    await expect(
      confirmAllPendingProfessionalFacts(user.id),
    ).resolves.toMatchObject({ count: 3 });
    await expect(
      prisma.professionalFact.count({ where: { reviewStatus: "PENDING" } }),
    ).resolves.toBe(0);
  });

  it("descarta o fato sem evidência e preserva idiomas explícitos", async () => {
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
          experiences: [],
          projects: [],
          languages: [],
          skills: [
            {
              title: "Kubernetes",
              description: null,
              evidenceQuote: "Kubernetes avançado",
            },
          ],
        }),
      ),
    ).resolves.toMatchObject({
      discarded: 1,
      languages: 1,
      skills: 0,
    });
    await expect(
      prisma.professionalFact.findFirst({ where: { type: "LANGUAGE" } }),
    ).resolves.toMatchObject({ title: "Português", description: "Nativo" });
    await expect(
      prisma.professionalFact.count({ where: { type: "SKILL" } }),
    ).resolves.toBe(0);
  });

  it("não recria um projeto quando apenas a origem muda", async () => {
    const { user, resume } = await createResume();
    const output = {
      profile: {
        headline: "Backend Engineer",
        summary: null,
        seniority: "UNSPECIFIED",
        city: null,
        region: null,
        country: null,
      },
      experiences: [],
      projects: [
        {
          type: "PROJECT",
          title: "Nilo",
          organization: "GitHub",
          description: null,
          startedAt: null,
          endedAt: null,
          evidenceQuote: "Projeto Nilo",
        },
      ],
      languages: [],
      skills: [],
    };

    await interpretActiveResume(user.id, fakeProvider(output));
    await confirmAllPendingProfessionalFacts(user.id);
    await prisma.resume.update({
      where: { id: resume.id },
      data: { isActive: false },
    });
    await prisma.resume.create({
      data: {
        id: randomUUID(),
        userId: user.id,
        originalName: "resume-2.pdf",
        mediaType: resume.mediaType,
        sizeBytes: resume.sizeBytes,
        checksum: "b".repeat(64),
        storageKey: `${randomUUID()}.pdf`,
        extractedText: resume.extractedText,
        pageCount: resume.pageCount,
        isActive: true,
      },
    });
    await expect(
      interpretActiveResume(
        user.id,
        fakeProvider({
          ...output,
          projects: [{ ...output.projects[0], organization: null }],
        }),
      ),
    ).resolves.toMatchObject({ projects: 0 });
    await expect(
      prisma.professionalFact.count({ where: { type: "PROJECT" } }),
    ).resolves.toBe(1);
  });

  it("consolida autenticação e autorização e descarta skills genéricas", async () => {
    const { user } = await createResume();
    await interpretActiveResume(
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
        experiences: [],
        projects: [],
        languages: [],
        skills: [
          {
            title: "Auth",
            description: null,
            evidenceQuote:
              "autenticação, autorização e integrações entre sistemas",
          },
          {
            title: "Authorization",
            description: null,
            evidenceQuote:
              "autenticação, autorização e integrações entre sistemas",
          },
          {
            title: "Integration",
            description: null,
            evidenceQuote:
              "autenticação, autorização e integrações entre sistemas",
          },
        ],
      }),
    );

    await expect(
      prisma.professionalFact.findMany({
        where: { type: "SKILL" },
        select: { title: true },
      }),
    ).resolves.toEqual([{ title: "Autenticação e autorização" }]);
  });
});
