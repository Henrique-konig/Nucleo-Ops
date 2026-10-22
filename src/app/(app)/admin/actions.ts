"use server";

import { runAction } from "@/lib/action-result";
import * as admin from "@/lib/admin";
import { createAutomation, setAutomationActive } from "@/lib/automations";
import type { IntegrationType } from "@/generated/prisma/enums";

export async function createUserAction(fd: FormData) {
  return runAction((u) => admin.createUser(u, { name: String(fd.get("name") ?? ""), email: String(fd.get("email") ?? ""), role: String(fd.get("role")) as never }), ["/admin/usuarios"]);
}

export async function updateUserAction(userId: string, fd: FormData) {
  return runAction(
    (u) => admin.updateUser(u, userId, { role: String(fd.get("role")) as never, active: fd.get("active") === "on", slackUserId: String(fd.get("slackUserId") ?? "") || null }),
    ["/admin/usuarios"],
  );
}

export async function resetPasswordAction(userId: string) {
  return runAction((u) => admin.resetUserPassword(u, userId), ["/admin/usuarios"]);
}

export async function updateAgentAction(agentId: string, fd: FormData) {
  return runAction(
    (u) =>
      admin.updateAgent(u, agentId, {
        active: fd.get("active") === "on",
        dryRun: fd.get("dryRun") === "on",
        perMinute: Number(fd.get("perMinute")),
        perDay: Number(fd.get("perDay")),
        allowedActions: fd.getAll("allowedActions").map(String),
      }),
    ["/admin/agentes"],
  );
}

export async function stopAgentAction(agentId: string) {
  return runAction((u) => admin.stopAgent(u, agentId), ["/admin/agentes"]);
}

export async function createIntegrationAction(type: IntegrationType, fd: FormData) {
  return runAction((u) => {
    const fields: Record<string, string> = {};
    for (const [k, v] of fd.entries()) if (k.startsWith("f.")) fields[k.slice(2)] = String(v);
    return admin.createIntegration(u, type, String(fd.get("name") ?? ""), fields);
  }, ["/admin/integracoes"]);
}

export async function toggleIntegrationAction(id: string, active: boolean) {
  return runAction((u) => admin.setIntegrationActive(u, id, active), ["/admin/integracoes"]);
}

export async function createAutomationAction(fd: FormData) {
  return runAction(async (u) => {
    await createAutomation(u, {
      columnId: String(fd.get("columnId") ?? ""),
      action: String(fd.get("action")) as never,
      message: String(fd.get("message") ?? "") || undefined,
      userId: String(fd.get("userId") ?? "") || undefined,
    });
  }, ["/admin/automacoes"]);
}

export async function toggleAutomationAction(id: string, active: boolean) {
  return runAction((u) => setAutomationActive(u, id, active), ["/admin/automacoes"]);
}

export async function updateTeamAction(fd: FormData) {
  const budget = String(fd.get("budget") ?? "").replace(",", ".").trim();
  const retention = String(fd.get("retentionDays") ?? "").trim();
  return runAction(
    (u) =>
      admin.updateTeam(u, {
        name: String(fd.get("name") ?? ""),
        timezone: String(fd.get("timezone") ?? ""),
        categories: String(fd.get("categories") ?? "").split("\n").map((c) => c.trim()).filter(Boolean),
        aiMonthlyBudgetCents: budget ? Math.round(Number(budget) * 100) : null,
        retentionDays: retention ? Number(retention) : null,
      }),
    ["/admin/equipe"],
  );
}
