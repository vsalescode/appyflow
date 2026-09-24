import { NextResponse } from "next/server";

import { uploadMasterResume } from "@/application/resume/master-resume-service";
import { getUserBySessionToken } from "@/application/auth/auth-service";
import { readSessionCookie } from "@/infrastructure/auth/cookie";
import { createAppUrl, hasTrustedOrigin } from "@/infrastructure/auth/origin";

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) return new Response(null, { status: 403 });
  const user = await getUserBySessionToken(await readSessionCookie());
  if (!user) return new Response(null, { status: 401 });

  try {
    const form = await request.formData();
    const file = form.get("resume");
    if (!(file instanceof File)) throw new Error("missing file");
    await uploadMasterResume(user.id, {
      name: file.name,
      type: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    return NextResponse.redirect(
      createAppUrl("/curriculos?sucesso=1"),
      303,
    );
  } catch {
    return NextResponse.redirect(
      createAppUrl("/curriculos?erro=arquivo"),
      303,
    );
  }
}
