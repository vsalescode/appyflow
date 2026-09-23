import type { SearchProvider } from "@/application/providers/search-provider";
import type { Environment } from "@/server/config/env";
import { parseProviderConfiguration } from "@/server/config/providers";

import { SerpApiSearchProvider } from "./serpapi-search-provider";
import { SerperSearchProvider } from "./serper-search-provider";

export function getSearchProvider(
  environment: Environment = process.env,
): SearchProvider | null {
  const configuration = parseProviderConfiguration(environment).search;
  if (!configuration.enabled) return null;
  switch (configuration.provider) {
    case "serper":
      return new SerperSearchProvider(configuration.apiKey);
    case "serpapi":
      return new SerpApiSearchProvider(configuration.apiKey);
  }
}
