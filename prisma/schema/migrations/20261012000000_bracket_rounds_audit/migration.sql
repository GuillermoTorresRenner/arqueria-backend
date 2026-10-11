-- AlterTable
ALTER TABLE "bracket_rounds" ADD COLUMN     "byeId" TEXT,
ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "closedById" TEXT,
ADD COLUMN     "entrants" JSONB NOT NULL DEFAULT '[]';

-- AddForeignKey
ALTER TABLE "bracket_rounds" ADD CONSTRAINT "bracket_rounds_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

