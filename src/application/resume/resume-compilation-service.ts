import {
  createResumePdfFileName,
  parseResumeContent,
} from "@/domain/resume/resume-content";
import { compileLatexToPdf } from "@/infrastructure/resume/latex-pdf-compiler";
import {
  renderResumeLatex,
  type ResumeRenderingRequest,
} from "@/infrastructure/resume/resume-renderer";

interface ResumeCompilationDependencies {
  compilePdf: (latex: string) => Promise<Uint8Array>;
}

const defaultDependencies: ResumeCompilationDependencies = {
  compilePdf: compileLatexToPdf,
};

export async function compileResumeArtifacts(
  request: ResumeRenderingRequest,
  dependencies: ResumeCompilationDependencies = defaultDependencies,
) {
  const rendered = renderResumeTexArtifact(request);
  const pdf = await dependencies.compilePdf(
    new TextDecoder().decode(rendered.tex.bytes),
  );

  return {
    ...rendered,
    pdf: {
      fileName: rendered.tex.fileName.replace(/\.tex$/i, ".pdf"),
      mediaType: "application/pdf",
      bytes: pdf,
    },
  };
}

export function renderResumeTexArtifact(request: ResumeRenderingRequest) {
  const content = parseResumeContent(request.content);
  const rendered = renderResumeLatex({ ...request, content });
  const pdfFileName = createResumePdfFileName(content.personalInfo.fullName);

  return {
    language: rendered.language,
    templatePath: rendered.templatePath,
    tex: {
      fileName: pdfFileName.replace(/\.pdf$/i, ".tex"),
      mediaType: "application/x-tex",
      bytes: new TextEncoder().encode(rendered.latex),
    },
  };
}
