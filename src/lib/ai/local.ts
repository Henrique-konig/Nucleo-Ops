import type { AiProvider, Source } from "./types";
import { normalize } from "./text";

// Provedor local, sem modelo: regras simples por palavras-chave. Usado quando não
// há chave de API (desenvolvimento, testes, equipes que não podem enviar dados a
// terceiros). Não tem custo e devolve usage = null.

const CATEGORY_HINTS: [string, string[]][] = [
  ["Senha", ["senha", "password", "bloquead", "expirad", "redefinir", "reset"]],
  ["Acesso", ["acesso", "permiss", "pasta", "login", "entrar", "negado", "liberar"]],
  ["Rede", ["vpn", "wi-fi", "wifi", "rede", "internet", "conex", "dns", "lento"]],
  ["E-mail", ["e-mail", "email", "outlook", "caixa de entrada", "gmail"]],
  ["Hardware", ["impressora", "monitor", "teclado", "mouse", "notebook", "computador", "tela", "cabo"]],
  ["Software", ["instalar", "programa", "sistema", "erp", "licen", "atualiza", "aplicativo", "app"]],
];

const URGENT = ["parad", "fora do ar", "todos", "ninguém consegue", "ninguem consegue", "vazamento", "invas", "ransomware", "vírus", "virus"];
const HIGH = ["urgente", "não consigo trabalhar", "nao consigo trabalhar", "impedid", "cliente", "produção", "producao"];
const LOW = ["dúvida", "duvida", "como faço", "como faco", "pedido", "solicito", "gostaria"];

const HANDOFF = ["atendente", "humano", "pessoa", "técnico", "tecnico", "falar com"];

function pickCategory(text: string, categories: string[]) {
  let best: { category: string; hits: number } | null = null;
  for (const [category, words] of CATEGORY_HINTS) {
    if (!categories.includes(category)) continue;
    const hits = words.filter((w) => text.includes(w)).length;
    if (hits > 0 && (!best || hits > best.hits)) best = { category, hits };
  }
  return best?.category ?? (categories.includes("Outros") ? "Outros" : categories[0]);
}

function relevant(sources: Source[], text: string) {
  const words = new Set(normalize(text).split(/\W+/).filter((w) => w.length > 3));
  return sources
    .map((s) => ({ s, score: normalize(`${s.title} ${s.content}`).split(/\W+/).filter((w) => words.has(w)).length }))
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.s);
}

function excerpt(content: string, max = 600) {
  return content.length > max ? `${content.slice(0, max).trimEnd()}…` : content;
}

export class LocalProvider implements AiProvider {
  readonly name = "local";

  triage: AiProvider["triage"] = async (input) => {
    const text = normalize(`${input.title} ${input.description}`);
    const category = pickCategory(text, input.categories);
    const priority = URGENT.some((w) => text.includes(normalize(w)))
      ? "URGENT"
      : HIGH.some((w) => text.includes(normalize(w)))
        ? "HIGH"
        : LOW.some((w) => text.includes(normalize(w)))
          ? "LOW"
          : "MEDIUM";
    const pool = input.members.filter((m) => m.onCall).length > 0 ? input.members.filter((m) => m.onCall) : input.members;
    const assignee = [...pool].sort((a, b) => a.openCards - b.openCards)[0];
    return {
      data: {
        category,
        priority,
        suggestedAssigneeId: assignee?.id ?? null,
        reason: `Classificação por palavras-chave (${category}); ${assignee ? `${assignee.name} tem menos cartões abertos${assignee.onCall ? " e está de plantão" : ""}` : "sem responsável sugerido"}.`,
      },
      usage: null,
    };
  };

  draftReply: AiProvider["draftReply"] = async (input) => {
    const [best] = relevant(input.sources, `${input.ticket.title} ${input.ticket.description}`);
    if (!best) {
      return {
        data: {
          reply: "Olá! Recebemos seu chamado e já estamos verificando. Poderia informar desde quando o problema acontece e se aparece alguma mensagem de erro?",
          usedSourceIds: [],
          confident: false,
        },
        usage: null,
      };
    }
    return {
      data: {
        reply: `Olá! Segue a orientação da nossa base de conhecimento ("${best.title}"):\n\n${excerpt(best.content)}\n\nSe não resolver, responda esta mensagem que seguimos com você.`,
        usedSourceIds: [best.id],
        confident: true,
      },
      usage: null,
    };
  };

  chat: AiProvider["chat"] = async (input) => {
    const q = normalize(input.question);
    if (HANDOFF.some((w) => q.includes(normalize(w)))) {
      return { data: { answer: "Certo, vou passar sua conversa para a equipe de TI. Você será avisado por aqui.", usedSourceIds: [], handoff: true, handoffTitle: input.history[0]?.content.slice(0, 80) ?? input.question.slice(0, 80) }, usage: null };
    }
    if (q.includes("status") || q.includes("chamado")) {
      if (input.requesterTickets.length > 0) {
        const list = input.requesterTickets.slice(0, 5).map((t) => `• #${t.id.slice(-8)} ${t.title}: ${t.status}`).join("\n");
        return { data: { answer: `Seus chamados mais recentes:\n${list}`, usedSourceIds: [], handoff: false, handoffTitle: null }, usage: null };
      }
    }
    const [best] = relevant(input.sources, input.question);
    if (best) {
      return {
        data: { answer: `${excerpt(best.content, 800)}\n\n(Fonte: ${best.title}) Isso resolveu? Se não, escreva "falar com atendente".`, usedSourceIds: [best.id], handoff: false, handoffTitle: null },
        usage: null,
      };
    }
    return { data: { answer: "Não encontrei isso na nossa base. Vou passar para a equipe de TI.", usedSourceIds: [], handoff: true, handoffTitle: input.question.slice(0, 80) }, usage: null };
  };

  summarize: AiProvider["summarize"] = async (input) => {
    const lines = Object.entries(input.stats).map(([k, v]) => `- ${k}: ${v}`);
    const highlights = input.highlights.slice(0, 10).map((h) => `- ${h.title} (${h.status}${h.category ? `, ${h.category}` : ""})`);
    return {
      data: { summary: `## ${input.periodLabel}\n\n### Indicadores\n${lines.join("\n")}\n\n### Chamados do período\n${highlights.join("\n") || "- Nenhum chamado."}` },
      usage: null,
    };
  };

  proposeExecution: AiProvider["proposeExecution"] = async (input) => {
    const text = normalize(`${input.ticket.title} ${input.ticket.description}`);
    const email = /[\w.+-]+@[\w-]+\.[\w.]+/.exec(`${input.ticket.title} ${input.ticket.description}`)?.[0];
    const match = input.catalog.find((a) => normalize(`${a.key} ${a.label}`).split(/\W+/).some((w) => w.length > 4 && text.includes(w)));
    if (!match) return { data: { actionKey: null, params: {}, reason: "Nenhuma ação do catálogo corresponde ao chamado." }, usage: null };
    const params: Record<string, string> = {};
    for (const key of Object.keys(match.params)) if (key.toLowerCase().includes("email") && email) params[key] = email;
    return { data: { actionKey: match.key, params, reason: `O chamado menciona "${match.label}".` }, usage: null };
  };
}
