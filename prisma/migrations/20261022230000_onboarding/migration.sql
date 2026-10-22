-- Introdução do primeiro acesso. Quem já usava o sistema não vê a introdução.
ALTER TABLE "User" ADD COLUMN "onboardedAt" TIMESTAMP(3);
UPDATE "User" SET "onboardedAt" = CURRENT_TIMESTAMP WHERE "createdAt" < CURRENT_TIMESTAMP - INTERVAL '1 day';
