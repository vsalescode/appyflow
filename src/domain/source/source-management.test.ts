import { describe, expect, it } from "vitest";

import { parseSourceManagementStatus } from "./source-management";

describe("source management", () => {
  it("aceita somente estados conhecidos", () => {
    expect(parseSourceManagementStatus("PRIORITIZED")).toBe("PRIORITIZED");
    expect(parseSourceManagementStatus("BLOCKED")).toBe("BLOCKED");
    expect(() => parseSourceManagementStatus("TRUSTED")).toThrow();
  });
});
