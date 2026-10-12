-- AlterEnum
CREATE TYPE "SessionPriority" AS ENUM ('routine', 'stat');

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "priority" "SessionPriority" NOT NULL DEFAULT 'routine';
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "page_attempt" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "unmatched_at" TIMESTAMP(3);
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "unmatched_reason" TEXT;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "unmatched_ack_at" TIMESTAMP(3);
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "unmatched_ack_by_id" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");
CREATE INDEX IF NOT EXISTS "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

ALTER TABLE "password_reset_tokens" DROP CONSTRAINT IF EXISTS "password_reset_tokens_user_id_fkey";
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sessions" DROP CONSTRAINT IF EXISTS "sessions_unmatched_ack_by_id_fkey";
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_unmatched_ack_by_id_fkey" FOREIGN KEY ("unmatched_ack_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
