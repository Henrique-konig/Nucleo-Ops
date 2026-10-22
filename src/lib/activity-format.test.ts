import { describe, expect, it } from "vitest";
import { describeAction } from "./activity-format";

const ctx = { columns: new Map([["c1", "Entrada"], ["c2", "Em andamento"]]), users: new Map([["u1", "Ana"]]) };

describe("feed de atividades", () => {
  it("descreve movimentos com o nome da coluna", () => {
    expect(describeAction("card.move", { fromColumnId: "c1", toColumnId: "c2" }, ctx)).toBe("moveu para Em andamento");
    expect(describeAction("card.move", { fromColumnId: "c1", toColumnId: "c1" }, ctx)).toBe("reordenou o cartão");
    expect(describeAction("card.move", { toColumnId: "x" }, ctx)).toBe("moveu para outra coluna");
  });

  it("resume as mudanças do cartão", () => {
    expect(describeAction("card.update", { assigneeId: { from: null, to: "u1" }, title: { from: "a", to: "b" }, labelIds: {} }, ctx))
      .toBe("atribuiu a Ana e alterou o título e as etiquetas");
    expect(describeAction("card.update", { assigneeId: { from: "u1", to: null } }, ctx)).toBe("removeu o responsável");
  });

  it("descreve mudanças do chamado", () => {
    expect(describeAction("ticket.status", { from: "OPEN", to: "RESOLVED" }, ctx)).toBe("mudou o status para Resolvido");
    expect(describeAction("ticket.update", { priority: { from: "LOW", to: "URGENT" } }, ctx)).toBe("mudou a prioridade para urgente");
    expect(describeAction("triage.apply", { to: { category: "Rede", priority: "HIGH" } }, ctx)).toBe("fez a triagem: categoria Rede e prioridade alta");
  });

  it("mostra o tipo quando não conhece a ação", () => {
    expect(describeAction("algo.novo", null, ctx)).toBe("algo.novo");
  });
});
