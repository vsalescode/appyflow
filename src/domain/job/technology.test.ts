import { describe, expect, it } from "vitest";

import {
  confirmedKnownTechnologies,
  findKnownTechnologies,
} from "./technology";

describe("job technologies", () => {
  it("identifica tecnologias explÃ­citas sem confundir Java com JavaScript", () => {
    expect(
      findKnownTechnologies("Desenvolvedor .NET + Chatbot Blip com JavaScript"),
    ).toEqual([".NET", "Blip", "JavaScript"]);
  });

  it("normaliza aliases confirmados do perfil", () => {
    expect(
      confirmedKnownTechnologies(["JUnit 5", "NodeJS", "Soft skill"]),
    ).toEqual(["JUnit", "Node.js"]);
  });
});
