CREATE TABLE "resume_versions" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "language" "ResumeLanguage" NOT NULL,
    "content" JSONB NOT NULL,
    "template_key" VARCHAR(80) NOT NULL,
    "template_checksum" CHAR(64) NOT NULL,
    "tex_storage_key" VARCHAR(255) NOT NULL,
    "tex_file_name" VARCHAR(255) NOT NULL,
    "pdf_storage_key" VARCHAR(255) NOT NULL,
    "pdf_file_name" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resume_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "resume_versions_tex_storage_key_key" ON "resume_versions"("tex_storage_key");
CREATE UNIQUE INDEX "resume_versions_pdf_storage_key_key" ON "resume_versions"("pdf_storage_key");
CREATE INDEX "resume_versions_application_id_created_at_idx" ON "resume_versions"("application_id", "created_at");

ALTER TABLE "resume_versions"
ADD CONSTRAINT "resume_versions_application_id_fkey"
FOREIGN KEY ("application_id") REFERENCES "applications"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
