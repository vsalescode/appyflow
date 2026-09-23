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
