ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "room_label" TEXT;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "visit_reason" TEXT;
