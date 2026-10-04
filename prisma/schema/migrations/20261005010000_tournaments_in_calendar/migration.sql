-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('ACTIVITY', 'EVENT', 'TOURNAMENT');

-- DropForeignKey
ALTER TABLE "tournaments" DROP CONSTRAINT "tournaments_scoringFormatId_fkey";

-- AlterTable
ALTER TABLE "activities" ADD COLUMN     "tournamentId" TEXT,
ADD COLUMN     "type" "ActivityType" NOT NULL DEFAULT 'ACTIVITY';

-- AlterTable
ALTER TABLE "registrations" ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "confirmedById" TEXT;

-- AlterTable
ALTER TABLE "tournaments" ADD COLUMN     "paymentInfo" JSONB,
ADD COLUMN     "rules" TEXT,
ADD COLUMN     "youtubeUrl" TEXT,
ALTER COLUMN "scoringFormatId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "tournament_judges" (
    "tournamentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_judges_pkey" PRIMARY KEY ("tournamentId","userId")
);

-- CreateTable
CREATE TABLE "tournament_documents" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tournament_judges_userId_idx" ON "tournament_judges"("userId");

-- CreateIndex
CREATE INDEX "tournament_documents_tournamentId_idx" ON "tournament_documents"("tournamentId");

-- CreateIndex
CREATE UNIQUE INDEX "activities_tournamentId_key" ON "activities"("tournamentId");

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_scoringFormatId_fkey" FOREIGN KEY ("scoringFormatId") REFERENCES "scoring_formats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_judges" ADD CONSTRAINT "tournament_judges_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_judges" ADD CONSTRAINT "tournament_judges_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_documents" ADD CONSTRAINT "tournament_documents_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

