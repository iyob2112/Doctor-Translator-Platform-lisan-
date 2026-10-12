-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "WithdrawalStatus" AS ENUM ('pending', 'approved', 'paid', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "withdrawal_requests" (
    "id" TEXT NOT NULL,
    "translator_id" TEXT NOT NULL,
    "amount_etb" DECIMAL(12,2) NOT NULL,
    "method" TEXT NOT NULL,
    "account_name" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "note" TEXT,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'pending',
    "review_note" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "withdrawal_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "withdrawal_requests_translator_id_created_at_idx" ON "withdrawal_requests"("translator_id", "created_at");
CREATE INDEX IF NOT EXISTS "withdrawal_requests_status_idx" ON "withdrawal_requests"("status");

ALTER TABLE "withdrawal_requests" DROP CONSTRAINT IF EXISTS "withdrawal_requests_translator_id_fkey";
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_translator_id_fkey" FOREIGN KEY ("translator_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
