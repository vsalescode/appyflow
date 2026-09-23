import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const compilationTimeoutMs = 30_000;
const maxCompilerOutputBytes = 1024 * 1024;

export class LatexCompilationError extends Error {
  constructor(message = "Não foi possível compilar o currículo em PDF.") {
    super(message);
    this.name = "LatexCompilationError";
  }
}

export interface LatexCommand {
  executable: string;
  args: readonly string[];
  cwd: string;
  timeoutMs: number;
}

type LatexCommandRunner = (command: LatexCommand) => Promise<void>;

const runLatexCommand: LatexCommandRunner = async (command) => {
  await execFileAsync(command.executable, [...command.args], {
    cwd: command.cwd,
    timeout: command.timeoutMs,
    maxBuffer: maxCompilerOutputBytes,
    windowsHide: true,
  });
};

export async function compileLatexToPdf(
  latex: string,
  runCommand: LatexCommandRunner = runLatexCommand,
) {
  if (!latex.trim()) throw new LatexCompilationError("O LaTeX está vazio.");

  const directory = await mkdtemp(join(tmpdir(), "appyflow-latex-"));
  const texPath = join(directory, "resume.tex");
  const pdfPath = join(directory, "resume.pdf");

  try {
    await writeFile(texPath, latex, { encoding: "utf8", mode: 0o600 });
    await runCommand({
      executable: "pdflatex",
      args: [
        "-no-shell-escape",
        "-interaction=nonstopmode",
        "-halt-on-error",
        "-file-line-error",
        `-output-directory=${directory}`,
        texPath,
      ],
      cwd: directory,
      timeoutMs: compilationTimeoutMs,
    });
    const pdf = new Uint8Array(await readFile(pdfPath));
    if (
      pdf.byteLength < 5 ||
      new TextDecoder("ascii").decode(pdf.subarray(0, 5)) !== "%PDF-"
    )
      throw new LatexCompilationError(
        "O compilador não produziu um PDF válido.",
      );
    return pdf;
  } catch (error) {
    if (error instanceof LatexCompilationError) throw error;
    throw new LatexCompilationError();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
