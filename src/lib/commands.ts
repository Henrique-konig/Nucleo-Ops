import "server-only";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { addRequesterMessage, createTicket, replyToTicket, STATUS_LABELS, PRIORITY_LABELS } from "@/lib/tickets";
import { trackingUrl } from "@/lib/notifications";
import { appUrl } from "@/lib/integrations";
import { errorMessage } from "@/lib/error-message";
import type { Channel } from "@/generated/prisma/enums";

// Comandos de chat (Slack e Teams). Cada canal identifica o usuário do seu jeito
// e chama estas funções, que devolvem o texto da resposta.

type CommandUser = { id: string; teamId: string; role: Parameters<typeof can>[0]; name: string };

export const HELP = [
  "Comandos do Plantão:",
  "• abrir <assunto> | <descrição> — abre um chamado",
  "• status — seus chamados em aberto",
  "• status <número> — situação de um chamado",
  "• responder <número> <mensagem> — escreve no chamado",
  "• fila — chamados em aberto da equipe (técnicos)",
].join("\n");

export function parseCommand(text: string) {
  const trimmed = text.trim();
  const [verb = "", ...rest] = trimmed.split(/\s+/);
  return { verb: verb.toLowerCase(), args: rest.join(" ").trim() };
}

async function findByShortId(teamId: string, short: string) {
  const clean = short.replace(/^#/, "").toLowerCase();
  if (!/^[a-z0-9]{8}$/.test(clean)) return null;
  return db.ticket.findFirst({ where: { teamId, id: { endsWith: clean } } });
}

export async function runUserCommand(user: CommandUser, text: string, channel: Channel): Promise<string> {
  const { verb, args } = parseCommand(text);
  try {
    switch (verb) {
      case "abrir": {
        if (!can(user.role, "ticket:create")) return "Você não pode abrir chamados.";
        const [title, ...desc] = args.split("|");
        const description = desc.join("|").trim() || title.trim();
        if (title.trim().length < 3) return "Uso: abrir <assunto> | <descrição>";
        const { ticket } = await createTicket({
          teamId: user.teamId, channel, title: title.trim(), description: description.length >= 5 ? description : `${description} (aberto pelo ${channel === "SLACK" ? "Slack" : "Teams"})`,
          requester: { userId: user.id },
        });
        return `Chamado #${ticket.id.slice(-8)} aberto: ${ticket.title}\nAcompanhe: ${trackingUrl(ticket)}`;
      }
      case "status": {
        if (args) {
          const ticket = await findByShortId(user.teamId, args);
          const staff = can(user.role, "board:view");
          if (!ticket || (!staff && ticket.requesterId !== user.id)) return "Chamado não encontrado.";
          return `#${ticket.id.slice(-8)} ${ticket.title}\nStatus: ${STATUS_LABELS[ticket.status]} · Prioridade: ${PRIORITY_LABELS[ticket.priority]}`;
        }
        const mine = await db.ticket.findMany({
          where: { requesterId: user.id, status: { in: ["OPEN", "IN_PROGRESS", "WAITING"] }, OR: [{ channel: { not: "CHAT" } }, { handoffAt: { not: null } }] },
          orderBy: { createdAt: "desc" },
          take: 10,
        });
        if (mine.length === 0) return "Você não tem chamados em aberto.";
        return mine.map((t) => `• #${t.id.slice(-8)} ${t.title} — ${STATUS_LABELS[t.status]}`).join("\n");
      }
      case "responder": {
        const [short, ...words] = args.split(/\s+/);
        const content = words.join(" ").trim();
        const ticket = short ? await findByShortId(user.teamId, short) : null;
        if (!ticket || !content) return "Uso: responder <número> <mensagem>";
        if (ticket.requesterId === user.id) await addRequesterMessage(ticket.id, { userId: user.id }, content, { channel });
        else if (can(user.role, "card:edit")) await replyToTicket(user, { ticketId: ticket.id, content });
        else return "Chamado não encontrado.";
        return `Mensagem registrada no chamado #${ticket.id.slice(-8)}.`;
      }
      case "fila":
        if (!can(user.role, "board:view")) return "Comando disponível só para a equipe de TI.";
        return queueSummary(user.teamId, user.id);
      default:
        return HELP;
    }
  } catch (err) {
    return errorMessage(err);
  }
}

export async function queueSummary(teamId: string, userId?: string) {
  const open = await db.ticket.groupBy({
    by: ["priority"],
    where: { teamId, status: { in: ["OPEN", "IN_PROGRESS", "WAITING"] }, OR: [{ channel: { not: "CHAT" } }, { handoffAt: { not: null } }] },
    _count: true,
  });
  const total = open.reduce((n, g) => n + g._count, 0);
  const byPriority = (["URGENT", "HIGH", "MEDIUM", "LOW"] as const)
    .map((p) => `${PRIORITY_LABELS[p]}: ${open.find((g) => g.priority === p)?._count ?? 0}`)
    .join(" · ");
  const mine = userId
    ? await db.card.count({ where: { assigneeId: userId, archivedAt: null, ticket: { status: { in: ["OPEN", "IN_PROGRESS", "WAITING"] } } } })
    : null;
  return `${total} chamado(s) em aberto — ${byPriority}${mine !== null ? `\nCom você: ${mine}` : ""}\n${appUrl("/chamados")}`;
}

/** Comandos sem identificação do usuário (Teams): só consultas. */
export async function runAnonymousCommand(teamId: string, text: string): Promise<string> {
  const { verb, args } = parseCommand(text);
  if (verb === "status" && args) {
    const ticket = await findByShortId(teamId, args);
    if (!ticket) return "Chamado não encontrado.";
    return `#${ticket.id.slice(-8)} ${ticket.title}\nStatus: ${STATUS_LABELS[ticket.status]} · Prioridade: ${PRIORITY_LABELS[ticket.priority]}`;
  }
  if (verb === "fila") return queueSummary(teamId);
  return "Comandos no Teams: status <número> · fila. Para abrir chamados use o portal, o e-mail ou o Slack.";
}
