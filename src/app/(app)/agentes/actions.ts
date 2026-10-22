"use server";

import { redirect } from "next/navigation";
import { runAction } from "@/lib/action-result";
import * as agents from "@/lib/custom-agents";

function readForm(fd: FormData): agents.CustomAgentInput {
  return {
    name: String(fd.get("name") ?? ""),
    role: String(fd.get("role") ?? ""),
    instructions: String(fd.get("instructions") ?? ""),
    color: String(fd.get("color") ?? "violet") as never,
    runOnAssign: fd.get("runOnAssign") === "on",
    useKnowledge: fd.get("useKnowledge") === "on",
    active: fd.get("active") === "on",
  };
}

export async function createAgentAction(fd: FormData) {
  const result = await runAction(async (u) => (await agents.createCustomAgent(u, readForm(fd))).id, ["/agentes"]);
  if (result.ok) redirect(`/agentes/${result.data}`);
  return result;
}

export async function updateAgentAction(agentId: string, fd: FormData) {
  return runAction(async (u) => { await agents.updateCustomAgent(u, agentId, readForm(fd)); }, ["/agentes", "/agentes/[agentId]"]);
}

export async function deleteAgentAction(agentId: string) {
  const result = await runAction((u) => agents.deleteCustomAgent(u, agentId), ["/agentes"]);
  if (result.ok) redirect("/agentes");
  return result;
}
