import { describe, expect, it } from "vitest";

import { calculateDeterministicMatch } from "./deterministic-match";
import type { QuickFilterResult } from "./quick-filter";

const now = new Date("2026-09-18T12:00:00.000Z");
const passingFilters: QuickFilterResult = {
  decision: "ELIGIBLE",
  rules: [
    { code: "ROLE", status: "PASS", reason: "cargo compatível" },
    { code: "SENIORITY", status: "PASS", reason: "senioridade compatível" },
    { code: "WORK_MODE", status: "PASS", reason: "modalidade compatível" },
    { code: "LOCATION", status: "PASS", reason: "localização compatível" },
  ],
};

describe("deterministic job matching", () => {
  it("classifica como quente uma vaga recente com alta aderência", () => {
    const result = calculateDeterministicMatch(
      {
        title: "Senior Backend Engineer",
        description: "TypeScript, Node.js e PostgreSQL",
        publishedAt: new Date("2026-09-17T12:00:00.000Z"),
        discoveredAt: now,
      },
      {
        skills: ["TypeScript", "Node.js", "PostgreSQL", "AWS"],
        hasDesiredRoles: true,
        hasSeniorities: true,
        hasWorkModes: true,
        hasLocations: true,
      },
      passingFilters,
      now,
    );

    expect(result.score).toBe(90);
    expect(result.classification).toBe("HOT");
    expect(result.matchedSkills).toEqual([
      "TypeScript",
      "Node.js",
      "PostgreSQL",
    ]);
    expect(result.evaluatedWeight).toBe(100);
  });

  it("não transforma baixa cobertura em alta compatibilidade", () => {
    const result = calculateDeterministicMatch(
      {
        title: "Software Developer",
        discoveredAt: now,
      },
      {
        skills: [],
        hasDesiredRoles: false,
        hasSeniorities: false,
        hasWorkModes: false,
        hasLocations: false,
      },
      { decision: "ELIGIBLE", rules: [] },
      now,
    );

    expect(result.score).toBe(0);
    expect(result.classification).toBe("COLD");
    expect(result.evaluatedWeight).toBe(0);
    expect(result.breakdown.recency).toEqual({ earned: 0, available: 0 });
    expect(result.breakdown.skills.available).toBe(0);
  });

  it("atribui metade dos pontos a sinais que exigem revisão", () => {
    const filters: QuickFilterResult = {
      ...passingFilters,
      decision: "REVIEW",
      rules: passingFilters.rules.map((rule) =>
        rule.code === "LOCATION" || rule.code === "WORK_MODE"
          ? { ...rule, status: "REVIEW" as const }
          : rule,
      ),
    };
    const result = calculateDeterministicMatch(
      {
        title: "Senior Backend Engineer",
        description: "TypeScript",
        discoveredAt: new Date("2026-08-10T12:00:00.000Z"),
      },
      {
        skills: ["TypeScript", "AWS"],
        hasDesiredRoles: true,
        hasSeniorities: true,
        hasWorkModes: true,
        hasLocations: true,
      },
      filters,
      now,
    );

    expect(result.breakdown.workMode.earned).toBe(5);
    expect(result.breakdown.location.earned).toBe(3);
    expect(result.classification).toBe("WARM");
  });

  it("deduplica skills sem diferenciar caixa ou acentos", () => {
    const result = calculateDeterministicMatch(
      { title: "Developer", description: "React", discoveredAt: now },
      {
        skills: ["React", "react", "RÉACT"],
        hasDesiredRoles: false,
        hasSeniorities: false,
        hasWorkModes: false,
        hasLocations: false,
      },
      { decision: "ELIGIBLE", rules: [] },
      now,
    );

    expect(result.matchedSkills).toEqual(["React"]);
    expect(result.breakdown.skills).toEqual({ earned: 40, available: 40 });
  });
});
