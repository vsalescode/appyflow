CREATE TYPE "SearchRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'PARTIAL_FAILURE', 'FAILED');

CREATE TABLE "search_schedules" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "scheduled_time" CHAR(5) NOT NULL DEFAULT '09:00',
    "time_zone" VARCHAR(100) NOT NULL DEFAULT 'UTC',
    "max_queries" INTEGER NOT NULL DEFAULT 10,
    "results_per_query" INTEGER NOT NULL DEFAULT 10,
    "next_run_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "search_schedules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "search_runs" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "status" "SearchRunStatus" NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "finished_at" TIMESTAMPTZ(3),
    "queries_total" INTEGER NOT NULL DEFAULT 0,
    "queries_succeeded" INTEGER NOT NULL DEFAULT 0,
    "queries_failed" INTEGER NOT NULL DEFAULT 0,
    "results_found" INTEGER NOT NULL DEFAULT 0,
    "results_stored" INTEGER NOT NULL DEFAULT 0,
    "results_rejected" INTEGER NOT NULL DEFAULT 0,
    "jobs_matched" INTEGER NOT NULL DEFAULT 0,
    "jobs_skipped" INTEGER NOT NULL DEFAULT 0,
    "failures" JSONB,
    CONSTRAINT "search_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "search_schedules_profile_id_key" ON "search_schedules"("profile_id");
CREATE INDEX "search_schedules_enabled_next_run_at_idx" ON "search_schedules"("enabled", "next_run_at");
CREATE INDEX "search_runs_profile_id_started_at_idx" ON "search_runs"("profile_id", "started_at");
CREATE INDEX "search_runs_status_started_at_idx" ON "search_runs"("status", "started_at");

ALTER TABLE "search_schedules" ADD CONSTRAINT "search_schedules_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "search_runs" ADD CONSTRAINT "search_runs_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
