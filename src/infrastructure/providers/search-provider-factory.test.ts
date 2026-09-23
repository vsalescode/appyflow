import { describe, expect, it } from "vitest";

import { getSearchProvider } from "./search-provider-factory";

describe("getSearchProvider", () => {
  it("retorna null quando a busca está desabilitada", () => {
    expect(getSearchProvider({})).toBeNull();
  });

  it("cria o adapter do Serper", () => {
    expect(
      getSearchProvider({
        SEARCH_PROVIDER: "serper",
        SEARCH_API_KEY: "secret",
      })?.name,
    ).toBe("serper");
  });

  it("cria o adapter da SerpApi", () => {
    expect(
      getSearchProvider({
        SEARCH_PROVIDER: "serpapi",
        SEARCH_API_KEY: "secret",
      })?.name,
    ).toBe("serpapi");
  });
});
