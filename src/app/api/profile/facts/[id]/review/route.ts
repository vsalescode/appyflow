import { NextResponse } from "next/server";

import { reviewProfessionalFact } from "@/application/profile/resume-interpretation-service";
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
  const decision = String((await request.formData()).get("decision"));
  if (decision !== "CONFIRMED" && decision !== "REJECTED")
    return new Response(null, { status: 400 });
  await reviewProfessionalFact(user.id, (await params).id, decision);
  return NextResponse.redirect(createAppUrl("/perfil"), 303);
}
