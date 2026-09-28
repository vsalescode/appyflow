import { describe, expect, it } from "vitest";

import { classifySourceDomain, sourceKindPriority } from "./source-kind";

describe("source kind", () => {
  it.each([
    ["empresa.gupy.io", "ATS"],
    ["jobs.example.com", "CAREER_PAGE"],
    ["br.linkedin.com", "SPECIALIZED_PORTAL"],
    ["glassdoor.com.br", "AGGREGATOR"],
    ["example.com", "UNKNOWN"],
  ] as const)("classifica %s como %s", (domain, kind) => {
    expect(classifySourceDomain(domain)).toBe(kind);
  });

  it("prioriza LinkedIn e ATS antes de agregadores", () => {
    expect(sourceKindPriority("SPECIALIZED_PORTAL", "br.linkedin.com")).toBe(0);
    expect(sourceKindPriority("ATS", "empresa.gupy.io")).toBe(1);
    expect(sourceKindPriority("AGGREGATOR", "glassdoor.com.br")).toBe(4);
  });

  it("classifica o domÃ­nio ao priorizar fontes antigas ainda desconhecidas", () => {
    expect(sourceKindPriority("UNKNOWN", "jobs.lever.co")).toBe(1);
    expect(sourceKindPriority("UNKNOWN", "br.indeed.com")).toBe(4);
  });
});
