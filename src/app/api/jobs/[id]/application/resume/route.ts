import { getUserBySessionToken } from "@/application/auth/auth-service";
import { createResumeVersion } from "@/application/resume/resume-version-service";
import { readSessionCookie } from "@/infrastructure/auth/cookie";
import { hasTrustedOrigin } from "@/infrastructure/auth/origin";
import { LatexCompilationError } from "@/infrastructure/resume/latex-pdf-compiler";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!hasTrustedOrigin(request)) return new Response(null, { status: 403 });
  const user = await getUserBySessionToken(await readSessionCookie());
  if (!user) return new Response(null, { status: 401 });

  try {
    const body = (await request.json()) as {
      content?: unknown;
      languageOverride?: unknown;
    };
    const version = await createResumeVersion(
      user.id,
      (await params).id,
      body.content,
      typeof body.languageOverride === "string"
        ? body.languageOverride
        : undefined,
    );
    return Response.json(
      {
        id: version.id,
        language: version.language,
        createdAt: version.createdAt,
        downloads: {
          tex: `/api/resume-versions/${version.id}/download?format=tex`,
          pdf: `/api/resume-versions/${version.id}/download?format=pdf`,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof LatexCompilationError
            ? error.message
            : "Não foi possível registrar a versão do currículo.",
      },
      { status: 422 },
    );
  }
}
