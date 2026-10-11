-- Torneos de eliminación directa: categorías, participantes con número,
-- inscripción por categoría y cuadro (rondas, sorteos, enfrentamientos).
-- Reemplaza grupos, rondas y series del ranking por suma, que se eliminan.

-- CreateEnum
CREATE TYPE "DrawMethod" AS ENUM ('ALGORITHM', 'MANUAL');

-- CreateEnum
CREATE TYPE "MatchKind" AS ENUM ('REGULAR', 'REPECHAGE', 'PLAYOFF', 'THIRD_PLACE', 'FINAL');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'FINISHED');

-- CreateEnum
CREATE TYPE "ShotPhase" AS ENUM ('REGULAR', 'SHOOT_OFF');

-- CreateEnum
CREATE TYPE "CategoryMode" AS ENUM ('SCORE', 'KNOCKDOWN');


-- ---------- Categorías y participantes ----------

-- CreateTable
CREATE TABLE "tournament_categories" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "mode" "CategoryMode" NOT NULL DEFAULT 'SCORE',
    "scoringFormatId" TEXT,
    "arrowsPerArcher" INTEGER NOT NULL DEFAULT 3,
    "targetsToWin" INTEGER NOT NULL DEFAULT 3,
    "shootOffArrows" INTEGER NOT NULL DEFAULT 1,
    "playoffArrows" INTEGER NOT NULL DEFAULT 1,
    "judgeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tournament_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_participants" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tournament_participants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tournament_categories_judgeId_idx" ON "tournament_categories"("judgeId");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_categories_tournamentId_name_key" ON "tournament_categories"("tournamentId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_participants_tournamentId_memberId_key" ON "tournament_participants"("tournamentId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_participants_tournamentId_number_key" ON "tournament_participants"("tournamentId", "number");

-- AddForeignKey
ALTER TABLE "tournament_categories" ADD CONSTRAINT "tournament_categories_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_categories" ADD CONSTRAINT "tournament_categories_scoringFormatId_fkey" FOREIGN KEY ("scoringFormatId") REFERENCES "scoring_formats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_categories" ADD CONSTRAINT "tournament_categories_judgeId_fkey" FOREIGN KEY ("judgeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_participants" ADD CONSTRAINT "tournament_participants_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_participants" ADD CONSTRAINT "tournament_participants_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Datos: cada torneo existente queda con una categoría «General» de puntaje,
-- con la diana que tenía el torneo.
INSERT INTO "tournament_categories" ("id", "tournamentId", "name", "mode", "scoringFormatId", "updatedAt")
SELECT 'tc' || substr(md5(random()::text || t."id"), 1, 23), t."id", 'General', 'SCORE', t."scoringFormatId", CURRENT_TIMESTAMP
FROM "tournaments" t;

-- Las inscripciones retiradas ya no se conservan (el retiro las borra)
DELETE FROM "registrations" WHERE "status" = 'WITHDRAWN';

-- Un participante por torneo + socio, numerado 1..N por orden de inscripción
INSERT INTO "tournament_participants" ("id", "tournamentId", "memberId", "number", "createdAt")
SELECT 'tp' || substr(md5(random()::text || r."id"), 1, 23), r."tournamentId", r."memberId",
       row_number() OVER (PARTITION BY r."tournamentId" ORDER BY r."createdAt", r."id"),
       r."createdAt"
FROM "registrations" r;

-- ---------- Inscripción por categoría ----------

ALTER TABLE "registrations" DROP CONSTRAINT "registrations_groupId_fkey";

DROP INDEX "registrations_groupId_idx";

DROP INDEX "registrations_tournamentId_memberId_key";

ALTER TABLE "registrations" DROP COLUMN "groupId",
DROP COLUMN "position",
ADD COLUMN     "categoryId" TEXT;

UPDATE "registrations" r
SET "categoryId" = c."id"
FROM "tournament_categories" c
WHERE c."tournamentId" = r."tournamentId";

ALTER TABLE "registrations" ALTER COLUMN "categoryId" SET NOT NULL;

CREATE INDEX "registrations_tournamentId_memberId_idx" ON "registrations"("tournamentId", "memberId");

CREATE UNIQUE INDEX "registrations_categoryId_memberId_key" ON "registrations"("categoryId", "memberId");

ALTER TABLE "registrations" ADD CONSTRAINT "registrations_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "tournament_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "registrations" ADD CONSTRAINT "registrations_tournamentId_memberId_fkey" FOREIGN KEY ("tournamentId", "memberId") REFERENCES "tournament_participants"("tournamentId", "memberId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------- Se elimina el ranking por suma ----------

ALTER TABLE "group_draws" DROP CONSTRAINT "group_draws_drawnById_fkey";
ALTER TABLE "group_draws" DROP CONSTRAINT "group_draws_tournamentId_fkey";
ALTER TABLE "rounds" DROP CONSTRAINT "rounds_tournamentId_fkey";
ALTER TABLE "scores" DROP CONSTRAINT "scores_memberId_fkey";
ALTER TABLE "scores" DROP CONSTRAINT "scores_recordedById_fkey";
ALTER TABLE "scores" DROP CONSTRAINT "scores_roundId_fkey";
ALTER TABLE "scores" DROP CONSTRAINT "scores_validatedById_fkey";
ALTER TABLE "tournament_groups" DROP CONSTRAINT "tournament_groups_judgeId_fkey";
ALTER TABLE "tournament_groups" DROP CONSTRAINT "tournament_groups_tournamentId_fkey";
ALTER TABLE "tournaments" DROP CONSTRAINT "tournaments_scoringFormatId_fkey";

DROP TABLE "group_draws";
DROP TABLE "rounds";
DROP TABLE "scores";
DROP TABLE "tournament_groups";
DROP TYPE "ScoreStatus";

ALTER TABLE "tournaments" DROP COLUMN "scoringFormatId";

-- Las dianas solo definen zonas: las flechas por ronda van en la categoría
ALTER TABLE "scoring_formats" DROP COLUMN "arrowsPerEnd",
DROP COLUMN "endsPerRound",
DROP COLUMN "maxPerArrow";

-- ---------- Cuadro ----------

-- CreateTable
CREATE TABLE "bracket_rounds" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "arrowsPerArcher" INTEGER,
    "targetsToWin" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bracket_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "draws" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "method" "DrawMethod" NOT NULL,
    "seed" TEXT,
    "result" JSONB NOT NULL,
    "drawnById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "draws_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matches" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "kind" "MatchKind" NOT NULL DEFAULT 'REGULAR',
    "order" INTEGER NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'PENDING',
    "winnerId" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_entries" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_shots" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "phase" "ShotPhase" NOT NULL DEFAULT 'REGULAR',
    "sequence" INTEGER NOT NULL,
    "zoneLabel" TEXT,
    "value" INTEGER NOT NULL DEFAULT 0,
    "hit" BOOLEAN,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "match_shots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bracket_rounds_categoryId_number_key" ON "bracket_rounds"("categoryId", "number");

-- CreateIndex
CREATE INDEX "draws_roundId_createdAt_idx" ON "draws"("roundId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "matches_roundId_kind_order_key" ON "matches"("roundId", "kind", "order");

-- CreateIndex
CREATE UNIQUE INDEX "match_entries_matchId_participantId_key" ON "match_entries"("matchId", "participantId");

-- CreateIndex
CREATE UNIQUE INDEX "match_entries_matchId_slot_key" ON "match_entries"("matchId", "slot");

-- CreateIndex
CREATE INDEX "match_shots_matchId_idx" ON "match_shots"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "match_shots_entryId_phase_sequence_key" ON "match_shots"("entryId", "phase", "sequence");

-- AddForeignKey
ALTER TABLE "bracket_rounds" ADD CONSTRAINT "bracket_rounds_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "tournament_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draws" ADD CONSTRAINT "draws_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "bracket_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draws" ADD CONSTRAINT "draws_drawnById_fkey" FOREIGN KEY ("drawnById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "bracket_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_entries" ADD CONSTRAINT "match_entries_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_entries" ADD CONSTRAINT "match_entries_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "tournament_participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_shots" ADD CONSTRAINT "match_shots_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_shots" ADD CONSTRAINT "match_shots_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "match_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_shots" ADD CONSTRAINT "match_shots_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
