import { basename, dirname } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { ResumeContent } from "@/domain/resume/resume-content";

import { renderResumeLatex, selectResumeTemplate } from "./resume-renderer";

const factId = "00000000-0000-4000-8000-000000000001";
const content: ResumeContent = {
  language: "PT_BR",
  personalInfo: { fullName: "Ana Silva", links: [] },
  experiences: [
    {
      factId,
      company: "Empresa",
      role: "Engenheira de Software",
      period: { start: "2024-01", ongoing: true },
      bullets: [{ text: "Desenvolveu sistemas.", evidenceFactIds: [factId] }],
    },
  ],
  projects: [],
  skillGroups: [],
  education: [],
  courses: [],
  languages: [],
};

const ptBrTemplate = String.raw`\usepackage[brazil]{babel}
\hypersetup{pdftitle={Exemplo},pdfauthor={Exemplo}}
\begin{document}
\begin{center}Exemplo\end{center}
\section{Experiência Profissional}
\section{Projetos em Destaque}
\section{Competências Técnicas}
\section{Formação Acadêmica}
\section{Cursos Complementares}
\section{Idiomas}
\end{document}`;

describe("seleção de idioma e template do currículo", () => {
  it("seleciona automaticamente os templates PT-BR e EN", () => {
    const portuguese = selectResumeTemplate(
      "Vaga para desenvolvimento remoto com experiência",
    );
    const english = selectResumeTemplate(
      "Remote job with development experience and requirements",
    );

    expect(portuguese.language).toBe("PT_BR");
    expect(portuguese.templateKey).toBe("pt-br/template.tex");
    expect(
      dirname(portuguese.templatePath)
        .replaceAll("\\", "/")
        .endsWith("templates/pt-br"),
    ).toBe(true);
    expect(basename(portuguese.templatePath)).toBe("template.tex");
    expect(english.language).toBe("EN");
    expect(english.templateKey).toBe("en/template.tex");
    expect(
      dirname(english.templatePath)
        .replaceAll("\\", "/")
        .endsWith("templates/en"),
    ).toBe(true);
  });

  it("respeita o idioma escolhido manualmente", () => {
    expect(
      selectResumeTemplate(
        "Remote job with development experience and requirements",
        "PT_BR",
      ).language,
    ).toBe("PT_BR");
  });

  it("lê e renderiza somente o template correspondente", () => {
    const readTemplate = vi.fn(() => ptBrTemplate);
    const result = renderResumeLatex(
      {
        content,
        vacancyText: "Remote job with development experience",
        languageOverride: "PT_BR",
      },
      readTemplate,
    );

    expect(readTemplate).toHaveBeenCalledOnce();
    expect(readTemplate).toHaveBeenCalledWith(result.templatePath);
    expect(result.language).toBe("PT_BR");
    expect(result.latex).toContain("Ana Silva");
    expect(result.latex).not.toContain("Exemplo");
  });

  it("rejeita conteúdo incompatível antes de ler o template", () => {
    const readTemplate = vi.fn(() => ptBrTemplate);
    expect(() =>
      renderResumeLatex(
        {
          content,
          vacancyText:
            "Remote job with development experience and requirements",
        },
        readTemplate,
      ),
    ).toThrow("não corresponde ao idioma selecionado EN");
    expect(readTemplate).not.toHaveBeenCalled();
  });
});
