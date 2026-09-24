import { createHash } from "node:crypto";

import { z } from "zod";

import type { SearchResultItem } from "@/application/providers/search-provider";

export class InvalidSearchResultError extends Error {}

const text = (maximum: number) =>
  z.string().trim().min(1).max(maximum).optional();

const resultSchema = z.object({
  title: z.string().trim().min(1).max(300),
  url: z.url().max(2048),
  snippet: text(20_000),
  publishedAt: text(100),
  company: text(200),
  location: text(200),
});

export interface NormalizedJob {
  title: string;
  company?: string;
  description?: string;
  location?: string;
  workArrangement: "UNKNOWN" | "REMOTE" | "HYBRID" | "ONSITE";
  originalUrl: string;
  canonicalUrl: string;
  sourceDomain: string;
  publishedAt?: Date;
  publishedLabel?: string;
}

const trackingParameters = new Set([
  "fbclid",
  "gclid",
  "msclkid",
  "ref",
  "referrer",
]);

export function canonicalizeJobUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new InvalidSearchResultError();
  if (url.username || url.password) throw new InvalidSearchResultError();
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  for (const key of [...url.searchParams.keys()])
    if (
      key.toLowerCase().startsWith("utm_") ||
      trackingParameters.has(key.toLowerCase())
    )
      url.searchParams.delete(key);
  url.searchParams.sort();
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}

export function resolveJobDetailUrl(value: string, title: string) {
  const canonical = canonicalizeJobUrl(value);
  const url = new URL(canonical);
  const hostname = url.hostname.replace(/^www\./, "");

  if (hostname.endsWith("indeed.com")) {
    const jobKey = url.searchParams.get("jk") ?? url.searchParams.get("vjk");
    if (!jobKey || !/^[a-z0-9]+$/i.test(jobKey))
      throw new InvalidSearchResultError();
    return `${url.origin}/viewjob?jk=${encodeURIComponent(jobKey)}`;
  }

  if (hostname === "linkedin.com" || hostname.endsWith(".linkedin.com")) {
    const currentJobId = url.searchParams.get("currentJobId");
    if (currentJobId && /^\d+$/.test(currentJobId))
      return `https://www.linkedin.com/jobs/view/${currentJobId}`;
    if (!/^\/jobs\/view\//.test(url.pathname))
      throw new InvalidSearchResultError();
  }

  if (isListingTitle(title) || isListingPath(url.pathname))
    throw new InvalidSearchResultError();
  return canonical;
}

function isListingTitle(value: string) {
  const title = foldIdentity(value);
  return (
    /^\d+\+? (jobs|vagas|empregos)\b/.test(title) ||
    /^(jobs|vagas|empregos) (de|para|em|in)\b/.test(title) ||
    /\b(job search|pesquisa de vagas|resultados de busca)\b/.test(title)
  );
}

function isListingPath(pathname: string) {
  const path = pathname.toLowerCase().replace(/\/+$/, "");
  return (
    /\/(jobs?|vagas?|careers?)\/search(?:\/|$)/.test(path) ||
    /^\/(jobs?|vagas?|careers?)$/.test(path)
  );
}

function foldIdentity(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function createJobFingerprint(job: NormalizedJob) {
  const identity =
    job.company && job.location
      ? ["semantic", job.title, job.company, job.location]
          .map(foldIdentity)
          .join("|")
      : `url|${job.canonicalUrl}`;
  return createHash("sha256").update(identity).digest("hex");
}

function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function inferWorkArrangement(value: string): NormalizedJob["workArrangement"] {
  const normalized = value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  if (/\b(hybrid|hibrid[oa])\b/.test(normalized)) return "HYBRID";
  if (/\b(remote|remot[oa])\b/.test(normalized)) return "REMOTE";
  if (/\b(on[- ]?site|presencial)\b/.test(normalized)) return "ONSITE";
  return "UNKNOWN";
}

function parsePublishedDate(value: string | undefined) {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) return undefined;
  const date = new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function normalizeSearchResult(item: SearchResultItem): NormalizedJob {
  const parsed = resultSchema.safeParse(item);
  if (!parsed.success) throw new InvalidSearchResultError();
  const canonicalUrl = resolveJobDetailUrl(parsed.data.url, parsed.data.title);
  const url = new URL(canonicalUrl);
  const title = normalizeWhitespace(parsed.data.title);
  const company = parsed.data.company
    ? normalizeWhitespace(parsed.data.company)
    : undefined;
  const description = parsed.data.snippet
    ? normalizeWhitespace(parsed.data.snippet)
    : undefined;
  const location = parsed.data.location
    ? normalizeWhitespace(parsed.data.location)
    : undefined;
  const publishedLabel = parsed.data.publishedAt
    ? normalizeWhitespace(parsed.data.publishedAt)
    : undefined;
  return {
    title,
    company,
    description,
    location,
    workArrangement: inferWorkArrangement(
      [title, description, location].filter(Boolean).join(" "),
    ),
    originalUrl: parsed.data.url,
    canonicalUrl,
    sourceDomain: url.hostname.replace(/^www\./, ""),
    publishedAt: parsePublishedDate(publishedLabel),
    publishedLabel,
  };
}
