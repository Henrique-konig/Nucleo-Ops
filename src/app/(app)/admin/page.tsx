import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";

export default async function AdminIndex() {
  const user = await requireUser("automation:configure");
  redirect(can(user.role, "user:manage") ? "/admin/usuarios" : "/admin/automacoes");
}
