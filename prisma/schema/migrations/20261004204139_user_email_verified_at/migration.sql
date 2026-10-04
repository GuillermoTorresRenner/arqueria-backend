-- AlterTable
ALTER TABLE "users" ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3);

-- Las cuentas ya confirmadas no tenían fecha: se toma la última
-- actualización como aproximación, para no dejarlas con NULL.
UPDATE "users" SET "emailVerifiedAt" = "updatedAt" WHERE "emailVerified" = true;
