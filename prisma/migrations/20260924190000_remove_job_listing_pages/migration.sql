DELETE FROM "jobs" AS job
WHERE NOT EXISTS (
  SELECT 1 FROM "applications" AS application
  WHERE application."job_id" = job."id"
)
AND (
  LOWER(job."title") ~ '^[0-9][0-9.,]*\+?[[:space:]]+(jobs|vagas|empregos)[[:space:]]'
  OR LOWER(job."title") ~ '^(vagas|empregos)[[:space:]]+de[[:space:]]'
  OR LOWER(job."title") ~ '(remote[[:space:]]+)?(developer|engineer|development)[[:space:]]+jobs[[:space:]]+in[[:space:]]'
  OR EXISTS (
    SELECT 1
    FROM "job_occurrences" AS occurrence
    WHERE occurrence."job_id" = job."id"
      AND (
        occurrence."canonical_url" ~* 'indeed\.com/q-'
        OR occurrence."canonical_url" ~* 'linkedin\.com/jobs/(search|[^/?]+-jobs)'
        OR occurrence."canonical_url" ~* 'glassdoor\.com\.br/Vaga/'
        OR occurrence."canonical_url" ~* 'portal\.gupy\.io/job-search'
      )
  )
);

UPDATE "sources" AS source
SET "occurrence_count" = (
      SELECT COUNT(*)::INTEGER
      FROM "job_occurrences" AS occurrence
      WHERE occurrence."source_id" = source."id"
    ),
    "unique_job_count" = (
      SELECT COUNT(DISTINCT occurrence."job_id")::INTEGER
      FROM "job_occurrences" AS occurrence
      WHERE occurrence."source_id" = source."id"
    );
