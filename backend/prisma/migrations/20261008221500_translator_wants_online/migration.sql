ALTER TABLE "translator_profiles" ADD COLUMN "wants_online" BOOLEAN NOT NULL DEFAULT false;
UPDATE "translator_profiles" SET "wants_online" = "is_online";
