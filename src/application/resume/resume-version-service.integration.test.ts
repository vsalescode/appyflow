import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { ArtifactStorage } from "@/application/storage/artifact-storage";
import type { ResumeContent } from "@/domain/resume/resume-content";
import { getPrismaClient } from "@/infrastructure/database/prisma";

import type { compileResumeArtifacts } from "./resume-compilation-service";
import {
  createResumeVersion,
  listResumeVersions,
  readResumeVersionArtifact,
} from "./resume-version-service";

type CompiledResumeArtifacts = Awaited<
  ReturnType<typeof compileResumeArtifacts>
>;

const prisma = getPrismaClient();
const factId = "00000000-0000-4000-8000-000000000001";
const content: ResumeContent = {
  language: "PT_BR",
  personalInfo: { fullName: "Ana Silva", links: [] },
  experiences: [
    {
      factId,
      company: "Empresa",
      role: "Desenvolvedora",
      period: { start: "2024-01", ongoing: true },
      bullets: [{ text: "Criou sistemas.", evidenceFactIds: [factId] }],
    },
  ],
  projects: [],
  skillGroups: [],
  education: [],
  courses: [],
  languages: [],
};

beforeEach(async () => {
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("histórico de versões de currículo", () => {
  it("persiste metadados e permite ler os dois artefatos", async () => {
    const { userId, jobId, applicationId } = await createApplication();
    const storage = new MemoryStorage();
    const id = randomUUID();
    const createdAt = new Date("2026-09-22T12:00:00.000Z");

    const version = await createResumeVersion(userId, jobId, content, "PT_BR", {
      storage,
      compile: vi.fn(async () => compiledArtifacts()),
      createId: () => id,
      clock: () => createdAt,
    });

    expect(version).toMatchObject({
      id,
      applicationId,
      language: "PT_BR",
      templateKey: "pt-br/template.tex",
      templateChecksum: "a".repeat(64),
      texStorageKey: `${id}.tex`,
      pdfStorageKey: `${id}.pdf`,
      createdAt,
    });
    await expect(listResumeVersions(userId)).resolves.toHaveLength(1);
    await expect(
      readResumeVersionArtifact(userId, id, "tex", storage),
    ).resolves.toMatchObject({
      fileName: "CV_ANA_SILVA.tex",
      mediaType: "application/x-tex",
    });
    await expect(
      readResumeVersionArtifact(userId, id, "pdf", storage),
    ).resolves.toMatchObject({
      fileName: "CV_ANA_SILVA.pdf",
      mediaType: "application/pdf",
    });
    await expect(
      readResumeVersionArtifact(randomUUID(), id, "pdf", storage),
    ).resolves.toBeNull();
  });

  it("remove artefatos parciais quando o armazenamento falha", async () => {
    const { userId, jobId } = await createApplication();
    const storage = new FailingPdfStorage();
    const dependencies = {
      storage,
      compile: vi.fn(async () => compiledArtifacts()),
      createId: randomUUID,
      clock: () => new Date(),
    };

    await expect(
      createResumeVersion(userId, jobId, content, "PT_BR", dependencies),
    ).rejects.toThrow();
    expect(storage.keys()).toEqual([]);
  });
});

async function createApplication() {
  const userId = randomUUID();
  const jobId = randomUUID();
  const applicationId = randomUUID();
  await prisma.user.create({
    data: {
      id: userId,
      email: `${randomUUID()}@example.com`,
      passwordHash: "test",
      candidateProfile: {
        create: {
          id: randomUUID(),
          jobs: {
            create: {
              id: jobId,
              fingerprint: randomUUID().replaceAll("-", "").padEnd(64, "a"),
              title: "Desenvolvedor Backend",
              application: {
                create: { id: applicationId, status: "RESUME_PREPARED" },
              },
            },
          },
        },
      },
    },
  });
  return { userId, jobId, applicationId };
}

function compiledArtifacts(): CompiledResumeArtifacts {
  return {
    language: "PT_BR",
    templateKey: "pt-br/template.tex",
    templatePath: "templates/pt-br/template.tex",
    templateChecksum: "a".repeat(64),
    tex: {
      fileName: "CV_ANA_SILVA.tex",
      mediaType: "application/x-tex",
      bytes: new TextEncoder().encode("tex"),
    },
    pdf: {
      fileName: "CV_ANA_SILVA.pdf",
      mediaType: "application/pdf",
      bytes: new TextEncoder().encode("%PDF-test"),
    },
  };
}

class MemoryStorage implements ArtifactStorage {
  protected readonly values = new Map<string, Uint8Array>();

  async write(key: string, bytes: Uint8Array) {
    if (this.values.has(key)) throw new Error("duplicate key");
    this.values.set(key, bytes);
  }

  async read(key: string) {
    const bytes = this.values.get(key);
    if (!bytes) throw new Error("missing artifact");
    return bytes;
  }

  async remove(key: string) {
    this.values.delete(key);
  }

  keys() {
    return [...this.values.keys()];
  }
}

class FailingPdfStorage extends MemoryStorage {
  override async write(key: string, bytes: Uint8Array) {
    if (key.endsWith(".pdf")) throw new Error("storage unavailable");
    await super.write(key, bytes);
  }
}
