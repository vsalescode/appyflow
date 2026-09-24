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
    const result = await interpretActiveResume(user.id, provider);
    return NextResponse.redirect(
      createAppUrl(
        `/perfil?sucesso=interpretacao&skills=${result.skills}&experiencias=${result.experiences}&projetos=${result.projects}&idiomas=${result.languages}&descartados=${result.discarded}`,
      ),
      303,
    );
  } catch (error) {
    const reason =
      error instanceof Error && error.message.includes("status 429")
        ? "limite-ia"
        : "interpretacao";
    return NextResponse.redirect(createAppUrl(`/perfil?erro=${reason}`), 303);
  }
}
