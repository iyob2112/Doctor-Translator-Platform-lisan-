-- AlterTable
ALTER TABLE "sessions" ADD COLUMN "attending_name" TEXT;

-- Doctor accounts are no longer used; the hospital login runs the exam room.
UPDATE "users" SET "is_active" = false WHERE "role" = 'doctor';
