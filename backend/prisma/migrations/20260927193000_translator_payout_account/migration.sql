ALTER TABLE "translator_profiles" ADD COLUMN IF NOT EXISTS "payout_method" TEXT;
ALTER TABLE "translator_profiles" ADD COLUMN IF NOT EXISTS "payout_account_name" TEXT;
ALTER TABLE "translator_profiles" ADD COLUMN IF NOT EXISTS "payout_account_number" TEXT;
