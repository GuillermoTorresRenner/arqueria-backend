-- Sistema bye clásico: el sorteo completa el cuadro a potencia de 2 con byes
-- en la primera ronda. Se eliminan el repechaje y la minironda de perdedores.

-- Los enfrentamientos de repechaje y minironda dejan de existir
DELETE FROM "matches" WHERE "kind" IN ('REPECHAGE', 'PLAYOFF');

-- AlterEnum
BEGIN;
CREATE TYPE "MatchKind_new" AS ENUM ('REGULAR', 'THIRD_PLACE', 'FINAL');
ALTER TABLE "matches" ALTER COLUMN "kind" DROP DEFAULT;
ALTER TABLE "matches" ALTER COLUMN "kind" TYPE "MatchKind_new" USING ("kind"::text::"MatchKind_new");
ALTER TYPE "MatchKind" RENAME TO "MatchKind_old";
ALTER TYPE "MatchKind_new" RENAME TO "MatchKind";
DROP TYPE "MatchKind_old";
ALTER TABLE "matches" ALTER COLUMN "kind" SET DEFAULT 'REGULAR';
COMMIT;

-- El arquero sin rival pasa a ser un bye más (antes de borrar la columna)
ALTER TABLE "bracket_rounds" ADD COLUMN "byeIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
UPDATE "bracket_rounds" SET "byeIds" = ARRAY["byeId"] WHERE "byeId" IS NOT NULL;
ALTER TABLE "bracket_rounds" DROP COLUMN "byeId";

-- Sorteos guardados: { "bye": 5 } → { "byes": [5] }
UPDATE "draws"
SET "result" = ("result" - 'bye') || jsonb_build_object(
  'byes',
  CASE
    WHEN jsonb_typeof("result" -> 'bye') = 'number'
      THEN jsonb_build_array("result" -> 'bye')
    ELSE '[]'::jsonb
  END
);

-- AlterTable
ALTER TABLE "tournament_categories" DROP COLUMN "playoffArrows";
