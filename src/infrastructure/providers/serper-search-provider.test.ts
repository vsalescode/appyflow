import { describe, expect, it, vi } from "vitest";

import { SearchProviderError } from "@/application/providers/search-provider";

import { SerperSearchProvider } from "./serper-search-provider";

describe("SerperSearchProvider", () => {
  it("envia a busca autenticada e traduz resultados orgânicos", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          organic: [
            {
              title: "Backend Engineer",
              link: "https://jobs.example.com/123",
              snippet: "Remote role",
              displayedLink: "jobs.example.com",
              date: "1 day ago",
            },
          ],
        }),
        { status: 200, headers: { "x-request-id": "request-1" } },
      ),
    );
    const provider = new SerperSearchProvider("secret", fetchMock);

    await expect(
      provider.search({
        query: "backend engineer",
        country: "BR",
        language: "pt-br",
        page: 2,
        limit: 5,
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
      ],
      nextPage: undefined,
      requestId: "request-1",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://google.serper.dev/search",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-API-KEY": "secret" }),
        body: JSON.stringify({
          q: "backend engineer",
          gl: "br",
          hl: "pt-br",
          page: 2,
          num: 5,
        }),
      }),
    );
  });

  it("repete uma vez após falha transitória", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ organic: [] }), { status: 200 }),
      );
    const provider = new SerperSearchProvider("secret", fetchMock);

    await expect(
      provider.search({ query: "engineer", limit: 10 }),
    ).resolves.toMatchObject({ items: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("não repete erro de autenticação nem expõe a chave", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 401 }));
    const provider = new SerperSearchProvider("super-secret", fetchMock);

    const error = await provider
      .search({ query: "engineer", limit: 10 })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SearchProviderError);
    expect(error).toMatchObject({ reason: "authentication" });
    expect((error as Error).message).not.toContain("super-secret");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("traduz uma resposta inválida sem expor seu conteúdo", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("not-json", { status: 200 }));
    const provider = new SerperSearchProvider("secret", fetchMock);

    await expect(
      provider.search({ query: "engineer", limit: 10 }),
    ).rejects.toMatchObject({ reason: "invalid_response" });
  });

  it("usa o endpoint de conta no health check", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ balance: 10 })));
    const provider = new SerperSearchProvider("secret", fetchMock);

    await expect(provider.checkHealth()).resolves.toEqual({
      status: "available",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://google.serper.dev/account",
      expect.any(Object),
    );
  });
});
