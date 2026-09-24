import { describe, expect, it } from "vitest";

import {
  InvalidProviderConfigurationError,
  parseProviderConfiguration,
} from "./providers";

describe("parseProviderConfiguration", () => {
  it("mantém providers desabilitados por padrão", () => {
    expect(parseProviderConfiguration({})).toEqual({
      ai: { enabled: false },
      search: { enabled: false },
    });
  });

  it("carrega a configuração dos providers habilitados", () => {
    expect(
      parseProviderConfiguration({
        AI_PROVIDER: "openai",
        AI_API_KEY: "ai-secret",
        AI_MODEL: "model-name",
        SEARCH_PROVIDER: "serper",
        SEARCH_API_KEY: "search-secret",
      }),
    ).toEqual({
      ai: {
        enabled: true,
        provider: "openai",
        apiKey: "ai-secret",
        model: "model-name",
      },
      search: {
        enabled: true,
        provider: "serper",
        apiKey: "search-secret",
      },
    });
  });

  it("carrega a configuração da Groq", () => {
    expect(
      parseProviderConfiguration({
        AI_PROVIDER: "groq",
        AI_API_KEY: "groq-secret",
        AI_MODEL: "openai/gpt-oss-20b",
      }).ai,
    ).toEqual({
      enabled: true,
      provider: "groq",
      apiKey: "groq-secret",
      model: "openai/gpt-oss-20b",
    });
  });

  it("exige credenciais somente quando o provider está habilitado", () => {
    expect(() =>
      parseProviderConfiguration({ AI_PROVIDER: "anthropic" }),
    ).toThrow(InvalidProviderConfigurationError);
    expect(() =>
      parseProviderConfiguration({ SEARCH_PROVIDER: "serpapi" }),
    ).toThrow(InvalidProviderConfigurationError);
  });

  it("não inclui secrets nas mensagens de erro", () => {
    const secret = "secret-that-must-not-leak";

    try {
      parseProviderConfiguration({
        AI_PROVIDER: "invalid",
        AI_API_KEY: secret,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidProviderConfigurationError);
      expect((error as Error).message).not.toContain(secret);
    }
  });
});
