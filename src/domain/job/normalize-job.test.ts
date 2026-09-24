import { describe, expect, it } from "vitest";

import {
  canonicalizeJobUrl,
  createJobFingerprint,
  InvalidSearchResultError,
  normalizeSearchResult,
  resolveJobDetailUrl,
} from "./normalize-job";

describe("normalizeSearchResult", () => {
  it("normaliza campos explícitos e uma data ISO", () => {
    expect(
      normalizeSearchResult({
        title: "  Backend   Engineer ",
        company: " Example  Inc ",
        location: " São Paulo  - SP ",
        snippet: "Vaga híbrida para nossa equipe.",
        url: "https://JOBS.example.com/vaga/1",
        publishedAt: "2026-09-15",
      }),
    ).toEqual({
      title: "Backend Engineer",
      company: "Example Inc",
      location: "São Paulo - SP",
      description: "Vaga híbrida para nossa equipe.",
      workArrangement: "HYBRID",
      originalUrl: "https://JOBS.example.com/vaga/1",
      canonicalUrl: "https://jobs.example.com/vaga/1",
      sourceDomain: "jobs.example.com",
      publishedAt: new Date("2026-09-15T00:00:00.000Z"),
      publishedLabel: "2026-09-15",
    });
  });

  it("canonicaliza tracking, fragmento, parâmetros e barra final", () => {
    expect(
      canonicalizeJobUrl(
        "https://Example.com/jobs/1/?utm_source=google&b=2&a=1#apply",
      ),
    ).toBe("https://example.com/jobs/1?a=1&b=2");
  });

  it("gera o mesmo fingerprint sem depender de caixa ou acentos", () => {
    const first = normalizeSearchResult({
      title: "Engenheiro de Software",
      company: "Ação Tecnologia",
      location: "São Paulo",
      url: "https://first.example/job/1",
    });
    const second = normalizeSearchResult({
      title: "ENGENHEIRO DE SOFTWARE",
      company: "Acao Tecnologia",
      location: "Sao Paulo",
      url: "https://second.example/vacancy/9",
    });
    expect(createJobFingerprint(first)).toBe(createJobFingerprint(second));
  });

  it("preserva datas relativas sem convertê-las em timestamp", () => {
    expect(
      normalizeSearchResult({
        title: "Remote Software Engineer",
        url: "https://example.com/jobs/2",
        publishedAt: "2 days ago",
      }),
    ).toMatchObject({
      workArrangement: "REMOTE",
      publishedAt: undefined,
      publishedLabel: "2 days ago",
    });
  });

  it("rejeita URLs que não sejam HTTP ou HTTPS", () => {
    expect(() =>
      normalizeSearchResult({ title: "Engineer", url: "file:///etc/passwd" }),
    ).toThrow(InvalidSearchResultError);
  });

  it("transforma uma listagem selecionada do Indeed na vaga direta", () => {
    expect(
      resolveJobDetailUrl(
        "https://br.indeed.com/q-backend-remoto-vagas.html?vjk=00b049bdcb552bd2",
        "Desenvolvedor Backend Júnior",
      ),
    ).toBe("https://br.indeed.com/viewjob?jk=00b049bdcb552bd2");
  });

  it("transforma uma busca do LinkedIn com vaga selecionada em link direto", () => {
    expect(
      resolveJobDetailUrl(
        "https://www.linkedin.com/jobs/search/?keywords=backend&currentJobId=123456",
        "Backend Engineer",
      ),
    ).toBe("https://www.linkedin.com/jobs/view/123456");
  });

  it("não aceita uma página de resultados como uma vaga individual", () => {
    expect(() =>
      normalizeSearchResult({
        title: "1000+ Junior Software Engineer jobs in São Paulo",
        url: "https://www.linkedin.com/jobs/search/?keywords=junior",
      }),
    ).toThrow(InvalidSearchResultError);
  });
});
