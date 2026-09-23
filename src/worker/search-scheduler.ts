import { config } from "dotenv";

import { executeDueSearches } from "@/application/search/search-schedule-service";
import { disconnectPrismaClient } from "@/infrastructure/database/prisma";
import { getSearchProvider } from "@/infrastructure/providers/search-provider-factory";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const pollIntervalMs = 60_000;

async function main() {
  const provider = getSearchProvider();
  if (!provider) throw new Error("search_provider_disabled");
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const result = await executeDueSearches(provider);
      if (result.due)
        console.log(JSON.stringify({ status: "scheduler_tick", ...result }));
    } catch {
      console.error(
        JSON.stringify({ status: "failed", reason: "scheduler_tick_failed" }),
      );
    } finally {
      running = false;
    }
  };

  await tick();
  await new Promise<void>((resolve) => {
    const interval = setInterval(() => void tick(), pollIntervalMs);
    const stop = () => {
      clearInterval(interval);
      resolve();
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}

async function start() {
  try {
    await main();
  } catch (error) {
    console.error(
      JSON.stringify({
        status: "failed",
        reason:
          error instanceof Error && error.message === "search_provider_disabled"
            ? error.message
            : "unexpected_error",
      }),
    );
    process.exitCode = 1;
  } finally {
    await disconnectPrismaClient();
  }
}

void start();
