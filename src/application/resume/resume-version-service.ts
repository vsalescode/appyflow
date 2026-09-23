import { randomUUID } from "node:crypto";

import { Prisma } from "@/generated/prisma/client";

import type { ArtifactStorage } from "@/application/storage/artifact-storage";
import { parseResumeContent } from "@/domain/resume/resume-content";
import { getPrismaClient } from "@/infrastructure/database/prisma";
import { getArtifactStorage } from "@/infrastructure/storage";

import { compileResumeArtifacts } from "./resume-compilation-service";

interface ResumeVersionDependencies {
  storage: ArtifactStorage;
  compile: typeof compileResumeArtifacts;
  createId: () => string;
  clock: () => Date;
}

function defaultDependencies(): ResumeVersionDependencies {
  return {
    storage: getArtifactStorage(),
    compile: compileResumeArtifacts,
    createId: randomUUID,
    clock: () => new Date(),
  };
}

export async function createResumeVersion(
  userId: string,
  jobId: string,
  value: unknown,
  languageOverride?: string | null,
  dependencies: ResumeVersionDependencies = defaultDependencies(),
) {
  const prisma = getPrismaClient();
  const job = await prisma.job.findFirst({
    where: { id: jobId, profile: { userId } },
    include: {
      application: true,
      profile: { include: { preference: true } },
    },
  });
  if (!job) throw new Error("Vaga não encontrada.");
  if (!job.application) throw new Error("Candidatura não encontrada.");

  const content = parseResumeContent(value);
  const artifacts = await dependencies.compile({
    content,
    vacancyText: `${job.title} ${job.description ?? ""}`,
    languageOverride,
    preferredLanguages: job.profile.preference?.languages ?? [],
  });
  const id = dependencies.createId();
  const texStorageKey = `${id}.tex`;
  const pdfStorageKey = `${id}.pdf`;
  const storedKeys: string[] = [];

  try {
    await dependencies.storage.write(texStorageKey, artifacts.tex.bytes);
    storedKeys.push(texStorageKey);
    await dependencies.storage.write(pdfStorageKey, artifacts.pdf.bytes);
    storedKeys.push(pdfStorageKey);
    return await prisma.resumeVersion.create({
      data: {
        id,
        applicationId: job.application.id,
        language: artifacts.language,
        content: JSON.parse(JSON.stringify(content)) as Prisma.InputJsonValue,
        templateKey: artifacts.templateKey,
        templateChecksum: artifacts.templateChecksum,
        texStorageKey,
        texFileName: artifacts.tex.fileName,
        pdfStorageKey,
        pdfFileName: artifacts.pdf.fileName,
        createdAt: dependencies.clock(),
      },
    });
  } catch (error) {
    await cleanupArtifacts(dependencies.storage, storedKeys);
    throw error;
  }
}

export function listResumeVersions(userId: string) {
  return getPrismaClient().resumeVersion.findMany({
    where: { application: { job: { profile: { userId } } } },
    include: { application: { include: { job: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function readResumeVersionArtifact(
  userId: string,
  versionId: string,
  format: "tex" | "pdf",
  storage: ArtifactStorage = getArtifactStorage(),
) {
  const version = await getPrismaClient().resumeVersion.findFirst({
    where: {
      id: versionId,
      application: { job: { profile: { userId } } },
    },
  });
  if (!version) return null;
  const isTex = format === "tex";
  return {
    fileName: isTex ? version.texFileName : version.pdfFileName,
    mediaType: isTex ? "application/x-tex" : "application/pdf",
    bytes: await storage.read(
      isTex ? version.texStorageKey : version.pdfStorageKey,
    ),
  };
}

async function cleanupArtifacts(storage: ArtifactStorage, keys: string[]) {
  await Promise.allSettled(keys.map((key) => storage.remove(key)));
}
