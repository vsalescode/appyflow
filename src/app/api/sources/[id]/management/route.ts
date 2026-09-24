import { NextResponse } from "next/server";

import { getUserBySessionToken } from "@/application/auth/auth-service";
import { updateSourceManagement } from "@/application/search/source-service";
import { readSessionCookie } from "@/infrastructure/auth/cookie";
import { createAppUrl, hasTrustedOrigin } from "@/infrastructure/auth/origin";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!hasTrustedOrigin(request)) return new Response(null, { status: 403 });
  const user = await getUserBySessionToken(await readSessionCookie());
  if (!user) return new Response(null, { status: 401 });

  try {
    const status = (await request.formData()).get("status");
    await updateSourceManagement(user.id, (await params).id, status);
    return NextResponse.redirect(
      createAppUrl("/fontes?sucesso=gestao"),
      303,
    );
  } catch {
    return NextResponse.redirect(
      createAppUrl("/fontes?erro=gestao"),
      303,
    );
  }
}
