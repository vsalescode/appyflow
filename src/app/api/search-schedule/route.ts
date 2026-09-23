import { NextResponse } from "next/server";

import { getUserBySessionToken } from "@/application/auth/auth-service";
import { saveSearchSchedule } from "@/application/search/search-schedule-service";
import { readSessionCookie } from "@/infrastructure/auth/cookie";
import { hasTrustedOrigin } from "@/infrastructure/auth/origin";

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) return new Response(null, { status: 403 });
  const user = await getUserBySessionToken(await readSessionCookie());
  if (!user) return new Response(null, { status: 401 });

  try {
    const form = await request.formData();
    await saveSearchSchedule(user.id, {
      enabled: form.get("enabled") === "on",
      scheduledTime: form.get("scheduledTime"),
      timeZone: form.get("timeZone"),
      maxQueries: form.get("maxQueries"),
      resultsPerQuery: form.get("resultsPerQuery"),
    });
    return NextResponse.redirect(
      new URL("/preferencias?sucesso=agendamento", request.url),
      303,
    );
  } catch {
    return NextResponse.redirect(
      new URL("/preferencias?erro=agendamento", request.url),
      303,
    );
  }
}
