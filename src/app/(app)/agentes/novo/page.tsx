import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { AgentForm } from "@/components/agents/agent-form";
import { AGENT_TEMPLATES } from "@/lib/custom-agents";
import { requireUser } from "@/lib/session";
import { createAgentAction } from "../actions";

export const metadata = { title: "Novo agente" };

export default async function NewAgentPage() {
  await requireUser("agent:create");
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
      <Link href="/agentes" className="link inline-flex items-center gap-1 text-sm"><ArrowLeft className="size-4" aria-hidden /> Agentes</Link>
      <PageHeader title="Novo agente" description="Dê um nome, uma função e diga como ele deve trabalhar. Depois é só atribuir aos cartões." />
      <AgentForm action={createAgentAction} templates={AGENT_TEMPLATES} submitLabel="Criar agente" />
    </main>
  );
}
