import { z } from "zod";

import type {
  AIGenerationRequest,
  AIGenerationResult,
  AIProvider,
} from "@/application/providers/ai-provider";
import type { ProviderHealth } from "@/application/providers/provider-health";

const completionResponseSchema = z.object({
  id: z.string().min(1),
  model: z.string().min(1),
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string().min(1) }),
      }),
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().int().nonnegative().optional(),
      completion_tokens: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

type Fetch = typeof fetch;

export class GroqProvider implements AIProvider {
  readonly name = "groq";

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly fetchImplementation: Fetch = fetch,
  ) {}

  async generateStructured<Output>(
    request: AIGenerationRequest<Output>,
  ): Promise<AIGenerationResult<Output>> {
    const response = await this.fetchImplementation(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        signal: AbortSignal.timeout(60_000),
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          messages: request.messages,
          max_completion_tokens: request.maxOutputTokens,
          temperature: request.temperature,
          store: false,
          stream: false,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: request.outputSchema.name,
              strict: true,
              schema: request.outputSchema.jsonSchema,
            },
          },
        }),
      },
    );
    if (!response.ok) throw new Error("Groq request failed");

    const parsed = completionResponseSchema.safeParse(await response.json());
    if (!parsed.success) throw new Error("Groq returned an invalid response");
    const content = parsed.data.choices[0]!.message.content;
    let value: unknown;
    try {
      value = JSON.parse(content);
    } catch {
      throw new Error("Groq returned invalid structured output");
    }
    return {
      output: request.outputSchema.parse(value),
      model: parsed.data.model,
      requestId: parsed.data.id,
      usage: {
        inputTokens: parsed.data.usage?.prompt_tokens ?? 0,
        outputTokens: parsed.data.usage?.completion_tokens ?? 0,
      },
    };
  }

  async checkHealth(): Promise<ProviderHealth> {
    try {
      const response = await this.fetchImplementation(
        "https://api.groq.com/openai/v1/models",
        {
          signal: AbortSignal.timeout(5_000),
          headers: { Authorization: `Bearer ${this.apiKey}` },
        },
      );
      return response.ok
        ? { status: "available" }
        : { status: "unavailable", reason: "authentication" };
    } catch {
      return { status: "unavailable", reason: "timeout" };
    }
  }
}
