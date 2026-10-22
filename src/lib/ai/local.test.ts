import { describe, expect, it } from "vitest";
import { LocalProvider } from "./local";

const p = new LocalProvider();
const categories = ["Acesso", "Senha", "Rede", "Hardware", "Software", "E-mail", "Outros"];
const members = [
  { id: "a", name: "Ana", openCards: 5, onCall: false },
  { id: "b", name: "Bruno", openCards: 1, onCall: false },
  { id: "c", name: "Carla", openCards: 9, onCall: true },
];

describe("provedor local", () => {
  it("triagem por palavras-chave, preferindo quem está de plantão", async () => {
    const { data, usage } = await p.triage({ title: "VPN não conecta", description: "Erro 809 desde ontem", categories, members });
    expect(data).toMatchObject({ category: "Rede", priority: "MEDIUM", suggestedAssigneeId: "c" });
    expect(usage).toBeNull();
    const urgent = await p.triage({ title: "Sistema fora do ar", description: "Ninguém consegue acessar", categories, members: members.slice(0, 2) });
    expect(urgent.data.priority).toBe("URGENT");
    expect(urgent.data.suggestedAssigneeId).toBe("b");
  });

  it("rascunho usa a fonte mais relevante", async () => {
    const sources = [
      { type: "document" as const, id: "d1", title: "Impressora com fila travada", content: "Cancele os documentos da fila da impressora e reinicie." },
      { type: "document" as const, id: "d2", title: "VPN", content: "Remova o perfil da VPN." },
    ];
    const { data } = await p.draftReply({ ticket: { title: "Impressora travada", description: "A fila da impressora não anda" }, conversation: [], sources });
    expect(data.usedSourceIds).toEqual(["d1"]);
    expect(data.confident).toBe(true);
  });

  it("chatbot passa para humano quando pedido ou sem resposta", async () => {
    const a = await p.chat({ question: "quero falar com um atendente", history: [], sources: [], requesterTickets: [] });
    expect(a.data.handoff).toBe(true);
    const b = await p.chat({ question: "qual o status do meu chamado?", history: [], sources: [], requesterTickets: [{ id: "abcdefgh12345678", title: "Mouse", status: "Em andamento" }] });
    expect(b.data).toMatchObject({ handoff: false });
    expect(b.data.answer).toContain("Mouse");
  });
});
