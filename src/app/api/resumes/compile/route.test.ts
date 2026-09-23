import { describe, expect, it } from "vitest";

import { downloadResponse } from "./route";

describe("download de currículo compilado", () => {
  it("envia PDF como anexo privado", async () => {
    const response = downloadResponse({
      fileName: "CV_ANA_SILVA.pdf",
      mediaType: "application/pdf",
      bytes: new Uint8Array([1, 2, 3]),
    });

    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="CV_ANA_SILVA.pdf"',
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });
});
