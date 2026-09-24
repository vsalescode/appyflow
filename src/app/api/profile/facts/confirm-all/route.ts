import { NextResponse } from "next/server";

import { getUserBySessionToken } from "@/application/auth/auth-service";
import { confirmAllPendingProfessionalFacts } from "@/application/profile/resume-interpretation-service";
import { readSessionCookie } from "@/infrastructure/auth/cookie";
import { createAppUrl, hasTrustedOrigin } from "@/infrastructure/auth/origin";

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) return new Response(null, { status: 403 });
  const user = await getUserBySessionToken(await readSessionCookie());
  if (!user) return new Response(null, { status: 401 });

  const result = await confirmAllPendingProfessionalFacts(user.id);
  return NextResponse.redirect(
    createAppUrl(
      `/perfil?sucesso=fatos-confirmados&confirmados=${result.count}#fatos-profissionais`,
    ),
    303,
  );
}
