import { describe, expect, it, vi } from "vitest";

import type { ResumeContent } from "@/domain/resume/resume-content";

import {
  compileResumeArtifacts,
  renderResumeTexArtifact,
} from "./resume-compilation-service";

const factId = "00000000-0000-4000-8000-000000000001";
const content: ResumeContent = {
  language: "PT_BR",
  personalInfo: { fullName: "João da Silva", links: [] },
  experiences: [
    {
      factId,
      company: "Empresa",
      role: "Desenvolvedor",
      period: { start: "2023-01", ongoing: true },
      bullets: [{ text: "Criou aplicações.", evidenceFactIds: [factId] }],
    },
  ],
  projects: [],
  skillGroups: [],
  education: [],
  courses: [],
  languages: [],
};

describe("compilação de currículo", () => {
  it("gera os artefatos tex e PDF com o nome padronizado", async () => {
    const pdf = new TextEncoder().encode("%PDF-test");
    const compilePdf = vi.fn(async () => pdf);
    const result = await compileResumeArtifacts(
      {
        content,
        vacancyText: "Vaga para desenvolvimento com experiência",
      },
      { compilePdf },
    );

    expect(result.language).toBe("PT_BR");
    expect(result.templateKey).toBe("pt-br/template.tex");
    expect(result.templateChecksum).toMatch(/^[0-9a-f]{64}$/);
    expect(result.tex.fileName).toBe("CV_JOAO_DA_SILVA.tex");
    expect(result.pdf.fileName).toBe("CV_JOAO_DA_SILVA.pdf");
    expect(result.pdf.bytes).toBe(pdf);
    expect(new TextDecoder().decode(result.tex.bytes)).toContain(
      "João da Silva",
    );
    expect(compilePdf).toHaveBeenCalledOnce();
  });

  it("suporta o template em inglês", async () => {
    const result = await compileResumeArtifacts(
      {
        content: {
          ...content,
          language: "EN",
          personalInfo: { ...content.personalInfo, fullName: "John Smith" },
          experiences: [
            {
              ...content.experiences[0],
              role: "Software Engineer",
              bullets: [
                { text: "Built applications.", evidenceFactIds: [factId] },
              ],
            },
          ],
        },
        vacancyText: "Remote job with development experience and requirements",
      },
      { compilePdf: async () => new TextEncoder().encode("%PDF-test") },
    );

    expect(result.language).toBe("EN");
    expect(result.templatePath.replaceAll("\\", "/")).toContain(
      "/templates/en/template.tex",
    );
    expect(result.pdf.fileName).toBe("CV_JOHN_SMITH.pdf");
  });

  it("gera o arquivo tex sem depender do compilador PDF", () => {
    const result = renderResumeTexArtifact({
      content,
      vacancyText: "Vaga para desenvolvimento com experiência",
    });

    expect(result.tex.fileName).toBe("CV_JOAO_DA_SILVA.tex");
    expect(result.tex.mediaType).toBe("application/x-tex");
  });
});
