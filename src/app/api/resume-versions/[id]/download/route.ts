import { getUserBySessionToken } from "@/application/auth/auth-service";
import { readResumeVersionArtifact } from "@/application/resume/resume-version-service";
import { downloadResponse } from "@/app/api/resumes/download-response";
import { readSessionCookie } from "@/infrastructure/auth/cookie";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUserBySessionToken(await readSessionCookie());
  if (!user) return new Response(null, { status: 401 });
  const requestedFormat =
    new URL(request.url).searchParams.get("format") ?? "pdf";
  if (requestedFormat !== "pdf" && requestedFormat !== "tex")
    return new Response(null, { status: 400 });

  const artifact = await readResumeVersionArtifact(
    user.id,
    (await params).id,
    requestedFormat,
  );
  if (!artifact) return new Response(null, { status: 404 });
  return downloadResponse(artifact);
}
