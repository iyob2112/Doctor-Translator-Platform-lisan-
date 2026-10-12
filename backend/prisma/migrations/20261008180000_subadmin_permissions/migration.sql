-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'subadmin';

-- AlterTable
ALTER TABLE "users" ADD COLUMN "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
