-- CreateEnum
CREATE TYPE "BlockType" AS ENUM ('HERO', 'RICH_TEXT', 'GALLERY', 'CARDS', 'CTA', 'FAQ');

-- CreateEnum
CREATE TYPE "LogLevel" AS ENUM ('INFO', 'WARN', 'ERROR');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "CategoryKind" AS ENUM ('DIVISION', 'AGE', 'GENDER');

-- CreateEnum
CREATE TYPE "ScoreStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'VALIDATED');

-- CreateEnum
CREATE TYPE "TournamentStatus" AS ENUM ('DRAFT', 'REGISTRATION_OPEN', 'IN_PROGRESS', 'FINISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'JUDGE', 'MEMBER');

-- CreateTable
CREATE TABLE "sections" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocks" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "type" "BlockType" NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logs" (
    "id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "description" TEXT,
    "action" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "userId" TEXT,
    "level" "LogLevel" NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "members" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "memberNumber" SERIAL NOT NULL,
    "documentId" TEXT,
    "birthDate" TIMESTAMP(3),
    "phone" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "MemberStatus" NOT NULL DEFAULT 'PENDING',
    "membershipEnd" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "kind" "CategoryKind" NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "minAge" INTEGER,
    "maxAge" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_categories" (
    "memberId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_categories_pkey" PRIMARY KEY ("memberId","categoryId")
);

-- CreateTable
CREATE TABLE "scores" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "endNumber" INTEGER NOT NULL,
    "arrows" JSONB NOT NULL,
    "total" INTEGER NOT NULL,
    "innerTens" INTEGER NOT NULL DEFAULT 0,
    "tens" INTEGER NOT NULL DEFAULT 0,
    "status" "ScoreStatus" NOT NULL DEFAULT 'DRAFT',
    "recordedById" TEXT NOT NULL,
    "validatedById" TEXT,
    "validatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scoring_formats" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "arrowsPerEnd" INTEGER NOT NULL,
    "endsPerRound" INTEGER NOT NULL,
    "maxPerArrow" INTEGER NOT NULL,
    "zones" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scoring_formats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournaments" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "registrationEnd" TIMESTAMP(3),
    "scoringFormatId" TEXT NOT NULL,
    "status" "TournamentStatus" NOT NULL DEFAULT 'DRAFT',
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "maxParticipants" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tournaments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rounds" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "distance" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_groups" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "judgeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tournament_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_draws" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "seed" TEXT NOT NULL,
    "strategy" TEXT NOT NULL DEFAULT 'RANDOM',
    "result" JSONB NOT NULL,
    "drawnById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_draws_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registrations" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "groupId" TEXT,
    "position" INTEGER,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT,
    "surname" TEXT,
    "lastConnection" TIMESTAMP(3),
    "refreshToken" TEXT,
    "userRoles" "Role" NOT NULL DEFAULT 'MEMBER',
    "avatar" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sections_key_key" ON "sections"("key");

-- CreateIndex
CREATE INDEX "sections_isActive_order_idx" ON "sections"("isActive", "order");

-- CreateIndex
CREATE INDEX "blocks_sectionId_order_idx" ON "blocks"("sectionId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "members_userId_key" ON "members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "members_memberNumber_key" ON "members"("memberNumber");

-- CreateIndex
CREATE UNIQUE INDEX "members_documentId_key" ON "members"("documentId");

-- CreateIndex
CREATE INDEX "members_status_idx" ON "members"("status");

-- CreateIndex
CREATE UNIQUE INDEX "categories_kind_code_key" ON "categories"("kind", "code");

-- CreateIndex
CREATE INDEX "scores_roundId_memberId_idx" ON "scores"("roundId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "scores_roundId_memberId_endNumber_key" ON "scores"("roundId", "memberId", "endNumber");

-- CreateIndex
CREATE UNIQUE INDEX "scoring_formats_name_key" ON "scoring_formats"("name");

-- CreateIndex
CREATE UNIQUE INDEX "tournaments_slug_key" ON "tournaments"("slug");

-- CreateIndex
CREATE INDEX "tournaments_status_startsAt_idx" ON "tournaments"("status", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "rounds_tournamentId_order_key" ON "rounds"("tournamentId", "order");

-- CreateIndex
CREATE INDEX "tournament_groups_judgeId_idx" ON "tournament_groups"("judgeId");

-- CreateIndex
CREATE UNIQUE INDEX "tournament_groups_tournamentId_order_key" ON "tournament_groups"("tournamentId", "order");

-- CreateIndex
CREATE INDEX "group_draws_tournamentId_createdAt_idx" ON "group_draws"("tournamentId", "createdAt");

-- CreateIndex
CREATE INDEX "registrations_groupId_idx" ON "registrations"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "registrations_tournamentId_memberId_key" ON "registrations"("tournamentId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- AddForeignKey
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_categories" ADD CONSTRAINT "member_categories_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_categories" ADD CONSTRAINT "member_categories_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scores" ADD CONSTRAINT "scores_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scores" ADD CONSTRAINT "scores_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scores" ADD CONSTRAINT "scores_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scores" ADD CONSTRAINT "scores_validatedById_fkey" FOREIGN KEY ("validatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_scoringFormatId_fkey" FOREIGN KEY ("scoringFormatId") REFERENCES "scoring_formats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_groups" ADD CONSTRAINT "tournament_groups_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_groups" ADD CONSTRAINT "tournament_groups_judgeId_fkey" FOREIGN KEY ("judgeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_draws" ADD CONSTRAINT "group_draws_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_draws" ADD CONSTRAINT "group_draws_drawnById_fkey" FOREIGN KEY ("drawnById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "tournament_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
