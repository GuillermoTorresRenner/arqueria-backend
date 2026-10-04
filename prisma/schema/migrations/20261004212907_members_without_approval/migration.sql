-- AlterTable
ALTER TABLE "members" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

-- Los socios ya no requieren aprobación: los que esperaban pasan a activos.
UPDATE "members" SET "status" = 'ACTIVE' WHERE "status" = 'PENDING';
