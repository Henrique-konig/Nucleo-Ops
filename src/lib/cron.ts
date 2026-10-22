import "server-only";
import { safeEqual } from "@/lib/channels/signature";

/** Rotas de cron exigem "Authorization: Bearer $CRON_SECRET" (padrão da Vercel). */
export function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return safeEqual(request.headers.get("authorization") ?? "", `Bearer ${secret}`);
}
