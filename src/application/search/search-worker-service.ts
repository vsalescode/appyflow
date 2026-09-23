import type {
  SearchProvider,
  SearchResultItem,
} from "@/application/providers/search-provider";
import { SearchProviderError } from "@/application/providers/search-provider";
import { getPrismaClient } from "@/infrastructure/database/prisma";

import { calculateAndStoreDeterministicMatches } from "./deterministic-matching-service";
import {
  normalizeAndStoreSearchResults,
  type NormalizationSummary,
} from "./job-normalization-service";

interface WorkerQuery {
  id: string;
  query: string;
  userId: string;
  country?: string;
}

export interface SearchWorkerOptions {
  userId?: string;
  maxQueries?: number;
  resultsPerQuery?: number;
}

interface SearchWorkerDependencies {
  listQueries: (
    options: SearchWorkerOptions,
  ) => Promise<readonly WorkerQuery[]>;
  normalize: (
    queryId: string,
    provider: string,
    items: readonly SearchResultItem[],
  ) => Promise<NormalizationSummary>;
  match: (userId: string) => Promise<{ matched: number; skipped: number }>;
}

export interface SearchWorkerFailure {
  stage: "search" | "normalize" | "match";
  referenceId: string;
  reason: string;
}

export interface SearchWorkerSummary {
  queries: { total: number; succeeded: number; failed: number };
  results: { found: number; stored: number; rejected: number; blocked: number };
  matching: { profiles: number; matched: number; skipped: number };
  failures: SearchWorkerFailure[];
}

function defaultDependencies(): SearchWorkerDependencies {
  return {
    listQueries: async (options) =>
      getPrismaClient()
        .searchQuery.findMany({
          where: options.userId
            ? { profile: { userId: options.userId } }
            : undefined,
          select: {
            id: true,
            query: true,
            profile: { select: { userId: true, country: true } },
          },
          orderBy: { createdAt: "asc" },
          take: options.maxQueries,
        })
        .then((queries) =>
          queries.map((item) => ({
            id: item.id,
            query: item.query,
            userId: item.profile.userId,
            country: item.profile.country ?? undefined,
          })),
        ),
    normalize: normalizeAndStoreSearchResults,
    match: calculateAndStoreDeterministicMatches,
  };
}

export async function runSearchWorker(
  provider: SearchProvider,
  dependencies: SearchWorkerDependencies = defaultDependencies(),
  options: SearchWorkerOptions = {},
): Promise<SearchWorkerSummary> {
  const queries = await dependencies.listQueries(options);
  const resultsPerQuery = options.resultsPerQuery ?? 10;
  if (resultsPerQuery < 1 || resultsPerQuery > 10)
    throw new Error("Limite de resultados por query inválido.");
  const summary: SearchWorkerSummary = {
    queries: { total: queries.length, succeeded: 0, failed: 0 },
    results: { found: 0, stored: 0, rejected: 0, blocked: 0 },
    matching: { profiles: 0, matched: 0, skipped: 0 },
    failures: [],
  };

  for (const query of queries) {
    let items: readonly SearchResultItem[];
    try {
      const result = await provider.search({
        query: query.query,
        country: query.country,
        page: 1,
        limit: resultsPerQuery,
      });
      items = result.items;
      summary.results.found += items.length;
    } catch (error) {
      recordFailure(summary, "search", query.id, error);
      continue;
    }

    try {
      const normalized = await dependencies.normalize(
        query.id,
        provider.name,
        items,
      );
      summary.results.stored += normalized.stored;
      summary.results.rejected += normalized.rejected;
      summary.results.blocked += normalized.blocked;
      summary.queries.succeeded += 1;
    } catch (error) {
      recordFailure(summary, "normalize", query.id, error);
    }
  }

  const userIds = [...new Set(queries.map((query) => query.userId))];
  for (const userId of userIds) {
    try {
      const matching = await dependencies.match(userId);
      summary.matching.profiles += 1;
      summary.matching.matched += matching.matched;
      summary.matching.skipped += matching.skipped;
    } catch (error) {
      recordFailure(summary, "match", userId, error);
    }
  }

  return summary;
}

function recordFailure(
  summary: SearchWorkerSummary,
  stage: SearchWorkerFailure["stage"],
  referenceId: string,
  error: unknown,
) {
  if (stage !== "match") summary.queries.failed += 1;
  summary.failures.push({
    stage,
    referenceId,
    reason:
      error instanceof SearchProviderError ? error.reason : "unexpected_error",
  });
}
