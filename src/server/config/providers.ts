import { z } from "zod";

import type { Environment } from "./env";

const optionalValue = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().min(1).optional(),
);

const providerEnvironmentSchema = z
  .object({
    AI_PROVIDER: z
      .enum(["disabled", "openai", "groq", "gemini", "anthropic", "openrouter"])
      .default("disabled"),
    AI_API_KEY: optionalValue,
    AI_MODEL: optionalValue,
    SEARCH_PROVIDER: z
      .enum(["disabled", "serpapi", "serper"])
      .default("disabled"),
    SEARCH_API_KEY: optionalValue,
  })
  .superRefine((environment, context) => {
    if (environment.AI_PROVIDER !== "disabled") {
      if (!environment.AI_API_KEY) {
        context.addIssue({
          code: "custom",
          path: ["AI_API_KEY"],
          message: "é obrigatória quando AI_PROVIDER está habilitado",
        });
      }
      if (!environment.AI_MODEL) {
        context.addIssue({
          code: "custom",
          path: ["AI_MODEL"],
          message: "é obrigatório quando AI_PROVIDER está habilitado",
        });
      }
    }
    if (
      environment.SEARCH_PROVIDER !== "disabled" &&
      !environment.SEARCH_API_KEY
    ) {
      context.addIssue({
        code: "custom",
        path: ["SEARCH_API_KEY"],
        message: "é obrigatória quando SEARCH_PROVIDER está habilitado",
      });
    }
  });

type ParsedProviderEnvironment = z.infer<typeof providerEnvironmentSchema>;

export type ProviderConfiguration = {
  ai:
    | { enabled: false }
    | {
        enabled: true;
        provider: Exclude<ParsedProviderEnvironment["AI_PROVIDER"], "disabled">;
        apiKey: string;
        model: string;
      };
  search:
    | { enabled: false }
    | {
        enabled: true;
        provider: Exclude<
          ParsedProviderEnvironment["SEARCH_PROVIDER"],
          "disabled"
        >;
        apiKey: string;
      };
};

export class InvalidProviderConfigurationError extends Error {
  constructor(public readonly issues: readonly string[]) {
    super(`Configuração de providers inválida: ${issues.join("; ")}`);
    this.name = "InvalidProviderConfigurationError";
  }
}

export function parseProviderConfiguration(
  environment: Environment,
): ProviderConfiguration {
  const result = providerEnvironmentSchema.safeParse(environment);
  if (!result.success) {
    throw new InvalidProviderConfigurationError(
      result.error.issues.map(
        (issue) => `${issue.path.join(".")}: ${issue.message}`,
      ),
    );
  }

  const values = result.data;
  return {
    ai:
      values.AI_PROVIDER === "disabled"
        ? { enabled: false }
        : {
            enabled: true,
            provider: values.AI_PROVIDER,
            apiKey: values.AI_API_KEY!,
            model: values.AI_MODEL!,
          },
    search:
      values.SEARCH_PROVIDER === "disabled"
        ? { enabled: false }
        : {
            enabled: true,
            provider: values.SEARCH_PROVIDER,
            apiKey: values.SEARCH_API_KEY!,
          },
  };
}
