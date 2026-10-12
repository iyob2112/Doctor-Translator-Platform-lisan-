-- AlterTable
ALTER TABLE "translator_profiles" ADD COLUMN IF NOT EXISTS "rejection_reason" TEXT;
ALTER TABLE "translator_profiles" ADD COLUMN IF NOT EXISTS "id_document_path" TEXT;
ALTER TABLE "translator_profiles" ADD COLUMN IF NOT EXISTS "license_document_path" TEXT;
ALTER TABLE "translator_profiles" ADD COLUMN IF NOT EXISTS "flagged" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "translator_profiles" ADD COLUMN IF NOT EXISTS "flagged_at" TIMESTAMP(3);
ALTER TABLE "translator_profiles" ADD COLUMN IF NOT EXISTS "flagged_reason" TEXT;
