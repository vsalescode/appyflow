import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { ArtifactStorage } from "@/application/storage/artifact-storage";

const validStorageKey = /^[0-9a-f-]+\.(?:pdf|tex)$/;

export class LocalArtifactStorage implements ArtifactStorage {
  constructor(private readonly directory: string) {}

  private pathFor(key: string) {
    if (!validStorageKey.test(key))
      throw new Error("Chave de armazenamento inválida.");
    return join(this.directory, key);
  }

  async write(key: string, bytes: Uint8Array) {
    await mkdir(this.directory, { recursive: true });
    await writeFile(this.pathFor(key), bytes, { flag: "wx", mode: 0o600 });
  }

  async read(key: string) {
    return new Uint8Array(await readFile(this.pathFor(key)));
  }

  async remove(key: string) {
    await rm(this.pathFor(key), { force: true });
  }
}
