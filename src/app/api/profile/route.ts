import { NextResponse } from "next/server";

import { saveCandidateProfile } from "@/application/profile/profile-service";
import { getUserBySessionToken } from "@/application/auth/auth-service";
import { readSessionCookie } from "@/infrastructure/auth/cookie";
import { createAppUrl, hasTrustedOrigin } from "@/infrastructure/auth/origin";

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) return new Response(null, { status: 403 });
  const user = await getUserBySessionToken(await readSessionCookie());
  if (!user) return new Response(null, { status: 401 });
  try {
    const form = await request.formData();
    await saveCandidateProfile(user.id, Object.fromEntries(form));
    return NextResponse.redirect(
      createAppUrl("/perfil?sucesso=perfil"),
      303,
    );
  } catch {
    return NextResponse.redirect(
      createAppUrl("/perfil?erro=perfil"),
      303,
    );
  }
}
