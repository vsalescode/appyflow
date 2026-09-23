import { config } from "dotenv";

import { runSearchWorker } from "@/application/search/search-worker-service";
import { disconnectPrismaClient } from "@/infrastructure/database/prisma";
import { getSearchProvider } from "@/infrastructure/providers/search-provider-factory";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

async function main() {
  const provider = getSearchProvider();
  if (!provider) {
    console.error(
      JSON.stringify({
        status: "failed",
        reason: "search_provider_disabled",
      }),
    );
    process.exitCode = 1;
    return;
  }

  const summary = await runSearchWorker(provider);
  console.log(
    JSON.stringify({
      status: summary.failures.length ? "partial_failure" : "completed",
      ...summary,
    }),
  );
  if (summary.failures.length) process.exitCode = 1;
}

async function start() {
  try {
    await main();
  } catch {
    console.error(
      JSON.stringify({ status: "failed", reason: "unexpected_error" }),
    );
    process.exitCode = 1;
  } finally {
    await disconnectPrismaClient();
  }
}

void start().catch(() => {
  console.error(JSON.stringify({ status: "failed", reason: "shutdown_error" }));
  process.exitCode = 1;
});
