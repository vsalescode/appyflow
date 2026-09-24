import { NextResponse } from "next/server";

import { getUserBySessionToken } from "@/application/auth/auth-service";
import { analyzeJobMatchWithAI } from "@/application/search/ai-matching-service";
import { readSessionCookie } from "@/infrastructure/auth/cookie";
import { createAppUrl, hasTrustedOrigin } from "@/infrastructure/auth/origin";
import { getAIProvider } from "@/infrastructure/providers/ai-provider-factory";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!hasTrustedOrigin(request)) return new Response(null, { status: 403 });
  const user = await getUserBySessionToken(await readSessionCookie());
  if (!user) return new Response(null, { status: 401 });
  const jobId = (await params).id;
  try {
    const provider = getAIProvider();
    if (!provider) throw new Error("AI disabled");
    await analyzeJobMatchWithAI(user.id, jobId, provider);
    return NextResponse.redirect(
      createAppUrl(`/vagas/${jobId}?sucesso=analise`),
      303,
    );
  } catch {
    return NextResponse.redirect(
      createAppUrl(`/vagas/${jobId}?erro=analise`),
      303,
    );
  }
}
