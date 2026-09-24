import { NextResponse } from "next/server";

import { prepareApplication } from "@/application/application/application-preparation-service";
import { getUserBySessionToken } from "@/application/auth/auth-service";
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
    const language = String(
      (await request.formData()).get("language") ?? "AUTO",
    );
    await prepareApplication(user.id, jobId, language, provider);
    return NextResponse.redirect(
      createAppUrl(`/vagas/${jobId}?sucesso=preparacao`),
      303,
    );
  } catch {
    return NextResponse.redirect(
      createAppUrl(`/vagas/${jobId}?erro=preparacao`),
      303,
    );
  }
}
