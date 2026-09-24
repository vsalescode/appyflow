import type { AIProvider } from "@/application/providers/ai-provider";
import type { Environment } from "@/server/config/env";
import { parseProviderConfiguration } from "@/server/config/providers";

import { GroqProvider } from "./groq-provider";
import { OpenAIProvider } from "./openai-provider";

export function getAIProvider(
  environment: Environment = process.env,
): AIProvider | null {
  const configuration = parseProviderConfiguration(environment).ai;
  if (!configuration.enabled) return null;
  switch (configuration.provider) {
    case "openai":
      return new OpenAIProvider(configuration.apiKey, configuration.model);
    case "groq":
      return new GroqProvider(configuration.apiKey, configuration.model);
    default:
      throw new Error("O provider de IA configurado ainda não possui adapter.");
  }
}
