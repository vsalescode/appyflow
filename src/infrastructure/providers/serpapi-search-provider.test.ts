import { describe, expect, it, vi } from "vitest";

import { SearchProviderError } from "@/application/providers/search-provider";

import { SerpApiSearchProvider } from "./serpapi-search-provider";

describe("SerpApiSearchProvider", () => {
  it("envia a busca autenticada e traduz resultados orgânicos", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          search_metadata: { id: "search-1", status: "Success" },
          organic_results: [
            {
              title: "Backend Engineer",
              link: "https://jobs.example.com/123",
              snippet: "Remote role",
              displayed_link: "jobs.example.com",
              date: "1 day ago",
            },
            {
              title: "Platform Engineer",
              link: "https://jobs.example.com/456",
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const provider = new SerpApiSearchProvider("secret", fetchMock);

    await expect(
      provider.search({
        query: " backend engineer ",
        country: "BR",
        language: "pt-br",
        page: 2,
        limit: 2,
      }),
    ).resolves.toEqual({
      items: [
        {
          title: "Backend Engineer",
          url: "https://jobs.example.com/123",
          snippet: "Remote role",
          displayedUrl: "jobs.example.com",
          publishedAt: "1 day ago",
        },
        {
          title: "Platform Engineer",
          url: "https://jobs.example.com/456",
          snippet: undefined,
          displayedUrl: undefined,
          publishedAt: undefined,
        },
      ],
      nextPage: 3,
      requestId: "search-1",
    });

    const url = fetchMock.mock.calls[0]?.[0] as URL;
    expect(url.origin + url.pathname).toBe("https://serpapi.com/search.json");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      engine: "google",
      q: "backend engineer",
      api_key: "secret",
      start: "2",
      num: "2",
      gl: "br",
      hl: "pt-br",
    });
  });

  it("repete uma vez após falha transitória", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ organic_results: [] }), { status: 200 }),
      );
    const provider = new SerpApiSearchProvider("secret", fetchMock);

    await expect(
      provider.search({ query: "engineer", limit: 10 }),
    ).resolves.toMatchObject({ items: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
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
