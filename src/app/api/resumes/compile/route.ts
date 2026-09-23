import { getUserBySessionToken } from "@/application/auth/auth-service";
import {
  compileResumeArtifacts,
  renderResumeTexArtifact,
} from "@/application/resume/resume-compilation-service";
import { readSessionCookie } from "@/infrastructure/auth/cookie";
import { hasTrustedOrigin } from "@/infrastructure/auth/origin";
import { LatexCompilationError } from "@/infrastructure/resume/latex-pdf-compiler";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) return new Response(null, { status: 403 });
  const user = await getUserBySessionToken(await readSessionCookie());
  if (!user) return new Response(null, { status: 401 });

  try {
    const body = (await request.json()) as {
      content?: unknown;
      vacancyText?: unknown;
      languageOverride?: unknown;
      preferredLanguages?: unknown;
      format?: unknown;
    };
    const compilationRequest = {
      content: body.content,
      vacancyText: typeof body.vacancyText === "string" ? body.vacancyText : "",
      languageOverride:
        typeof body.languageOverride === "string"
          ? body.languageOverride
          : undefined,
      preferredLanguages: Array.isArray(body.preferredLanguages)
        ? body.preferredLanguages.filter(
            (item): item is string => typeof item === "string",
          )
        : undefined,
    };
    const artifact =
      body.format === "tex"
        ? renderResumeTexArtifact(compilationRequest).tex
        : (await compileResumeArtifacts(compilationRequest)).pdf;
    return downloadResponse(artifact);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof LatexCompilationError
            ? error.message
            : "Não foi possível gerar o currículo.",
      },
      { status: 422 },
    );
  }
}

export function downloadResponse(artifact: {
  fileName: string;
  mediaType: string;
  bytes: Uint8Array;
}) {
  const responseBytes = new Uint8Array(artifact.bytes.byteLength);
  responseBytes.set(artifact.bytes);
  return new Response(responseBytes, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${artifact.fileName}"`,
      "Content-Length": String(artifact.bytes.byteLength),
      "Content-Type": artifact.mediaType,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
