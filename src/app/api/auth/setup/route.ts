import { NextResponse } from "next/server";

import { configureOwner } from "@/application/auth/auth-service";
import { setSessionCookie } from "@/infrastructure/auth/cookie";
import { createAppUrl, hasTrustedOrigin } from "@/infrastructure/auth/origin";

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) return new Response(null, { status: 403 });
  const form = await request.formData();
  try {
    const session = await configureOwner({
      email: String(form.get("email") ?? ""),
      displayName: String(form.get("displayName") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    await setSessionCookie(session.token, session.expiresAt);
    return NextResponse.redirect(createAppUrl("/dashboard"), 303);
  } catch {
    return NextResponse.redirect(
      createAppUrl("/setup?erro=configuracao"),
      303,
    );
  }
}
