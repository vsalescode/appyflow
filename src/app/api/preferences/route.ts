import { NextResponse } from "next/server";

import { getUserBySessionToken } from "@/application/auth/auth-service";
import { savePreference } from "@/application/preferences/preference-service";
import { readSessionCookie } from "@/infrastructure/auth/cookie";
import { createAppUrl, hasTrustedOrigin } from "@/infrastructure/auth/origin";

const lines = (value: FormDataEntryValue | null) =>
  typeof value === "string"
    ? value
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) return new Response(null, { status: 403 });
  const user = await getUserBySessionToken(await readSessionCookie());
  if (!user) return new Response(null, { status: 401 });
  try {
    const form = await request.formData();
    const salaryMinimum = form.get("salaryMinimum")?.toString().trim();
    const salaryCurrency = form.get("salaryCurrency")?.toString().trim();
    await savePreference(user.id, {
      desiredRoles: lines(form.get("desiredRoles")),
      seniorities: form.getAll("seniorities").map(String),
      workModes: form.getAll("workModes").map(String),
      locations: lines(form.get("locations")),
      languages: lines(form.get("languages")),
      technologies: lines(form.get("technologies")),
      salaryMinimum: salaryMinimum || undefined,
      salaryCurrency: salaryCurrency || undefined,
      excludedCompanies: lines(form.get("excludedCompanies")),
      excludedKeywords: lines(form.get("excludedKeywords")),
    });
    return NextResponse.redirect(
      createAppUrl("/preferencias?sucesso=preferencias"),
      303,
    );
  } catch {
    return NextResponse.redirect(
      createAppUrl("/preferencias?erro=preferencias"),
      303,
    );
  }
}
