import { redirect } from "next/navigation";
import { ConfigError, missingConfig } from "@/components/config-check";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";

export default async function Home() {
  const missing = missingConfig();
  if (missing.length > 0) return <ConfigError missing={missing} />;
  const user = await requireUser();
  if (!can(user.role, "board:view")) redirect("/solicitante");
  const board = await db.board.findFirst({ where: { teamId: user.teamId }, orderBy: { createdAt: "asc" }, select: { id: true } });
  redirect(board ? `/boards/${board.id}` : "/boards");
}
