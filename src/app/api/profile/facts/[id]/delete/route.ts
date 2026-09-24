import { NextResponse } from "next/server";

import { deleteProfessionalFact } from "@/application/profile/profile-service";
import { getUserBySessionToken } from "@/application/auth/auth-service";
import { readSessionCookie } from "@/infrastructure/auth/cookie";
import { createAppUrl, hasTrustedOrigin } from "@/infrastructure/auth/origin";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!hasTrustedOrigin(request)) return new Response(null, { status: 403 });
  const user = await getUserBySessionToken(await readSessionCookie());
  if (!user) return new Response(null, { status: 401 });
  await deleteProfessionalFact(user.id, (await params).id);
  return NextResponse.redirect(createAppUrl("/perfil"), 303);
}
