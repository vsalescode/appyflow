import { z } from "zod";

import type { ProviderHealth } from "@/application/providers/provider-health";
import { MAX_JOB_AGE_DAYS } from "@/domain/job/freshness";
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
  jobs_results: z
    .array(
      z.object({
        title: z.string().min(1),
        company_name: z.string().min(1),
        location: z.string().optional(),
        via: z.string().optional(),
        description: z.string().optional(),
        detected_extensions: z
          .object({ posted_at: z.string().optional() })
          .optional(),
        apply_options: z
          .array(
            z.object({
              title: z.string().min(1),
              link: z.url(),
            }),
          )
          .optional()
          .default([]),
        job_id: z.string().min(1),
      }),
    )
    .optional()
    .default([]),
  error: z.string().optional(),
});

type Fetch = typeof fetch;
const DAY_IN_MS = 24 * 60 * 60 * 1_000;

export class SerpApiSearchProvider implements SearchProvider {
  readonly name = "serpapi";

  constructor(
    private readonly apiKey: string,
    private readonly fetchImplementation: Fetch = fetch,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async search(request: SearchRequest): Promise<SearchResult> {
    if (!request.query.trim() || request.limit < 1 || request.limit > 10)
      throw new SearchProviderError("invalid_response");
    const page = request.page ?? 1;
    if (!Number.isInteger(page) || page < 1)
      throw new SearchProviderError("invalid_response");

    const url = new URL("https://serpapi.com/search.json");
    url.searchParams.set("engine", "google_jobs");
    url.searchParams.set("q", request.query.trim());
    url.searchParams.set("api_key", this.apiKey);
    if (request.country)
      url.searchParams.set("gl", request.country.toLowerCase());
    const location = resolveLocation(request.location, request.country);
    if (location) url.searchParams.set("location", location);
    if (request.language) url.searchParams.set("hl", request.language);

    const response = await this.requestWithRetry(url);
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new SearchProviderError("invalid_response");
    }
    const parsed = searchResponseSchema.safeParse(body);
    if (!parsed.success) throw new SearchProviderError("invalid_response");
    if (parsed.data.error) {
      if (/hasn't returned any results/i.test(parsed.data.error))
        return { items: [], requestId: parsed.data.search_metadata?.id };
      throw new SearchProviderError("invalid_response");
    }

    const now = this.clock();
    const enrichedItems = await Promise.all(
      parsed.data.jobs_results
        .filter((item) => item.apply_options.length > 0)
        .map(async (item) => {
          const apply = selectApplyOption(item.apply_options, item.via);
          const detectedPublishedAt = parseRelativePublishedAt(
            item.detected_extensions?.posted_at,
            now,
          );
          const publishedAt =
            detectedPublishedAt ?? (await this.fetchPublishedAt(apply.link));
          return {
            title: item.title,
            url: apply.link,
            snippet: item.description,
            displayedUrl: apply.title,
            publishedAt:
              publishedAt?.toISOString() ?? item.detected_extensions?.posted_at,
            company: item.company_name,
            location: item.location,
            publishedDate: publishedAt,
            isLinkedIn: isLinkedInOption(apply),
          };
        }),
    );
    const items = enrichedItems
      .filter(
        (item) =>
          !item.publishedDate ||
          now.getTime() - item.publishedDate.getTime() <=
            MAX_JOB_AGE_DAYS * DAY_IN_MS,
      )
      .sort((left, right) => {
        const dateDifference =
          (right.publishedDate?.getTime() ?? 0) -
          (left.publishedDate?.getTime() ?? 0);
        if (dateDifference) return dateDifference;
        return Number(right.isLinkedIn) - Number(left.isLinkedIn);
      })
      .slice(0, request.limit)
      .map((item) => ({
        title: item.title,
        url: item.url,
        snippet: item.snippet,
        displayedUrl: item.displayedUrl,
        publishedAt: item.publishedAt,
        company: item.company,
        location: item.location,
      }));
    return {
      items,
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
          throw new SearchProviderError("invalid_response");
        if (attempt === 1) throw new SearchProviderError("upstream");
      } catch (error) {
        if (error instanceof SearchProviderError) throw error;
        if (attempt === 1) throw new SearchProviderError("timeout");
      }
    }
    throw new SearchProviderError("upstream");
  }

  private async fetchPublishedAt(value: string) {
    if (!isSafePublicHttpUrl(value)) return undefined;
    try {
      const response = await this.fetchImplementation(value, {
        headers: { accept: "text/html,application/xhtml+xml" },
        redirect: "manual",
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) return undefined;
      const length = Number(response.headers.get("content-length") ?? 0);
      if (length > 2_000_000) return undefined;
      return extractJobPostingPublishedAt(await response.text());
    } catch {
      return undefined;
    }
  }
}

export function extractJobPostingPublishedAt(html: string) {
  const scripts = html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const match of scripts) {
    try {
      const date = findJobPostingDate(JSON.parse(match[1] ?? "null"));
      if (date) return date;
    } catch {
      continue;
    }
  }
  return undefined;
}

function findJobPostingDate(value: unknown): Date | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findJobPostingDate(item);
      if (found) return found;
    }
    return undefined;
  }
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const types = Array.isArray(record["@type"])
    ? record["@type"]
    : [record["@type"]];
  if (types.includes("JobPosting") && typeof record.datePosted === "string") {
    const date = new Date(record.datePosted);
    if (!Number.isNaN(date.getTime())) return date;
  }
  for (const child of Object.values(record)) {
    const found = findJobPostingDate(child);
    if (found) return found;
  }
  return undefined;
}

function isSafePublicHttpUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (
      hostname === "localhost" ||
      hostname.endsWith(".local") ||
      hostname === "::1" ||
      hostname.startsWith("fc") ||
      hostname.startsWith("fd") ||
      hostname.startsWith("fe80:") ||
      hostname.startsWith("::ffff:")
    )
      return false;
    const octets = hostname.split(".").map(Number);
    if (octets.length !== 4 || octets.some((item) => Number.isNaN(item)))
      return true;
    return !(
      octets[0] === 0 ||
      octets[0] === 10 ||
      octets[0] === 127 ||
      (octets[0] === 100 &&
        (octets[1] ?? 0) >= 64 &&
        (octets[1] ?? 0) <= 127) ||
      (octets[0] === 169 && octets[1] === 254) ||
      (octets[0] === 172 && (octets[1] ?? 0) >= 16 && (octets[1] ?? 0) <= 31) ||
      (octets[0] === 192 && octets[1] === 168)
    );
  } catch {
    return false;
  }
}

function selectApplyOption(
  options: readonly { title: string; link: string }[],
  source?: string,
) {
  return (
    options.find(isLinkedInOption) ??
    options.find(
      (option) => source && option.title.toLowerCase() === source.toLowerCase(),
    ) ??
    options[0]!
  );
}

function isLinkedInOption(option: { title: string; link: string }) {
  try {
    const hostname = new URL(option.link).hostname.replace(/^www\./, "");
    return (
      option.title.toLowerCase() === "linkedin" ||
      hostname === "linkedin.com" ||
      hostname.endsWith(".linkedin.com")
    );
  } catch {
    return false;
  }
}

export function parseRelativePublishedAt(value: string | undefined, now: Date) {
  if (!value) return undefined;
  const normalized = value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
  if (
    /^(today|hoje|just posted|agora|posted today|recently posted)$/.test(
      normalized,
    )
  )
    return new Date(now);

  const match = normalized.match(
    /(\d+)\+?\s*(minute|minuto|hour|hora|day|dia|week|semana|month|mes)/,
  );
  if (!match) return undefined;
  const amount = Number(match[1]);
  const unit = match[2]!;
  const multiplier = /^(minute|minuto)/.test(unit)
    ? 60 * 1_000
    : /^(hour|hora)/.test(unit)
      ? 60 * 60 * 1_000
      : /^(day|dia)/.test(unit)
        ? DAY_IN_MS
        : /^(week|semana)/.test(unit)
          ? 7 * DAY_IN_MS
          : 30 * DAY_IN_MS;
  return new Date(now.getTime() - amount * multiplier);
}

function countryName(country?: string) {
  if (!country) return undefined;
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(
      country.toUpperCase(),
    );
  } catch {
    return undefined;
  }
}

function resolveLocation(location?: string, country?: string) {
  const canonicalCountry = countryName(country);
  if (!location) return canonicalCountry;
  if (!country || !canonicalCountry) return location;

  const normalizedLocation = normalizeLocation(location);
  const countryAliases = [
    country,
    canonicalCountry,
    localizedCountryName(country),
  ]
    .filter((value): value is string => Boolean(value))
    .map(normalizeLocation);
  return countryAliases.includes(normalizedLocation)
    ? canonicalCountry
    : location;
}

function localizedCountryName(country: string) {
  try {
    return new Intl.DisplayNames(["pt-BR"], { type: "region" }).of(
      country.toUpperCase(),
    );
  } catch {
    return undefined;
  }
}

function normalizeLocation(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}
