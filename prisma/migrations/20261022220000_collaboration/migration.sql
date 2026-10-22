-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('MENTION', 'COMMENT', 'ASSIGNED', 'TICKET_REPLY');

-- CreateTable
CREATE TABLE "CardComment" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "mentionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardAttachment" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "href" TEXT NOT NULL,
    "cardId" TEXT,
    "ticketId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CardComment_cardId_createdAt_idx" ON "CardComment"("cardId", "createdAt");

-- CreateIndex
CREATE INDEX "CardAttachment_cardId_createdAt_idx" ON "CardAttachment"("cardId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- AddForeignKey
ALTER TABLE "CardComment" ADD CONSTRAINT "CardComment_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardComment" ADD CONSTRAINT "CardComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardAttachment" ADD CONSTRAINT "CardAttachment_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardAttachment" ADD CONSTRAINT "CardAttachment_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Comentários e anexos também atualizam o quadro em tempo real (contadores nos cartões).
CREATE OR REPLACE FUNCTION plantao_notify_board() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  board_id text;
BEGIN
  IF TG_TABLE_NAME IN ('ChecklistItem', 'CardComment', 'CardAttachment') THEN
    SELECT "boardId" INTO board_id FROM "Card"
      WHERE "id" = COALESCE(NEW."cardId", OLD."cardId");
  ELSE
    board_id := COALESCE(NEW."boardId", OLD."boardId");
  END IF;
  IF board_id IS NOT NULL THEN
    PERFORM pg_notify('plantao_board', board_id);
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER "CardComment_notify_board"
  AFTER INSERT OR UPDATE OR DELETE ON "CardComment"
  FOR EACH ROW EXECUTE FUNCTION plantao_notify_board();

CREATE TRIGGER "CardAttachment_notify_board"
  AFTER INSERT OR DELETE ON "CardAttachment"
  FOR EACH ROW EXECUTE FUNCTION plantao_notify_board();

-- Notificações: avisa a pessoa (LISTEN plantao_user) a cada notificação nova ou lida.
CREATE FUNCTION plantao_notify_user() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('plantao_user', COALESCE(NEW."userId", OLD."userId"));
  RETURN NULL;
END;
$$;

CREATE TRIGGER "Notification_notify_user"
  AFTER INSERT OR UPDATE ON "Notification"
  FOR EACH ROW EXECUTE FUNCTION plantao_notify_user();
