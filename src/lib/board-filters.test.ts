import { describe, expect, it } from "vitest";
import { cleanFilter, isFilterActive, matchesFilter, sameFilter, type FilterableCard } from "./board-filters";

const card = (over: Partial<FilterableCard> = {}): FilterableCard => ({
  title: "Configurar VPN",
  description: "Usuário da área financeira",
  dueDate: null,
  assignee: null,
  agent: null,
  labels: [],
  ticket: null,
  ...over,
});

const ctx = { userId: "u1", now: new Date("2026-10-22T15:00:00Z") };

describe("filtros do quadro", () => {
  it("texto ignora acentos e exige todas as palavras", () => {
    expect(matchesFilter(card(), { text: "vpn financeira" }, ctx)).toBe(true);
    expect(matchesFilter(card(), { text: "área" }, ctx)).toBe(true);
    expect(matchesFilter(card(), { text: "vpn impressora" }, ctx)).toBe(false);
    expect(matchesFilter(card({ labels: [{ id: "l", name: "Rede" }] }), { text: "rede" }, ctx)).toBe(true);
  });

  it("responsável: comigo, sem responsável ou pessoa", () => {
    expect(matchesFilter(card({ assignee: { id: "u1" } }), { assigneeId: "me" }, ctx)).toBe(true);
    expect(matchesFilter(card({ assignee: { id: "u2" } }), { assigneeId: "me" }, ctx)).toBe(false);
    expect(matchesFilter(card(), { assigneeId: "none" }, ctx)).toBe(true);
    expect(matchesFilter(card({ assignee: { id: "u2" } }), { assigneeId: "u2" }, ctx)).toBe(true);
  });

  it("prioridade considera cartões sem chamado", () => {
    expect(matchesFilter(card({ ticket: { priority: "URGENT" } }), { priority: "URGENT" }, ctx)).toBe(true);
    expect(matchesFilter(card(), { priority: "NONE" }, ctx)).toBe(true);
    expect(matchesFilter(card(), { priority: "LOW" }, ctx)).toBe(false);
  });

  it("agente: qualquer, nenhum ou específico", () => {
    expect(matchesFilter(card({ agent: { id: "a" } }), { agentId: "any" }, ctx)).toBe(true);
    expect(matchesFilter(card(), { agentId: "any" }, ctx)).toBe(false);
    expect(matchesFilter(card(), { agentId: "none" }, ctx)).toBe(true);
    expect(matchesFilter(card({ agent: { id: "a" } }), { agentId: "b" }, ctx)).toBe(false);
  });

  it("prazo: atrasados, próximos 7 dias e sem prazo", () => {
    const yesterday = "2026-10-21T00:00:00.000Z";
    const today = "2026-10-22T00:00:00.000Z";
    const nextWeek = "2026-10-29T00:00:00.000Z";
    const later = "2026-11-10T00:00:00.000Z";
    expect(matchesFilter(card({ dueDate: yesterday }), { due: "overdue" }, ctx)).toBe(true);
    expect(matchesFilter(card({ dueDate: today }), { due: "overdue" }, ctx)).toBe(false);
    expect(matchesFilter(card({ dueDate: today }), { due: "week" }, ctx)).toBe(true);
    expect(matchesFilter(card({ dueDate: nextWeek }), { due: "week" }, ctx)).toBe(true);
    expect(matchesFilter(card({ dueDate: later }), { due: "week" }, ctx)).toBe(false);
    expect(matchesFilter(card(), { due: "none" }, ctx)).toBe(true);
  });

  it("limpa campos vazios e compara filtros", () => {
    expect(cleanFilter({ text: "", assigneeId: "me", labelId: undefined })).toEqual({ assigneeId: "me" });
    expect(isFilterActive({ text: "" })).toBe(false);
    expect(sameFilter({ assigneeId: "me", text: "" }, { assigneeId: "me" })).toBe(true);
    expect(sameFilter({ assigneeId: "me" }, { assigneeId: "me", due: "week" })).toBe(false);
  });
});
