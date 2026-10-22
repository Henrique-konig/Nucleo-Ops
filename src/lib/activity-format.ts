// Texto legível para cada registro do log de auditoria no feed de atividades.
// Sem dependências do servidor, para poder ser testado isoladamente.

export type ActivityContext = {
  columns: Map<string, string>;
  users: Map<string, string>;
};

const STATUS: Record<string, string> = {
  OPEN: "Aberto", IN_PROGRESS: "Em andamento", WAITING: "Aguardando solicitante", RESOLVED: "Resolvido", CLOSED: "Encerrado",
};
const PRIORITY: Record<string, string> = { LOW: "baixa", MEDIUM: "média", HIGH: "alta", URGENT: "urgente" };
const FIELDS: Record<string, string> = { title: "o título", description: "a descrição", dueDate: "o prazo", labelIds: "as etiquetas" };

type Change = { from?: unknown; to?: unknown };
type Payload = Record<string, unknown>;

const str = (v: unknown) => (typeof v === "string" ? v : null);

function join(parts: string[]) {
  return parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;
}

function cardUpdate(p: Payload, ctx: ActivityContext) {
  const parts: string[] = [];
  const assignee = p.assigneeId as Change | undefined;
  if (assignee) {
    const to = str(assignee.to);
    parts.push(to ? `atribuiu a ${ctx.users.get(to) ?? "alguém da equipe"}` : "removeu o responsável");
  }
  const due = p.dueDate as Change | undefined;
  if (due) {
    const to = str(due.to);
    parts.push(to ? `definiu o prazo para ${new Date(to).toLocaleDateString("pt-BR", { timeZone: "UTC" })}` : "removeu o prazo");
  }
  const others = Object.keys(p).filter((k) => k in FIELDS && k !== "dueDate").map((k) => FIELDS[k]);
  if (others.length > 0) parts.push(`alterou ${join(others)}`);
  return parts.length > 0 ? join(parts) : "editou o cartão";
}

/** Frase no passado, sem o autor ("moveu para Em andamento"). */
export function describeAction(type: string, payload: unknown, ctx: ActivityContext): string {
  const p = (payload && typeof payload === "object" ? payload : {}) as Payload;
  const column = (id: unknown) => (str(id) && ctx.columns.get(id as string)) || "outra coluna";
  switch (type) {
    case "card.create": return "criou o cartão";
    case "card.move":
      if (p.fromColumnId === p.toColumnId) return "reordenou o cartão";
      return p.reason === "ticket.status" ? `levou o cartão para ${column(p.toColumnId)} ao mudar o status` : `moveu para ${column(p.toColumnId)}`;
    case "card.update": return cardUpdate(p, ctx);
    case "card.archive": return "arquivou o cartão";
    case "card.link": return `vinculou um pull request${str(p.url) ? ` (${p.url})` : ""}`;
    case "card.link_update": return `atualizou o pull request vinculado${str(p.state) ? ` (${p.state})` : ""}`;
    case "card.unlink": return "removeu um pull request vinculado";
    case "checklist.add": return `adicionou "${str(p.text) ?? "item"}" à checklist`;
    case "checklist.check": return "concluiu um item da checklist";
    case "checklist.uncheck": return "reabriu um item da checklist";
    case "checklist.delete": return `removeu "${str(p.text) ?? "item"}" da checklist`;
    case "comment.add": return "comentou";
    case "comment.edit": return "editou um comentário";
    case "comment.delete": return "removeu um comentário";
    case "attachment.add": return `anexou ${str(p.filename) ?? "um arquivo"}`;
    case "attachment.delete": return `removeu o anexo ${str(p.filename) ?? ""}`.trim();
    case "automation.run": return "executou uma automação da coluna";
    case "ticket.create": return "abriu o chamado";
    case "ticket.status": return `mudou o status para ${STATUS[str(p.to) ?? ""] ?? p.to}`;
    case "ticket.update": {
      const parts: string[] = [];
      const priority = p.priority as Change | undefined;
      const category = p.category as Change | undefined;
      if (priority) parts.push(`mudou a prioridade para ${PRIORITY[str(priority.to) ?? ""] ?? priority.to}`);
      if (category) parts.push(str(category.to) ? `definiu a categoria ${category.to}` : "removeu a categoria");
      return parts.length > 0 ? join(parts) : "atualizou o chamado";
    }
    case "ticket.requester_message": return "enviou uma mensagem";
    case "ticket.reply": return "respondeu o solicitante";
    case "ticket.note": return "escreveu uma nota interna";
    case "ticket.rate": return `avaliou o atendimento com ${p.score} de 5`;
    case "chat.handoff": return "passou a conversa para a equipe";
    case "chat.resolved": return "resolveu pelo chat";
    case "triage.apply": {
      const to = (p.to ?? {}) as Payload;
      const parts = [str(to.category) && `categoria ${to.category}`, str(to.priority) && `prioridade ${PRIORITY[to.priority as string] ?? to.priority}`].filter(Boolean) as string[];
      return parts.length > 0 ? `fez a triagem: ${join(parts)}` : "fez a triagem";
    }
    case "triage.undo": return "desfez a triagem automática";
    case "draft.create": return "propôs um rascunho de resposta";
    case "draft.request": return "pediu um rascunho ao agente de pesquisa";
    case "draft.send": return p.edited ? "enviou o rascunho com ajustes" : "enviou o rascunho de resposta";
    case "draft.discard": return "descartou o rascunho";
    case "execution.propose": return "propôs uma ação pré-aprovada";
    case "execution.approved": return "aprovou uma ação";
    case "execution.rejected": return "recusou uma ação";
    case "execution.executed": return "executou uma ação";
    case "execution.simulated": return "simulou uma ação";
    case "execution.failed": return "registrou falha numa ação";
    default: return type;
  }
}
