-- CreateEnum
CREATE TYPE "ArcheryExperience" AS ENUM ('NONE', 'BEGINNER', 'INTERMEDIATE', 'ADVANCED');

-- AlterTable
ALTER TABLE "members" ADD COLUMN     "experience" "ArcheryExperience",
ADD COLUMN     "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "marketingConsentAt" TIMESTAMP(3);
