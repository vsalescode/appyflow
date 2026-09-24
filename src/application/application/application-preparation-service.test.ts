import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  draftResumeContentOutputSchema,
  validateFactReferences,
  type DraftResumeContent,
} from "./application-preparation-service";

const experienceId = randomUUID();
const skillId = randomUUID();
const content: DraftResumeContent = {
  language: "PT_BR",
  summary: { text: "Profissional backend.", evidenceFactIds: [experienceId] },
  experiences: [{ factId: experienceId, adaptedText: "Desenvolveu APIs." }],
  projects: [],
  languages: [],
  skills: [{ factId: skillId, adaptedText: "TypeScript" }],
};
const facts = [
  { id: experienceId, type: "EXPERIENCE" as const },
  { id: skillId, type: "SKILL" as const },
];

describe("application preparation", () => {
  it("aceita conteúdo estruturado referenciado por fatos", () => {
    expect(draftResumeContentOutputSchema.parse(content)).toEqual(content);
    expect(() => validateFactReferences(content, facts)).not.toThrow();
  });

  it("rejeita fato inexistente", () => {
    expect(() =>
      validateFactReferences(
        {
          ...content,
          summary: { ...content.summary, evidenceFactIds: [randomUUID()] },
        },
        facts,
      ),
    ).toThrow("sem evidência");
  });

  it("rejeita referência com tipo incompatível", () => {
    expect(() =>
      validateFactReferences(
        { ...content, skills: [{ factId: experienceId, adaptedText: "API" }] },
        facts,
      ),
    ).toThrow("Skill contém referência inválida");
  });
});
