import { describe, expect, it } from "vitest";

import { getAIProvider } from "./ai-provider-factory";

describe("getAIProvider", () => {
  it("retorna null quando a IA está desabilitada", () => {
    expect(getAIProvider({})).toBeNull();
  });

  it("cria o adapter da OpenAI", () => {
    expect(
      getAIProvider({
        AI_PROVIDER: "openai",
        AI_API_KEY: "secret",
        AI_MODEL: "gpt-4o-mini",
      })?.name,
    ).toBe("openai");
  });

  it("cria o adapter da Groq", () => {
    expect(
      getAIProvider({
        AI_PROVIDER: "groq",
        AI_API_KEY: "secret",
        AI_MODEL: "openai/gpt-oss-20b",
      })?.name,
    ).toBe("groq");
  });

  it("rejeita providers sem adapter", () => {
    expect(() =>
      getAIProvider({
        AI_PROVIDER: "gemini",
        AI_API_KEY: "secret",
        AI_MODEL: "model-name",
      }),
    ).toThrow("ainda não possui adapter");
  });
});
