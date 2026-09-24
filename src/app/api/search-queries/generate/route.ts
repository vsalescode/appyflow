import { NextResponse } from "next/server";

import { getUserBySessionToken } from "@/application/auth/auth-service";
import {
  generateAIQueries,
  generateDeterministicQueries,
} from "@/application/search/query-generator";
import { readSessionCookie } from "@/infrastructure/auth/cookie";
import { createAppUrl, hasTrustedOrigin } from "@/infrastructure/auth/origin";
import { getAIProvider } from "@/infrastructure/providers/ai-provider-factory";

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) return new Response(null, { status: 403 });
  const user = await getUserBySessionToken(await readSessionCookie());
  if (!user) return new Response(null, { status: 401 });

  try {
    const form = await request.formData();
    const mode = form.get("mode");
    if (mode === "deterministic") await generateDeterministicQueries(user.id);
    else if (mode === "ai") {
      const provider = getAIProvider();
      if (!provider) throw new Error("AI provider is disabled");
      await generateAIQueries(user.id, provider);
    } else throw new Error("Invalid generation mode");
    return NextResponse.redirect(
      createAppUrl("/queries?sucesso=1"),
      303,
    );
  } catch {
    return NextResponse.redirect(createAppUrl("/queries?erro=1"), 303);
  }
}
