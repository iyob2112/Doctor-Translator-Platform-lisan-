-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('pending', 'approved', 'rejected');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'hospital_admin';

-- AlterTable
ALTER TABLE "translator_profiles" ADD COLUMN     "approval_status" "ApprovalStatus" NOT NULL DEFAULT 'pending',
ADD COLUMN     "reviewed_at" TIMESTAMP(3);
