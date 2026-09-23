CREATE TYPE "SourceManagementStatus" AS ENUM ('DEFAULT', 'PRIORITIZED', 'BLOCKED');

ALTER TABLE "sources"
ADD COLUMN "management_status" "SourceManagementStatus" NOT NULL DEFAULT 'DEFAULT',
ADD COLUMN "managed_at" TIMESTAMPTZ(3);

ALTER TABLE "search_runs"
ADD COLUMN "results_blocked" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "sources_management_status_idx" ON "sources"("management_status");
