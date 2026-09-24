import { describe, expect, it, vi } from "vitest";

import { SearchProviderError } from "@/application/providers/search-provider";

import {
  SerpApiSearchProvider,
  parseRelativePublishedAt,
} from "./serpapi-search-provider";

describe("SerpApiSearchProvider", () => {
  it("converte datas relativas em português e inglês", () => {
    const now = new Date("2026-09-24T12:00:00.000Z");
    expect(parseRelativePublishedAt("há 2 dias", now)?.toISOString()).toBe(
      "2026-09-22T12:00:00.000Z",
    );
    expect(parseRelativePublishedAt("3 weeks ago", now)?.toISOString()).toBe(
      "2026-09-03T12:00:00.000Z",
    );
    expect(parseRelativePublishedAt("hoje", now)?.toISOString()).toBe(
      now.toISOString(),
    );
  });

  it("busca vagas estruturadas e usa o link direto de candidatura", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          search_metadata: { id: "search-1", status: "Success" },
          jobs_results: [
            {
              title: "Backend Engineer",
              company_name: "Example",
              location: "Remote - Brazil",
              via: "LinkedIn",
              description: "Remote role with TypeScript and PostgreSQL.",
              detected_extensions: { posted_at: "1 day ago" },
              apply_options: [
                {
                  title: "Example careers",
                  link: "https://example.com/jobs/123",
                },
                {
                  title: "LinkedIn",
                  link: "https://www.linkedin.com/jobs/view/backend-engineer-at-example-123?utm_source=google_jobs_apply",
                },
              ],
              job_id: "job-1",
            },
            {
              title: "Platform Engineer",
              company_name: "Another Example",
              apply_options: [],
              job_id: "job-2",
            },
            {
              title: "Old Backend Engineer",
              company_name: "Old Example",
              detected_extensions: { posted_at: "45 days ago" },
              apply_options: [
                {
                  title: "LinkedIn",
                  link: "https://www.linkedin.com/jobs/view/456",
                },
              ],
              job_id: "job-3",
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const provider = new SerpApiSearchProvider(
      "secret",
      fetchMock,
      () => new Date("2026-09-24T12:00:00.000Z"),
    );

    await expect(
      provider.search({
        query: " backend engineer ",
        country: "BR",
        language: "pt-br",
        page: 1,
        limit: 2,
      }),
    ).resolves.toEqual({
      items: [
        {
          title: "Backend Engineer",
          url: "https://www.linkedin.com/jobs/view/backend-engineer-at-example-123?utm_source=google_jobs_apply",
          snippet: "Remote role with TypeScript and PostgreSQL.",
          displayedUrl: "LinkedIn",
          publishedAt: "2026-09-23T12:00:00.000Z",
          company: "Example",
          location: "Remote - Brazil",
        },
      ],
      requestId: "search-1",
    });

    const url = fetchMock.mock.calls[0]?.[0] as URL;
    expect(url.origin + url.pathname).toBe("https://serpapi.com/search.json");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      engine: "google_jobs",
      q: "backend engineer",
      api_key: "secret",
      gl: "br",
      location: "Brazil",
      hl: "pt-br",
    });
  });

  it("repete uma vez após falha transitória", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ jobs_results: [] }), { status: 200 }),
      );
    const provider = new SerpApiSearchProvider("secret", fetchMock);

    await expect(
      provider.search({ query: "engineer", limit: 10 }),
    ).resolves.toMatchObject({ items: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("converte o nome localizado do país para a localização canônica", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ jobs_results: [] }), { status: 200 }),
      );
    const provider = new SerpApiSearchProvider("secret", fetchMock);

    await provider.search({
      query: "backend remoto",
      country: "BR",
      location: "Brasil",
      limit: 10,
    });

    const url = fetchMock.mock.calls[0]?.[0] as URL;
    expect(url.searchParams.get("location")).toBe("Brazil");
  });

  it("classifica parâmetros rejeitados como resposta inválida", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 400 }));
    const provider = new SerpApiSearchProvider("secret", fetchMock);

    await expect(
      provider.search({ query: "backend remoto", limit: 10 }),
    ).rejects.toMatchObject({ reason: "invalid_response" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("não repete erro de autenticação nem expõe a chave", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 401 }));
    const provider = new SerpApiSearchProvider("super-secret", fetchMock);

    const error = await provider
      .search({ query: "engineer", limit: 10 })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SearchProviderError);
    expect(error).toMatchObject({ reason: "authentication" });
    expect((error as Error).message).not.toContain("super-secret");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("rejeita respostas inválidas e erros retornados no corpo", async () => {
    const invalidJsonFetch = vi
      .fn()
      .mockResolvedValue(new Response("not-json", { status: 200 }));
    const providerWithInvalidJson = new SerpApiSearchProvider(
      "secret",
      invalidJsonFetch,
    );
    await expect(
      providerWithInvalidJson.search({ query: "engineer", limit: 10 }),
    ).rejects.toMatchObject({ reason: "invalid_response" });

    const errorBodyFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Invalid request" }), {
        status: 200,
      }),
    );
    const providerWithErrorBody = new SerpApiSearchProvider(
      "secret",
      errorBodyFetch,
    );
    await expect(
      providerWithErrorBody.search({ query: "engineer", limit: 10 }),
    ).rejects.toMatchObject({ reason: "invalid_response" });
  });

  it("usa o endpoint de conta no health check", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ account_id: "1" })));
    const provider = new SerpApiSearchProvider("secret", fetchMock);

    await expect(provider.checkHealth()).resolves.toEqual({
      status: "available",
    });
    const url = fetchMock.mock.calls[0]?.[0] as URL;
    expect(url.origin + url.pathname).toBe("https://serpapi.com/account.json");
    expect(url.searchParams.get("api_key")).toBe("secret");
  });
});
