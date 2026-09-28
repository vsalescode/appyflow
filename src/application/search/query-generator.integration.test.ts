import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { AIProvider } from "@/application/providers/ai-provider";
import { getPrismaClient } from "@/infrastructure/database/prisma";
import {
  generateAIQueries,
  generateDeterministicQueries,
} from "./query-generator";

const prisma = getPrismaClient();

beforeEach(async () => {
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function createContext() {
  const user = await prisma.user.create({
    data: {
      id: randomUUID(),
      email: `${randomUUID()}@example.com`,
      passwordHash: "not-used-in-this-test",
      candidateProfile: {
        create: {
          id: randomUUID(),
          headline: "Backend Engineer",
          preference: {
            create: {
              id: randomUUID(),
              desiredRoles: ["Backend Engineer"],
              workModes: ["REMOTE"],
              locations: ["Brasil"],
              technologies: ["TypeScript"],
              excludedKeywords: ["voluntário"],
            },
          },
        },
      },
    },
  });
  return user;
}

describe("query generator", () => {
  it("gera queries determinísticas e não duplica execuções", async () => {
    const user = await createContext();
    await generateDeterministicQueries(user.id);
    await generateDeterministicQueries(user.id);

    const queries = await prisma.searchQuery.findMany();
    expect(queries.map((item) => item.query).sort()).toEqual(
      [
        "Backend Engineer remoto",
        "Backend Engineer remoto Brasil",
        "Backend Engineer TypeScript remoto",
      ].sort(),
    );
    expect(queries.every((item) => item.origin === "DETERMINISTIC")).toBe(true);
  });

  it("expande cargos genéricos e evita combinações incoerentes", async () => {
    const user = await createContext();
    const profile = await prisma.candidateProfile.findUniqueOrThrow({
      where: { userId: user.id },
    });
    await prisma.preference.update({
      where: { profileId: profile.id },
      data: {
        desiredRoles: ["Backend", "Front-End", "Estágio"],
        technologies: ["Java", "React", "TypeScript"],
      },
    });

    const queries = await generateDeterministicQueries(user.id);
    const values = queries.map((item) => item.query);

    expect(values).toContain("Desenvolvedor Backend Java remoto");
    expect(values).toContain("Desenvolvedor Frontend React remoto");
    expect(values).toContain(
      "Estágio em Desenvolvimento de Software Java remoto",
    );
    expect(values).not.toContain("Desenvolvedor Backend React remoto");
    expect(values).not.toContain("Desenvolvedor Frontend Java remoto");
  });

  it("valida e deduplica queries geradas por IA", async () => {
    const user = await createContext();
    const generateStructured = vi.fn().mockResolvedValue({
      output: {
        queries: [
          "Software Engineer remoto",
          " software engineer REMOTO ",
          "trabalho voluntário remoto",
        ],
      },
      model: "test-model",
      requestId: "request-1",
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    const provider = {
      name: "test",
      generateStructured,
      checkHealth: vi.fn(),
    } as AIProvider;

    await generateAIQueries(user.id, provider);

    await expect(prisma.searchQuery.findMany()).resolves.toMatchObject([
      {
        query: "Software Engineer remoto",
        origin: "AI",
        aiModel: "test-model",
        aiRequestId: "request-1",
      },
    ]);
    expect(generateStructured).toHaveBeenCalledOnce();
  });
});
