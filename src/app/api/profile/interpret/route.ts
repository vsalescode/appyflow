import { NextResponse } from "next/server";

import { interpretActiveResume } from "@/application/profile/resume-interpretation-service";
import { getUserBySessionToken } from "@/application/auth/auth-service";
import { readSessionCookie } from "@/infrastructure/auth/cookie";
import { createAppUrl, hasTrustedOrigin } from "@/infrastructure/auth/origin";
import { getAIProvider } from "@/infrastructure/providers/ai-provider-factory";

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) return new Response(null, { status: 403 });
  const user = await getUserBySessionToken(await readSessionCookie());
  if (!user) return new Response(null, { status: 401 });
  try {
    const provider = getAIProvider();
    if (!provider) throw new Error("AI disabled");
    await interpretActiveResume(user.id, provider);
    return NextResponse.redirect(
      createAppUrl("/perfil?sucesso=interpretacao"),
      303,
    );
  } catch {
    return NextResponse.redirect(
      createAppUrl("/perfil?erro=interpretacao"),
      303,
    );
  }
}
