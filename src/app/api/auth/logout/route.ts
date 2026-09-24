import { NextResponse } from "next/server";

import { logout } from "@/application/auth/auth-service";
import {
  clearSessionCookie,
  readSessionCookie,
} from "@/infrastructure/auth/cookie";
import { createAppUrl, hasTrustedOrigin } from "@/infrastructure/auth/origin";

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) return new Response(null, { status: 403 });
  await logout(await readSessionCookie());
  await clearSessionCookie();
  return NextResponse.redirect(createAppUrl("/login"), 303);
}
