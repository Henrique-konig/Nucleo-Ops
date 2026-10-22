-- CreateEnum
CREATE TYPE "DraftStatus" AS ENUM ('PENDING', 'SENT', 'DISCARDED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('PROPOSED', 'APPROVED', 'REJECTED', 'EXECUTED', 'SIMULATED', 'FAILED');

-- CreateEnum
CREATE TYPE "AutomationAction" AS ENUM ('NOTIFY_CHANNEL', 'ASSIGN', 'NOTIFY_REQUESTER');

-- CreateEnum
CREATE TYPE "ReportPeriod" AS ENUM ('DAILY', 'WEEKLY');

-- DropIndex

-- AlterTable
ALTER TABLE "Agent" ADD COLUMN     "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pausedReason" TEXT;

-- AlterTable
ALTER TABLE "Column" ADD COLUMN     "ticketStatus" "TicketStatus";

-- AlterTable
ALTER TABLE "Integration" ADD COLUMN     "name" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "authorEmail" TEXT,
ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "internal" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "aiBudgetAlertMonth" TEXT,
ADD COLUMN     "categories" TEXT[] DEFAULT ARRAY['Acesso', 'Senha', 'Rede', 'Hardware', 'Software', 'E-mail', 'Outros']::TEXT[];

-- AlterTable
-- Chamados existentes ganham um token aleatório; novos recebem o do Prisma.
ALTER TABLE "Ticket" ADD COLUMN     "accessToken" TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text),
ADD COLUMN     "handoffAt" TIMESTAMP(3),
ADD COLUMN     "requesterName" TEXT,
ADD COLUMN     "resolvedByAgent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "satisfaction" INTEGER,
ADD COLUMN     "suggestedAssigneeId" TEXT,
ADD COLUMN     "triagedAt" TIMESTAMP(3),
ADD COLUMN     "triagedByAgent" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "slackUserId" TEXT;

-- CreateTable
CREATE TABLE "ReplyDraft" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "agentId" TEXT,
    "content" TEXT NOT NULL,
    "sources" JSONB NOT NULL DEFAULT '[]',
    "status" "DraftStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReplyDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsage" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "agentId" TEXT,
    "ticketId" TEXT,
    "purpose" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "costMicroUsd" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutionRequest" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "ticketId" TEXT,
    "actionKey" TEXT NOT NULL,
    "params" JSONB NOT NULL DEFAULT '{}',
    "reason" TEXT,
    "status" "ExecutionStatus" NOT NULL DEFAULT 'PROPOSED',
    "dryRun" BOOLEAN NOT NULL DEFAULT true,
    "proposedByAgentId" TEXT,
    "proposedById" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExecutionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRule" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "columnId" TEXT NOT NULL,
    "action" "AutomationAction" NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "period" "ReportPeriod" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "content" TEXT NOT NULL,
    "stats" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardLink" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "state" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReplyDraft_ticketId_status_idx" ON "ReplyDraft"("ticketId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Job_dedupeKey_key" ON "Job"("dedupeKey");

-- CreateIndex
CREATE INDEX "Job_status_runAt_idx" ON "Job"("status", "runAt");

-- CreateIndex
CREATE INDEX "Job_teamId_createdAt_idx" ON "Job"("teamId", "createdAt");

-- CreateIndex
CREATE INDEX "AiUsage_teamId_createdAt_idx" ON "AiUsage"("teamId", "createdAt");

-- CreateIndex
CREATE INDEX "AiUsage_ticketId_idx" ON "AiUsage"("ticketId");

-- CreateIndex
CREATE INDEX "ExecutionRequest_teamId_status_idx" ON "ExecutionRequest"("teamId", "status");

-- CreateIndex
CREATE INDEX "AutomationRule_columnId_idx" ON "AutomationRule"("columnId");

-- CreateIndex
CREATE UNIQUE INDEX "Report_teamId_period_periodStart_key" ON "Report"("teamId", "period", "periodStart");

-- CreateIndex
CREATE INDEX "CardLink_url_idx" ON "CardLink"("url");

-- CreateIndex
CREATE UNIQUE INDEX "CardLink_cardId_url_key" ON "CardLink"("cardId", "url");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_accessToken_key" ON "Ticket"("accessToken");

-- CreateIndex
CREATE UNIQUE INDEX "User_slackUserId_key" ON "User"("slackUserId");

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_suggestedAssigneeId_fkey" FOREIGN KEY ("suggestedAssigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplyDraft" ADD CONSTRAINT "ReplyDraft_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplyDraft" ADD CONSTRAINT "ReplyDraft_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplyDraft" ADD CONSTRAINT "ReplyDraft_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionRequest" ADD CONSTRAINT "ExecutionRequest_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionRequest" ADD CONSTRAINT "ExecutionRequest_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionRequest" ADD CONSTRAINT "ExecutionRequest_proposedByAgentId_fkey" FOREIGN KEY ("proposedByAgentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionRequest" ADD CONSTRAINT "ExecutionRequest_proposedById_fkey" FOREIGN KEY ("proposedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionRequest" ADD CONSTRAINT "ExecutionRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_columnId_fkey" FOREIGN KEY ("columnId") REFERENCES "Column"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardLink" ADD CONSTRAINT "CardLink_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "Ticket" ALTER COLUMN "accessToken" DROP DEFAULT;

-- ---------------------------------------------------------------------------
-- SQL bruto
-- ---------------------------------------------------------------------------

-- Busca por texto completo em português na base de conhecimento, usada quando não
-- há embeddings (sem provedor configurado) e combinada à busca vetorial.
CREATE INDEX "Document_fts_idx" ON "Document"
  USING gin (to_tsvector('portuguese', "title" || ' ' || "content"));

-- Busca de chamados parecidos para o agente de pesquisa.
CREATE INDEX "Ticket_fts_idx" ON "Ticket"
  USING gin (to_tsvector('portuguese', "title" || ' ' || "description"));

-- Satisfação entre 1 e 5.
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_satisfaction_check"
  CHECK ("satisfaction" IS NULL OR "satisfaction" BETWEEN 1 AND 5);

-- Uma execução tem um proponente: agente ou usuário.
ALTER TABLE "ExecutionRequest" ADD CONSTRAINT "ExecutionRequest_single_proposer_check"
  CHECK (num_nonnulls("proposedByAgentId", "proposedById") = 1);
