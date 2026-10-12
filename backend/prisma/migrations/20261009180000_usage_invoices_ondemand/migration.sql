-- AlterEnum
ALTER TYPE "PaymentKind" ADD VALUE IF NOT EXISTS 'usage_invoice';

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "UsageInvoiceStatus" AS ENUM ('open', 'issued', 'paid', 'void');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "billing_mode" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "platform_billing_config" (
    "id" TEXT NOT NULL,
    "hourly_rate_etb" DECIMAL(12,2) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_billing_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "usage_invoices" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "period_key" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "status" "UsageInvoiceStatus" NOT NULL DEFAULT 'open',
    "total_minutes" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_etb" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "hourly_rate_etb" DECIMAL(12,2) NOT NULL,
    "issued_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usage_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "usage_lines" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "duration_seconds" INTEGER NOT NULL,
    "minutes" DECIMAL(12,2) NOT NULL,
    "hourly_rate_etb" DECIMAL(12,2) NOT NULL,
    "amount_etb" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_lines_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "invoice_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "usage_invoices_organization_id_period_key_key" ON "usage_invoices"("organization_id", "period_key");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "usage_invoices_status_period_end_idx" ON "usage_invoices"("status", "period_end");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "usage_invoices_organization_id_status_idx" ON "usage_invoices"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "usage_lines_session_id_key" ON "usage_lines"("session_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "usage_lines_invoice_id_idx" ON "usage_lines"("invoice_id");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "usage_invoices" ADD CONSTRAINT "usage_invoices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "usage_lines" ADD CONSTRAINT "usage_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "usage_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "usage_lines" ADD CONSTRAINT "usage_lines_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "usage_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Seed default platform rate (400 ETB/hour) if missing
INSERT INTO "platform_billing_config" ("id", "hourly_rate_etb", "enabled", "updated_at", "created_at")
VALUES ('default', 400, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
