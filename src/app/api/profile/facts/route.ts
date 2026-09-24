import { NextResponse } from "next/server";

import { addProfessionalFact } from "@/application/profile/profile-service";
import { getUserBySessionToken } from "@/application/auth/auth-service";
import { readSessionCookie } from "@/infrastructure/auth/cookie";
import { createAppUrl, hasTrustedOrigin } from "@/infrastructure/auth/origin";

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) return new Response(null, { status: 403 });
  const user = await getUserBySessionToken(await readSessionCookie());
  if (!user) return new Response(null, { status: 401 });
  try {
    await addProfessionalFact(
      user.id,
      Object.fromEntries(await request.formData()),
    );
    return NextResponse.redirect(
      createAppUrl("/perfil?sucesso=fato#fatos-profissionais"),
      303,
    );
  } catch {
    return NextResponse.redirect(
      createAppUrl("/perfil?erro=fato#fatos-profissionais"),
      303,
    );
  }
}
