import { NextResponse } from "next/server";

import { updateApplicationStatus } from "@/application/application/application-service";
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
  const jobId = (await params).id;
  try {
    const status = (await request.formData()).get("status");
    await updateApplicationStatus(user.id, jobId, status);
    return NextResponse.redirect(
      createAppUrl(`/vagas/${jobId}?sucesso=pipeline`),
      303,
    );
  } catch {
    return NextResponse.redirect(
      createAppUrl(`/vagas/${jobId}?erro=pipeline`),
      303,
    );
  }
}
