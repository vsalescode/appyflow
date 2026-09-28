ALTER TABLE "search_queries"
ADD COLUMN "last_searched_at" TIMESTAMPTZ(3),
ADD COLUMN "search_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "success_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "total_results" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "search_queries_profile_id_is_active_last_searched_at_idx"
ON "search_queries"("profile_id", "is_active", "last_searched_at");
