-- Vários quadros, filtros salvos e agentes personalizados.

-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED');

-- AlterTable
ALTER TABLE "Board" ADD COLUMN     "color" TEXT NOT NULL DEFAULT 'brand',
ADD COLUMN     "description" TEXT,
ADD COLUMN     "intake" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Card" ADD COLUMN     "agentId" TEXT;

-- CreateTable
CREATE TABLE "SavedFilter" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL DEFAULT '{}',
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedFilter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomAgent" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'violet',
    "runOnAssign" BOOLEAN NOT NULL DEFAULT true,
    "useKnowledge" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomAgent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomAgentRun" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'QUEUED',
    "prompt" TEXT,
    "output" TEXT,
    "error" TEXT,
    "requestedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "CustomAgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedFilter_boardId_userId_idx" ON "SavedFilter"("boardId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomAgent_teamId_name_key" ON "CustomAgent"("teamId", "name");

-- CreateIndex
CREATE INDEX "CustomAgentRun_cardId_createdAt_idx" ON "CustomAgentRun"("cardId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomAgentRun_agentId_createdAt_idx" ON "CustomAgentRun"("agentId", "createdAt");

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "CustomAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedFilter" ADD CONSTRAINT "SavedFilter_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedFilter" ADD CONSTRAINT "SavedFilter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomAgent" ADD CONSTRAINT "CustomAgent_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomAgentRun" ADD CONSTRAINT "CustomAgentRun_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "CustomAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomAgentRun" ADD CONSTRAINT "CustomAgentRun_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomAgentRun" ADD CONSTRAINT "CustomAgentRun_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Tempo real: o resultado de um agente aparece no quadro assim que fica pronto.
CREATE FUNCTION plantao_notify_agent_run() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  board_id text;
BEGIN
  SELECT "boardId" INTO board_id FROM "Card" WHERE "id" = COALESCE(NEW."cardId", OLD."cardId");
  IF board_id IS NOT NULL THEN
    PERFORM pg_notify('plantao_board', board_id);
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER "CustomAgentRun_notify_board"
  AFTER INSERT OR UPDATE ON "CustomAgentRun"
  FOR EACH ROW EXECUTE FUNCTION plantao_notify_agent_run();

-- CreateIndex
CREATE INDEX "Card_agentId_idx" ON "Card"("agentId");
