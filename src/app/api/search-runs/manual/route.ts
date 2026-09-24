import { NextResponse } from "next/server";

import { getUserBySessionToken } from "@/application/auth/auth-service";
import { executeManualSearch } from "@/application/search/search-schedule-service";
import { readSessionCookie } from "@/infrastructure/auth/cookie";
import { createAppUrl, hasTrustedOrigin } from "@/infrastructure/auth/origin";
import { getSearchProvider } from "@/infrastructure/providers/search-provider-factory";

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) return new Response(null, { status: 403 });
  const user = await getUserBySessionToken(await readSessionCookie());
  if (!user) return new Response(null, { status: 401 });

  try {
    const provider = getSearchProvider();
    if (!provider) throw new Error("Search provider disabled");
    const run = await executeManualSearch(user.id, provider);
    const feedback =
      run.status === "COMPLETED"
        ? "sucesso=busca"
        : run.status === "PARTIAL_FAILURE"
          ? "aviso=busca"
          : "erro=busca";
    return NextResponse.redirect(createAppUrl(`/dashboard?${feedback}`), 303);
  } catch {
    return NextResponse.redirect(createAppUrl("/dashboard?erro=busca"), 303);
  }
}
