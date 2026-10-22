import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";

export default async function Home() {
  const user = await requireUser();
  if (!can(user.role, "board:view")) redirect("/solicitante");
  const board = await db.board.findFirst({ where: { teamId: user.teamId }, orderBy: { createdAt: "asc" }, select: { id: true } });
  redirect(board ? `/boards/${board.id}` : "/boards");
}
