-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "OndemandRateUnit" AS ENUM ('hour', 'minute');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Platform config: rename hourly_rate_etb -> rate_etb, add rate_unit
ALTER TABLE "platform_billing_config" RENAME COLUMN "hourly_rate_etb" TO "rate_etb";
ALTER TABLE "platform_billing_config" ADD COLUMN IF NOT EXISTS "rate_unit" "OndemandRateUnit" NOT NULL DEFAULT 'hour';

-- Usage invoices
ALTER TABLE "usage_invoices" RENAME COLUMN "hourly_rate_etb" TO "rate_etb";
ALTER TABLE "usage_invoices" ADD COLUMN IF NOT EXISTS "rate_unit" "OndemandRateUnit" NOT NULL DEFAULT 'hour';

-- Usage lines
ALTER TABLE "usage_lines" RENAME COLUMN "hourly_rate_etb" TO "rate_etb";
ALTER TABLE "usage_lines" ADD COLUMN IF NOT EXISTS "rate_unit" "OndemandRateUnit" NOT NULL DEFAULT 'hour';
