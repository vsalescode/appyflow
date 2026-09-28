CREATE TYPE "JobFilterDecision" AS ENUM (
  'PENDING',
  'ELIGIBLE',
  'REVIEW',
  'REJECTED'
);

ALTER TABLE "jobs"
ADD COLUMN "filter_decision" "JobFilterDecision" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "filter_rules" JSONB,
ADD COLUMN "filtered_at" TIMESTAMPTZ(3);

UPDATE "jobs"
SET "filter_decision" = 'REVIEW',
    "filtered_at" = NOW()
WHERE EXISTS (
  SELECT 1
  FROM "job_matches"
  WHERE "job_matches"."job_id" = "jobs"."id"
);

CREATE INDEX "jobs_profile_id_filter_decision_idx"
ON "jobs"("profile_id", "filter_decision");
