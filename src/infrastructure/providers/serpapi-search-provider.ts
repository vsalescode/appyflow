import { z } from "zod";

import type { ProviderHealth } from "@/application/providers/provider-health";
import {
  SearchProviderError,
  type SearchProvider,
  type SearchRequest,
  type SearchResult,
} from "@/application/providers/search-provider";

const searchResponseSchema = z.object({
  search_metadata: z
    .object({
      id: z.string().min(1).optional(),
      status: z.string().optional(),
    })
    .optional(),
  organic_results: z
    .array(
      z.object({
        title: z.string().min(1),
        link: z.url(),
        snippet: z.string().optional(),
        displayed_link: z.string().optional(),
        date: z.string().optional(),
      }),
    )
    .optional()
    .default([]),
  error: z.string().optional(),
});

type Fetch = typeof fetch;

export class SerpApiSearchProvider implements SearchProvider {
  readonly name = "serpapi";

  constructor(
    private readonly apiKey: string,
    private readonly fetchImplementation: Fetch = fetch,
  ) {}

  async search(request: SearchRequest): Promise<SearchResult> {
    if (!request.query.trim() || request.limit < 1 || request.limit > 10)
      throw new SearchProviderError("invalid_response");
    const page = request.page ?? 1;
    if (!Number.isInteger(page) || page < 1)
      throw new SearchProviderError("invalid_response");

    const url = new URL("https://serpapi.com/search.json");
    url.searchParams.set("engine", "google");
    url.searchParams.set("q", request.query.trim());
    url.searchParams.set("api_key", this.apiKey);
    url.searchParams.set("start", String((page - 1) * request.limit));
    url.searchParams.set("num", String(request.limit));
    if (request.country)
      url.searchParams.set("gl", request.country.toLowerCase());
    if (request.language) url.searchParams.set("hl", request.language);

    const response = await this.requestWithRetry(url);
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new SearchProviderError("invalid_response");
    }
    const parsed = searchResponseSchema.safeParse(body);
    if (!parsed.success || parsed.data.error)
      throw new SearchProviderError("invalid_response");

    const items = parsed.data.organic_results
      .slice(0, request.limit)
      .map((item) => ({
        title: item.title,
        url: item.link,
        snippet: item.snippet,
        displayedUrl: item.displayed_link,
        publishedAt: item.date,
      }));
    return {
      items,
      nextPage: items.length === request.limit ? page + 1 : undefined,
      requestId: parsed.data.search_metadata?.id,
    };
  }

  async checkHealth(): Promise<ProviderHealth> {
    const url = new URL("https://serpapi.com/account.json");
    url.searchParams.set("api_key", this.apiKey);
    try {
      await this.requestWithRetry(url);
      return { status: "available" };
    } catch (error) {
      if (error instanceof SearchProviderError)
        return {
          status: "unavailable",
          reason:
            error.reason === "authentication"
              ? "authentication"
              : error.reason === "timeout"
                ? "timeout"
                : "upstream",
        };
      return { status: "unavailable", reason: "upstream" };
    }
  }

  private async requestWithRetry(url: URL) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await this.fetchImplementation(url, {
          signal: AbortSignal.timeout(10_000),
        });
        if (response.ok) return response;
        if (response.status === 401 || response.status === 403)
          throw new SearchProviderError("authentication");
        if (response.status === 429 && attempt === 1)
          throw new SearchProviderError("rate_limit");
        if (response.status < 500 && response.status !== 429)
          throw new SearchProviderError("upstream");
        if (attempt === 1) throw new SearchProviderError("upstream");
      } catch (error) {
        if (error instanceof SearchProviderError) throw error;
        if (attempt === 1) throw new SearchProviderError("timeout");
      }
    }
    throw new SearchProviderError("upstream");
  }
}
