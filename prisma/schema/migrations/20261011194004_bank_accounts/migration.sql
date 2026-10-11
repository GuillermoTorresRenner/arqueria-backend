-- AlterTable
ALTER TABLE "tournaments" ADD COLUMN     "bankAccountId" TEXT;

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "holderName" TEXT NOT NULL,
    "holderRut" TEXT NOT NULL,
    "holderEmail" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bank_accounts_bankName_accountNumber_key" ON "bank_accounts"("bankName", "accountNumber");

-- CreateIndex
CREATE INDEX "tournaments_bankAccountId_idx" ON "tournaments"("bankAccountId");

-- AddForeignKey
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Datos: las cuentas que ya estaban escritas en cada torneo pasan a
-- bank_accounts (una por banco + número) y el torneo queda enlazado a ella.
-- En paymentInfo quedan solo instrucciones y montos.
INSERT INTO "bank_accounts" ("id", "bankName", "accountType", "accountNumber", "holderName", "holderRut", "holderEmail", "updatedAt")
SELECT DISTINCT ON (bank, number)
    'ba' || substr(md5(random()::text || clock_timestamp()::text), 1, 23),
    bank, coalesce(nullif(trim(p->>'accountType'), ''), 'Sin especificar'), number,
    coalesce(nullif(trim(p->>'holderName'), ''), 'Sin especificar'),
    coalesce(nullif(trim(p->>'holderRut'), ''), 'Sin especificar'),
    nullif(trim(p->>'holderEmail'), ''),
    CURRENT_TIMESTAMP
FROM (
    SELECT "paymentInfo" AS p,
           trim("paymentInfo"->>'bankName') AS bank,
           trim("paymentInfo"->>'accountNumber') AS number,
           "createdAt"
    FROM "tournaments"
    WHERE "paymentInfo" IS NOT NULL
      AND nullif(trim("paymentInfo"->>'bankName'), '') IS NOT NULL
      AND nullif(trim("paymentInfo"->>'accountNumber'), '') IS NOT NULL
) t
ORDER BY bank, number, "createdAt" DESC;

UPDATE "tournaments" t
SET "bankAccountId" = b."id"
FROM "bank_accounts" b
WHERE t."paymentInfo" IS NOT NULL
  AND trim(t."paymentInfo"->>'bankName') = b."bankName"
  AND trim(t."paymentInfo"->>'accountNumber') = b."accountNumber";

UPDATE "tournaments"
SET "paymentInfo" = "paymentInfo" - 'bankName' - 'accountType' - 'accountNumber' - 'holderName' - 'holderRut' - 'holderEmail'
WHERE "paymentInfo" IS NOT NULL;
