import { describe, expect, it, vi } from "vitest";

import type { SearchProvider } from "@/application/providers/search-provider";
import { SearchProviderError } from "@/infrastructure/providers/serper-search-provider";

import { runSearchWorker } from "./search-worker-service";

describe("search worker", () => {
  it("executa o pipeline em todas as queries e faz matching uma vez por perfil", async () => {
    const provider: SearchProvider = {
      name: "test-provider",
      checkHealth: vi.fn(async () => ({ status: "available" as const })),
      search: vi.fn(async ({ query }) => ({
        items: [{ title: query, url: `https://example.com/${query}` }],
      })),
    };
    const normalize = vi
      .fn()
      .mockResolvedValueOnce({ stored: 1, rejected: 0, blocked: 0 })
      .mockResolvedValueOnce({ stored: 0, rejected: 0, blocked: 1 });
    const match = vi.fn(async () => ({ matched: 2, skipped: 1 }));

    const summary = await runSearchWorker(provider, {
      listQueries: async () => [
        { id: "query-1", query: "backend", userId: "user-1", country: "BR" },
        { id: "query-2", query: "typescript", userId: "user-1" },
      ],
      normalize,
      match,
    });

    expect(summary).toEqual({
      queries: { total: 2, succeeded: 2, failed: 0 },
      results: { found: 2, stored: 1, rejected: 0, blocked: 1 },
      matching: { profiles: 1, matched: 2, skipped: 1 },
      failures: [],
    });
    expect(provider.search).toHaveBeenCalledTimes(2);
    expect(provider.search).toHaveBeenCalledWith({
      query: "backend",
      country: "BR",
      page: 1,
      limit: 10,
    });
    expect(normalize).toHaveBeenCalledWith(
      "query-1",
      "test-provider",
      expect.any(Array),
    );
    expect(match).toHaveBeenCalledOnce();
  });

  it("isola falhas por query e continua o restante do ciclo", async () => {
    const provider: SearchProvider = {
      name: "test-provider",
      checkHealth: vi.fn(async () => ({ status: "available" as const })),
      search: vi
        .fn()
        .mockRejectedValueOnce(new SearchProviderError("rate_limit"))
        .mockResolvedValueOnce({ items: [] }),
    };
    const normalize = vi.fn(async () => ({
      stored: 0,
      rejected: 0,
      blocked: 0,
    }));

    const summary = await runSearchWorker(provider, {
      listQueries: async () => [
        { id: "query-1", query: "backend", userId: "user-1" },
        { id: "query-2", query: "frontend", userId: "user-2" },
      ],
      normalize,
      match: async () => ({ matched: 0, skipped: 0 }),
    });

    expect(summary.queries).toEqual({ total: 2, succeeded: 1, failed: 1 });
    expect(summary.failures).toContainEqual({
      stage: "search",
      referenceId: "query-1",
      reason: "rate_limit",
    });
    expect(normalize).toHaveBeenCalledOnce();
  });

  it("não chama provider nem matching quando não existem queries", async () => {
    const search = vi.fn();
    const match = vi.fn();
    const summary = await runSearchWorker(
      {
        name: "test-provider",
        search,
        checkHealth: vi.fn(async () => ({ status: "available" as const })),
      },
      {
        listQueries: async () => [],
        normalize: vi.fn(),
        match,
      },
    );

    expect(summary.queries.total).toBe(0);
    expect(search).not.toHaveBeenCalled();
    expect(match).not.toHaveBeenCalled();
  });

  it("aplica os limites configurados ao ciclo", async () => {
    const listQueries = vi.fn(async () => [
      { id: "query-1", query: "backend", userId: "user-1" },
    ]);
    const search = vi.fn(async () => ({ items: [] }));
    await runSearchWorker(
      {
        name: "test-provider",
        search,
        checkHealth: vi.fn(async () => ({ status: "available" as const })),
      },
      {
        listQueries,
        normalize: vi.fn(async () => ({ stored: 0, rejected: 0, blocked: 0 })),
        match: vi.fn(async () => ({ matched: 0, skipped: 0 })),
      },
      { userId: "user-1", maxQueries: 4, resultsPerQuery: 6 },
    );

    expect(listQueries).toHaveBeenCalledWith({
      userId: "user-1",
      maxQueries: 4,
      resultsPerQuery: 6,
    });
    expect(search).toHaveBeenCalledWith(expect.objectContaining({ limit: 6 }));
  });
});
