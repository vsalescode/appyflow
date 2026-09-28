import { describe, expect, it } from "vitest";

import {
  evaluateQuickFilters,
  type QuickFilterJob,
  type QuickFilterPreferences,
} from "./quick-filter";

const now = new Date("2026-09-16T12:00:00.000Z");
const job: QuickFilterJob = {
  title: "Senior Backend Engineer",
  company: "Acme",
  description:
    "Build and maintain backend services with Node.js and PostgreSQL, write automated tests, review code, document APIs, and collaborate with the product team.",
  location: "São Paulo, Brasil",
  workArrangement: "REMOTE",
  publishedAt: new Date("2026-09-14T12:00:00.000Z"),
  discoveredAt: new Date("2026-09-15T12:00:00.000Z"),
};
const preferences: QuickFilterPreferences = {
  desiredRoles: ["Backend Engineer"],
  seniorities: ["SENIOR"],
  workModes: ["REMOTE"],
  locations: ["São Paulo"],
  technologies: ["Node.js"],
  excludedCompanies: ["Blocked Inc"],
  excludedKeywords: ["voluntário"],
};

describe("quick job filters", () => {
  it("aprova uma vaga compatível com as preferências", () => {
    const result = evaluateQuickFilters(job, preferences, { now });

    expect(result.decision).toBe("ELIGIBLE");
    expect(result.rules.every((rule) => rule.status === "PASS")).toBe(true);
  });

  it.each([
    ["empresa", { company: "Blocked Inc" }, "COMPANY"],
    ["palavra", { description: "Trabalho voluntário" }, "KEYWORD"],
    ["idade", { publishedAt: new Date("2026-06-01T12:00:00.000Z") }, "AGE"],
    ["modalidade", { workArrangement: "ONSITE" as const }, "WORK_MODE"],
    ["senioridade", { title: "Junior Backend Engineer" }, "SENIORITY"],
    ["stack", { description: "C# and SQL Server" }, "TECHNOLOGY"],
  ])("rejeita por %s incompatível", (_name, override, code) => {
    const result = evaluateQuickFilters({ ...job, ...override }, preferences, {
      now,
    });

    expect(result.decision).toBe("REJECTED");
    expect(result.rules).toContainEqual(
      expect.objectContaining({ code, status: "REJECT" }),
    );
  });

  it("encaminha dados ausentes ou ambíguos para revisão", () => {
    const result = evaluateQuickFilters(
      {
        ...job,
        title: "Software Developer",
        location: null,
        workArrangement: "UNKNOWN",
      },
      preferences,
      { now },
    );

    expect(result.decision).toBe("REVIEW");
    expect(result.rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "ROLE", status: "REVIEW" }),
        expect.objectContaining({ code: "LOCATION", status: "REVIEW" }),
        expect.objectContaining({ code: "WORK_MODE", status: "REVIEW" }),
      ]),
    );
  });

  it("encaminha data de publicação desconhecida para revisão", () => {
    const result = evaluateQuickFilters(
      {
        ...job,
        publishedAt: null,
        discoveredAt: new Date("2026-07-01T12:00:00.000Z"),
      },
      preferences,
      { now, maxAgeDays: 30 },
    );

    expect(result.decision).toBe("REVIEW");
    expect(result.rules).toContainEqual(
      expect.objectContaining({ code: "AGE", status: "REVIEW" }),
    );
  });

  it("encaminha descriÃ§Ã£o insuficiente para revisÃ£o", () => {
    const result = evaluateQuickFilters(
      { ...job, description: "Node.js" },
      preferences,
      { now },
    );

    expect(result.decision).toBe("REVIEW");
    expect(result.rules).toContainEqual(
      expect.objectContaining({ code: "DESCRIPTION", status: "REVIEW" }),
    );
  });

  it("usa a experiÃªncia exigida na descriÃ§Ã£o quando o tÃ­tulo omite a senioridade", () => {
    const result = evaluateQuickFilters(
      {
        ...job,
        title: "Backend Engineer",
        description:
          "We require at least 6 years of experience building backend systems with Node.js and PostgreSQL, automated tests, API design, observability, and production operations.",
      },
      { ...preferences, seniorities: ["JUNIOR"] },
      { now },
    );

    expect(result.decision).toBe("REJECTED");
    expect(result.rules).toContainEqual(
      expect.objectContaining({ code: "SENIORITY", status: "REJECT" }),
    );
  });

  it("compara texto sem diferenciar caixa ou acentos", () => {
    const result = evaluateQuickFilters(
      { ...job, company: "EMPRESA TECNOLOGIA" },
      { ...preferences, excludedCompanies: ["Empresa Técnologia"] },
      { now },
    );

    expect(result.decision).toBe("REJECTED");
  });

  it("rejeita tecnologia central do tÃ­tulo ausente nas skills confirmadas", () => {
    const result = evaluateQuickFilters(
      {
        ...job,
        title: "Desenvolvedor .NET + Chatbot Blip",
        description:
          "ExperiÃªncia comprovada com Blip, JavaScript, integraÃ§Ãµes HTTP, WhatsApp Business API, NLP, C#, ASP.NET Core, Azure e SQL Server.",
      },
      { ...preferences, technologies: [] },
      { now, candidateSkills: ["Java", "JavaScript", "Spring Boot"] },
    );

    expect(result.decision).toBe("REJECTED");
    expect(result.rules).toContainEqual(
      expect.objectContaining({
        code: "TECHNOLOGY",
        status: "REJECT",
        reason: expect.stringContaining(".NET, Blip"),
      }),
    );
  });
});
