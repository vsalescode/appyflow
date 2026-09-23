import { access, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  compileLatexToPdf,
  LatexCompilationError,
  type LatexCommand,
} from "./latex-pdf-compiler";

describe("compilador LaTeX", () => {
  it("compila sem shell escape e remove o diretório temporário", async () => {
    let command: LatexCommand | undefined;
    const runCommand = vi.fn(async (received: LatexCommand) => {
      command = received;
      await expect(access(join(received.cwd, "resume.tex"))).resolves.toBe(
        undefined,
      );
      await writeFile(
        join(received.cwd, "resume.pdf"),
        new TextEncoder().encode("%PDF-1.7\ncompiled"),
      );
    });

    await expect(
      compileLatexToPdf("\\documentclass{article}", runCommand),
    ).resolves.toEqual(new TextEncoder().encode("%PDF-1.7\ncompiled"));

    expect(command?.executable).toBe("pdflatex");
    expect(command?.args).toContain("-no-shell-escape");
    expect(command?.args).toContain("-halt-on-error");
    expect(command?.timeoutMs).toBe(30_000);
    await expect(access(command!.cwd)).rejects.toThrow();
  });

  it("converte falhas do processo em erro de domínio e limpa os arquivos", async () => {
    let directory = "";
    await expect(
      compileLatexToPdf("inválido", async (received) => {
        directory = received.cwd;
        throw new Error("process output must not escape");
      }),
    ).rejects.toEqual(
      new LatexCompilationError(
        "Não foi possível compilar o currículo em PDF.",
      ),
    );
    await expect(access(directory)).rejects.toThrow();
  });

  it("rejeita saída que não seja PDF", async () => {
    await expect(
      compileLatexToPdf("conteúdo", async (received) => {
        await writeFile(join(received.cwd, "resume.pdf"), "not a PDF");
      }),
    ).rejects.toThrow("O compilador não produziu um PDF válido.");
  });
});
