import { describe, expect, it, vi } from "vitest";

import { GroqProvider } from "./groq-provider";

describe("GroqProvider", () => {
  it("usa Chat Completions sem retenção e valida a saída estruturada", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            id: "completion-1",
            model: "openai/gpt-oss-20b",
            choices: [{ message: { content: '{"value":"ok"}' } }],
            usage: { prompt_tokens: 4, completion_tokens: 2 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const provider = new GroqProvider(
      "secret",
      "openai/gpt-oss-20b",
      fetchMock,
    );

    await expect(
      provider.generateStructured({
        messages: [{ role: "user", content: "input" }],
        maxOutputTokens: 100,
        temperature: 0,
        outputSchema: {
          name: "test_output",
          jsonSchema: {
            type: "object",
            properties: { value: { type: "string" } },
            required: ["value"],
            additionalProperties: false,
          },
          parse: (value) => value as { value: string },
        },
      }),
    ).resolves.toEqual({
      output: { value: "ok" },
      model: "openai/gpt-oss-20b",
      requestId: "completion-1",
      usage: { inputTokens: 4, outputTokens: 2 },
    });
    const request = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
    expect(request).toMatchObject({
      model: "openai/gpt-oss-20b",
      store: false,
      stream: false,
      max_completion_tokens: 100,
      temperature: 0,
      response_format: {
        type: "json_schema",
        json_schema: { name: "test_output", strict: true },
      },
    });
    expect(JSON.stringify(request)).not.toContain("secret");
  });

  it("rejeita respostas e conteúdo estruturado inválidos", async () => {
    const invalidResponseFetch = vi.fn<typeof fetch>(async () =>
      Promise.resolve(
        new Response(JSON.stringify({ choices: [] }), { status: 200 }),
      ),
    );
    await expect(
      new GroqProvider(
        "secret",
        "openai/gpt-oss-20b",
        invalidResponseFetch,
      ).generateStructured({
        messages: [{ role: "user", content: "input" }],
        maxOutputTokens: 100,
        outputSchema: {
          name: "test_output",
          jsonSchema: { type: "object" },
          parse: (value) => value,
        },
      }),
    ).rejects.toThrow("invalid response");

    const invalidContentFetch = vi.fn<typeof fetch>(async () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            id: "completion-1",
            model: "openai/gpt-oss-20b",
            choices: [{ message: { content: "not-json" } }],
          }),
          { status: 200 },
        ),
      ),
    );
    await expect(
      new GroqProvider(
        "secret",
        "openai/gpt-oss-20b",
        invalidContentFetch,
      ).generateStructured({
        messages: [{ role: "user", content: "input" }],
        maxOutputTokens: 100,
        outputSchema: {
          name: "test_output",
          jsonSchema: { type: "object" },
          parse: (value) => value,
        },
      }),
    ).rejects.toThrow("invalid structured output");
  });

  it("verifica a disponibilidade sem expor a chave", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] })))
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    const provider = new GroqProvider(
      "super-secret",
      "openai/gpt-oss-20b",
      fetchMock,
    );

    await expect(provider.checkHealth()).resolves.toEqual({
      status: "available",
    });
    await expect(provider.checkHealth()).resolves.toEqual({
      status: "unavailable",
      reason: "authentication",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.groq.com/openai/v1/models",
      expect.objectContaining({
        headers: { Authorization: "Bearer super-secret" },
      }),
    );
  });
});
