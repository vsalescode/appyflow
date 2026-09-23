import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { parseServerEnv } from "@/server/config/env";

const databaseProbeTimeoutMs = 3_000;

type PrismaGlobal = typeof globalThis & {
  appyflowPrisma?: PrismaClient;
};

const prismaGlobal = globalThis as PrismaGlobal;

export function createPrismaClient(databaseUrl: string): PrismaClient {
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  return new PrismaClient({ adapter });
}

export function getPrismaClient(): PrismaClient {
  if (!prismaGlobal.appyflowPrisma) {
    const environment = parseServerEnv(process.env);
    prismaGlobal.appyflowPrisma = createPrismaClient(environment.DATABASE_URL);
  }

  return prismaGlobal.appyflowPrisma;
}

export async function disconnectPrismaClient(): Promise<void> {
  if (!prismaGlobal.appyflowPrisma) return;
  await prismaGlobal.appyflowPrisma.$disconnect();
  prismaGlobal.appyflowPrisma = undefined;
}

export async function checkDatabaseConnection(): Promise<void> {
  let timeoutId: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error("Database health check timed out"));
    }, databaseProbeTimeoutMs);
    timeoutId.unref();
  });

  try {
    await Promise.race([getPrismaClient().$queryRaw`SELECT 1`, timeout]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
