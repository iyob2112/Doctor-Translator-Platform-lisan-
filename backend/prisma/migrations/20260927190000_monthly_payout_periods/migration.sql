ALTER TABLE "withdrawal_requests" ADD COLUMN IF NOT EXISTS "period_key" TEXT;
ALTER TABLE "withdrawal_requests" ADD COLUMN IF NOT EXISTS "period_start" TIMESTAMP(3);
ALTER TABLE "withdrawal_requests" ADD COLUMN IF NOT EXISTS "period_end" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "withdrawal_requests_translator_id_period_key_idx"
  ON "withdrawal_requests"("translator_id", "period_key");
CREATE INDEX IF NOT EXISTS "withdrawal_requests_period_key_idx"
  ON "withdrawal_requests"("period_key");
