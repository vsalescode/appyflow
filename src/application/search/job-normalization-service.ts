import { randomUUID } from "node:crypto";

import type { SearchResultItem } from "@/application/providers/search-provider";
import {
  InvalidSearchResultError,
  createJobFingerprint,
  normalizeSearchResult,
  type NormalizedJob,
} from "@/domain/job/normalize-job";
import { getPrismaClient } from "@/infrastructure/database/prisma";

export interface NormalizationSummary {
  stored: number;
  rejected: number;
  blocked: number;
}

export async function normalizeAndStoreSearchResults(
  searchQueryId: string,
  provider: string,
  items: readonly SearchResultItem[],
  clock: () => Date = () => new Date(),
): Promise<NormalizationSummary> {
  if (!provider.trim()) throw new Error("Provider is required");
  const providerName = provider.trim().toLowerCase();
  const observedAt = clock();
  const valid: NormalizedJob[] = [];
  let rejected = 0;
  let blocked = 0;
  let stored = 0;
  for (const item of items) {
    try {
      valid.push(normalizeSearchResult(item));
    } catch (error) {
      if (!(error instanceof InvalidSearchResultError)) throw error;
      rejected += 1;
    }
  }

  const prisma = getPrismaClient();
  await prisma.$transaction(async (transaction) => {
    const query = await transaction.searchQuery.findUniqueOrThrow({
      where: { id: searchQueryId },
      select: { profileId: true },
    });
    const touchedSourceIds = new Set<string>();
    for (const job of valid) {
      const source = await transaction.source.upsert({
        where: {
          provider_domain: {
            provider: providerName,
            domain: job.sourceDomain,
          },
        },
        create: {
          id: randomUUID(),
          provider: providerName,
          domain: job.sourceDomain,
          firstSeenAt: observedAt,
          lastSeenAt: observedAt,
        },
        update: { lastSeenAt: observedAt },
      });
      if (source.managementStatus === "BLOCKED") {
        blocked += 1;
        continue;
      }
      touchedSourceIds.add(source.id);
      const fingerprint = createJobFingerprint(job);
      const storedJob = await transaction.job.upsert({
        where: {
          profileId_fingerprint: {
            profileId: query.profileId,
            fingerprint,
          },
        },
        create: {
          id: randomUUID(),
          profileId: query.profileId,
          fingerprint,
          title: job.title,
          company: job.company,
          description: job.description,
          location: job.location,
          workArrangement: job.workArrangement,
          publishedAt: job.publishedAt,
          discoveredAt: observedAt,
        },
        update: {},
      });
      await transaction.jobOccurrence.upsert({
        where: {
          searchQueryId_sourceId_canonicalUrl: {
            searchQueryId,
            sourceId: source.id,
            canonicalUrl: job.canonicalUrl,
          },
        },
        create: {
          id: randomUUID(),
          jobId: storedJob.id,
          searchQueryId,
          sourceId: source.id,
          originalUrl: job.originalUrl,
          canonicalUrl: job.canonicalUrl,
          publishedLabel: job.publishedLabel,
          discoveredAt: observedAt,
        },
        update: {},
      });
      stored += 1;
    }
    for (const sourceId of touchedSourceIds) {
      const occurrenceCount = await transaction.jobOccurrence.count({
        where: { sourceId },
      });
      const uniqueJobs = await transaction.jobOccurrence.findMany({
        where: { sourceId },
        distinct: ["jobId"],
        select: { jobId: true },
      });
      const uniqueJobCount = uniqueJobs.length;
      await transaction.source.update({
        where: { id: sourceId },
        data: { occurrenceCount, uniqueJobCount, lastSeenAt: observedAt },
      });
      await transaction.sourceMetricSnapshot.create({
        data: {
          id: randomUUID(),
          sourceId,
          occurrenceCount,
          uniqueJobCount,
          observedAt,
        },
      });
    }
  });
  return { stored, rejected, blocked };
}
