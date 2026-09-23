import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LocalArtifactStorage } from "./local-artifact-storage";

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "appyflow-storage-test-"));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe("LocalArtifactStorage", () => {
  it("grava, lê e remove um artefato", async () => {
    const storage = new LocalArtifactStorage(directory);
    const bytes = new Uint8Array([1, 2, 3]);
    await storage.write("0199a5f0-cafe-7000-8000-000000000000.pdf", bytes);
    await expect(
      storage.read("0199a5f0-cafe-7000-8000-000000000000.pdf"),
    ).resolves.toEqual(bytes);
    await storage.remove("0199a5f0-cafe-7000-8000-000000000000.pdf");
    await expect(
      storage.read("0199a5f0-cafe-7000-8000-000000000000.pdf"),
    ).rejects.toThrow();
  });

  it("impede navegação para fora do diretório", async () => {
    const storage = new LocalArtifactStorage(directory);
    await expect(
      storage.write("../escape.pdf", new Uint8Array([1])),
    ).rejects.toThrow("Chave de armazenamento inválida.");
  });

  it("armazena artefatos tex", async () => {
    const storage = new LocalArtifactStorage(directory);
    const key = "0199a5f0-cafe-7000-8000-000000000000.tex";
    const bytes = new TextEncoder().encode("\\documentclass{article}");
    await storage.write(key, bytes);
    await expect(storage.read(key)).resolves.toEqual(bytes);
  });
});
