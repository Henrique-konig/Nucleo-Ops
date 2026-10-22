// Vários quadros, filtros salvos, agentes personalizados e busca global.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createTeamFixture, hasDb, jobsOf, testDb as db } from "./fixtures";
import * as boards from "@/lib/boards";
import * as tickets from "@/lib/tickets";
import * as agents from "@/lib/custom-agents";
import { globalSearch } from "@/lib/search";
import { setAiProvider } from "@/lib/ai";
import { LocalProvider } from "@/lib/ai/local";
import { ForbiddenError } from "@/lib/permissions";
import { BusinessError } from "@/lib/errors";
import type { AgentRunInput } from "@/lib/ai/types";

let fx: Awaited<ReturnType<typeof createTeamFixture>>;

const job = (payload: object) => ({ id: "j", teamId: fx.team.id, payload: payload as never, attempts: 1 });

async function runQueuedAgentJobs() {
  for (const j of await jobsOf(fx.team.id, "agent.custom")) {
    if (j.status === "QUEUED") {
      await agents.customAgentJob(job(j.payload as object));
      await db.job.update({ where: { id: j.id }, data: { status: "DONE" } });
    }
  }
}

describe.skipIf(!hasDb)("quadros e agentes (integração)", () => {
  beforeAll(async () => {
    fx = await createTeamFixture("qa");
  });
  afterEach(() => setAiProvider(null));
  afterAll(() => db.$disconnect());

  describe("quadros", () => {
    it("cria quadros com colunas padrão, em branco ou copiadas", async () => {
      const coord = fx.actors.COORDINATOR;
      const padrao = await boards.createBoard(coord, { name: "Projetos", color: "emerald" });
      const vazio = await boards.createBoard(coord, { name: "Ideias", template: "blank" });
      const copia = await boards.createBoard(coord, { name: "Cópia", template: "copy", copyFromBoardId: fx.board.id });

      const cols = async (boardId: string) => (await boards.getBoard(coord, boardId)).columns.map((c) => [c.name, c.ticketStatus]);
      expect(await cols(padrao.id)).toEqual([["Entrada", "OPEN"], ["Em andamento", "IN_PROGRESS"], ["Em revisão", null], ["Concluído", "RESOLVED"]]);
      expect(await cols(vazio.id)).toEqual([]);
      expect(await cols(copia.id)).toEqual(await cols(fx.board.id));
      expect(padrao.color).toBe("emerald");

      const log = await db.action.findFirstOrThrow({ where: { targetId: padrao.id } });
      expect(log).toMatchObject({ type: "board.create", userId: coord.id });
    });

    it("só coordenador e administrador gerenciam quadros", async () => {
      await expect(boards.createBoard(fx.actors.TECHNICIAN, { name: "X" })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(boards.updateBoard(fx.actors.AUDITOR, { boardId: fx.board.id, name: "Y", color: "brand" })).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("lista os quadros com contagens e o quadro de entrada", async () => {
      const list = await boards.listBoards(fx.actors.TECHNICIAN);
      expect(list[0]).toMatchObject({ id: fx.board.id, isIntake: true, columnCount: 4 });
      expect(list.filter((b) => b.isIntake)).toHaveLength(1);
    });

    it("chamados novos entram no quadro marcado como entrada", async () => {
      const coord = fx.actors.COORDINATOR;
      const plantao = await boards.createBoard(coord, { name: "Plantão" });
      await boards.setIntakeBoard(coord, { boardId: plantao.id });

      const { ticket } = await tickets.createTicket({ teamId: fx.team.id, channel: "FORM", title: "Sem rede", description: "A rede caiu no andar", requester: { userId: fx.actors.REQUESTER.id } });
      const card = await db.card.findUniqueOrThrow({ where: { ticketId: ticket.id } });
      expect(card.boardId).toBe(plantao.id);
      expect((await boards.listBoards(coord)).find((b) => b.isIntake)?.id).toBe(plantao.id);

      // Quadro sem colunas não pode receber chamados.
      const vazio = await boards.createBoard(coord, { name: "Vazio", template: "blank" });
      await expect(boards.setIntakeBoard(coord, { boardId: vazio.id })).rejects.toBeInstanceOf(BusinessError);
      await boards.setIntakeBoard(coord, { boardId: fx.board.id });
    });

    it("move o cartão para outro quadro e aplica o status da coluna de destino", async () => {
      const tech = fx.actors.TECHNICIAN;
      const destino = await boards.createBoard(fx.actors.COORDINATOR, { name: "Destino" });
      const { ticket } = await tickets.createTicket({ teamId: fx.team.id, channel: "FORM", title: "Mover", description: "Cartão que muda de quadro", requester: { userId: fx.actors.REQUESTER.id } });
      const card = await db.card.findUniqueOrThrow({ where: { ticketId: ticket.id } });
      await boards.moveCard(tech, { cardId: card.id, toColumnId: fx.columnIds[1], toIndex: 0 });
      expect((await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).status).toBe("IN_PROGRESS");

      await boards.moveCardToBoard(tech, { cardId: card.id, boardId: destino.id });
      const moved = await db.card.findUniqueOrThrow({ where: { id: card.id }, include: { column: true } });
      expect(moved.boardId).toBe(destino.id);
      expect(moved.column.name).toBe("Entrada");
      expect((await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).status).toBe("OPEN");
      expect(await db.action.count({ where: { targetId: card.id, type: "card.move_board" } })).toBe(1);
    });

    it("exclui quadro sem cartões ativos e guarda os arquivados em outro quadro", async () => {
      const coord = fx.actors.COORDINATOR;
      const temp = await boards.createBoard(coord, { name: "Temporário" });
      const col = (await boards.getBoard(coord, temp.id)).columns[0];
      const card = await boards.createCard(coord, { boardId: temp.id, columnId: col.id, title: "a" });
      await expect(boards.deleteBoard(coord, { boardId: temp.id })).rejects.toThrow("Mova ou arquive");

      await boards.archiveCard(coord, { cardId: card.id });
      await boards.deleteBoard(coord, { boardId: temp.id });
      expect(await db.board.findUnique({ where: { id: temp.id } })).toBeNull();
      const kept = await db.card.findUniqueOrThrow({ where: { id: card.id } });
      expect(kept.archivedAt).not.toBeNull();
      expect(kept.boardId).not.toBe(temp.id);
    });

    it("não exclui o último quadro da equipe", async () => {
      const solo = await createTeamFixture("solo");
      await expect(boards.deleteBoard(solo.actors.ADMIN, { boardId: solo.board.id })).rejects.toThrow("pelo menos um quadro");
    });
  });

  describe("filtros salvos", () => {
    it("filtro pessoal só aparece para quem salvou; compartilhado para todos", async () => {
      const tech = fx.actors.TECHNICIAN;
      const coord = fx.actors.COORDINATOR;
      const mine = await boards.saveFilter(tech, { boardId: fx.board.id, name: "Comigo", filters: { assigneeId: "me", text: "" } });
      expect(mine.filters).toEqual({ assigneeId: "me" });
      const team = await boards.saveFilter(coord, { boardId: fx.board.id, name: "Urgentes", filters: { priority: "URGENT" }, shared: true });

      expect((await boards.listSavedFilters(tech, fx.board.id)).map((f) => f.name)).toEqual(["Comigo", "Urgentes"]);
      expect((await boards.listSavedFilters(coord, fx.board.id)).map((f) => f.name)).toEqual(["Urgentes"]);

      // Técnico não compartilha nem apaga o filtro da equipe.
      await expect(boards.saveFilter(tech, { boardId: fx.board.id, name: "X", filters: { due: "overdue" }, shared: true })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(boards.deleteFilter(tech, { filterId: team.id })).rejects.toBeInstanceOf(ForbiddenError);
      // Ninguém vê nem apaga o filtro pessoal de outra pessoa.
      await expect(boards.deleteFilter(coord, { filterId: mine.id })).rejects.toThrow("não encontrado");

      await boards.deleteFilter(tech, { filterId: mine.id });
      await boards.deleteFilter(coord, { filterId: team.id });
      expect(await boards.listSavedFilters(tech, fx.board.id)).toEqual([]);
    });

    it("recusa filtro vazio", async () => {
      await expect(boards.saveFilter(fx.actors.TECHNICIAN, { boardId: fx.board.id, name: "Nada", filters: {} })).rejects.toThrow("ao menos um critério");
    });
  });

  describe("agentes personalizados", () => {
    it("cria, valida nome único e respeita o papel", async () => {
      const coord = fx.actors.COORDINATOR;
      const a = await agents.createCustomAgent(coord, { name: "Analista", role: "Investiga incidentes", instructions: "Liste as causas prováveis e como confirmar." });
      expect(a).toMatchObject({ active: true, runOnAssign: true, createdById: coord.id });
      await expect(agents.createCustomAgent(coord, { name: "Analista", role: "Outro", instructions: "outra coisa qualquer" })).rejects.toThrow("Já existe");
      await expect(agents.createCustomAgent(fx.actors.TECHNICIAN, { name: "Técnico", role: "Outro", instructions: "instruções longas" })).rejects.toBeInstanceOf(ForbiddenError);

      const updated = await agents.updateCustomAgent(coord, a.id, { name: "Analista", role: "Investiga incidentes de rede", instructions: a.instructions, color: "rose" });
      expect(updated.color).toBe("rose");
      const log = await db.action.findFirstOrThrow({ where: { targetId: a.id, type: "custom_agent.update" } });
      expect(log.payload).toMatchObject({ role: { to: "Investiga incidentes de rede" }, color: { from: "violet", to: "rose" } });
    });

    it("atribuído ao cartão, trabalha e deixa a análise", async () => {
      const tech = fx.actors.TECHNICIAN;
      const agent = await agents.createCustomAgent(fx.actors.ADMIN, { name: "Planejador", role: "Quebra o trabalho em etapas", instructions: "Liste as etapas em ordem." });
      const card = await boards.createCard(tech, { boardId: fx.board.id, columnId: fx.columnIds[0], title: "Migrar servidor de arquivos" });
      await boards.addChecklistItem(tech, { cardId: card.id, text: "Copiar dados" });

      let seen: AgentRunInput | null = null;
      const local = new LocalProvider();
      setAiProvider({ ...local, runAgent: async (input: AgentRunInput) => { seen = input; return local.runAgent(input); } } as never);

      await boards.updateCard(tech, { cardId: card.id, agentId: agent.id });
      const [run] = await db.customAgentRun.findMany({ where: { cardId: card.id } });
      expect(run).toMatchObject({ status: "QUEUED", agentId: agent.id, requestedById: tech.id });

      await runQueuedAgentJobs();
      const done = await db.customAgentRun.findUniqueOrThrow({ where: { id: run.id } });
      expect(done.status).toBe("DONE");
      expect(done.output).toContain("Copiar dados");
      expect(seen!.agent).toMatchObject({ name: "Planejador", instructions: "Liste as etapas em ordem." });
      expect(seen!.card).toMatchObject({ title: "Migrar servidor de arquivos", column: "Entrada" });
      expect(await db.action.count({ where: { targetId: card.id, type: "custom_agent.run", userId: tech.id } })).toBe(1);

      // Pedido manual com instrução extra; não duplica enquanto houver um na fila.
      await agents.requestAgentRun(tech, { cardId: card.id, prompt: "foque nos riscos" });
      await agents.requestAgentRun(tech, { cardId: card.id, prompt: "de novo" });
      const runs = await agents.listCardRuns(tech, card.id);
      expect(runs.map((r) => r.status)).toEqual(["QUEUED", "DONE"]);
      expect(runs[0].prompt).toBe("foque nos riscos");
      await runQueuedAgentJobs();
      expect((await agents.listCardRuns(tech, card.id))[0].output).toContain("foque nos riscos");
    });

    it("registra a falha do modelo na execução, sem derrubar a fila", async () => {
      const agent = await agents.createCustomAgent(fx.actors.ADMIN, { name: "Instável", role: "Teste", instructions: "Qualquer coisa útil." });
      const card = await boards.createCard(fx.actors.TECHNICIAN, { boardId: fx.board.id, columnId: fx.columnIds[0], title: "Falha" });
      setAiProvider({ ...new LocalProvider(), runAgent: async () => { throw new Error("API fora do ar"); } } as never);
      await agents.requestAgentRun(fx.actors.TECHNICIAN, { cardId: card.id, agentId: agent.id });
      await runQueuedAgentJobs();
      const [run] = await agents.listCardRuns(fx.actors.TECHNICIAN, card.id);
      expect(run).toMatchObject({ status: "FAILED", error: "API fora do ar" });
    });

    it("agente desligado não é atribuído nem roda; excluir libera os cartões", async () => {
      const admin = fx.actors.ADMIN;
      const agent = await agents.createCustomAgent(admin, { name: "Pausado", role: "Teste", instructions: "Qualquer coisa útil.", runOnAssign: false });
      const card = await boards.createCard(fx.actors.TECHNICIAN, { boardId: fx.board.id, columnId: fx.columnIds[0], title: "Com agente" });
      await boards.updateCard(fx.actors.TECHNICIAN, { cardId: card.id, agentId: agent.id });
      // Sem "rodar ao atribuir", nada entra na fila.
      expect(await db.customAgentRun.count({ where: { cardId: card.id } })).toBe(0);

      await agents.updateCustomAgent(admin, agent.id, { name: "Pausado", role: "Teste", instructions: "Qualquer coisa útil.", active: false });
      await expect(agents.requestAgentRun(fx.actors.TECHNICIAN, { cardId: card.id })).rejects.toThrow("desligado");
      const other = await boards.createCard(fx.actors.TECHNICIAN, { boardId: fx.board.id, columnId: fx.columnIds[0], title: "Outro" });
      await expect(boards.updateCard(fx.actors.TECHNICIAN, { cardId: other.id, agentId: agent.id })).rejects.toThrow("desligado");

      await agents.deleteCustomAgent(admin, agent.id);
      expect((await db.card.findUniqueOrThrow({ where: { id: card.id } })).agentId).toBeNull();
    });

    it("agente de outra equipe não é visível", async () => {
      const other = await createTeamFixture("outra");
      const foreign = await agents.createCustomAgent(other.actors.ADMIN, { name: "Estrangeiro", role: "Outro", instructions: "não deveria aparecer" });
      const card = await boards.createCard(fx.actors.TECHNICIAN, { boardId: fx.board.id, columnId: fx.columnIds[0], title: "Isolamento" });
      await expect(boards.updateCard(fx.actors.TECHNICIAN, { cardId: card.id, agentId: foreign.id })).rejects.toThrow("não encontrado");
      await expect(agents.getCustomAgent(fx.actors.ADMIN, foreign.id)).rejects.toThrow("não encontrado");
    });
  });

  describe("busca global", () => {
    it("encontra cartões, chamados, quadros e agentes da equipe", async () => {
      const tech = fx.actors.TECHNICIAN;
      await boards.createCard(tech, { boardId: fx.board.id, columnId: fx.columnIds[0], title: "Trocar switch do andar 3" });
      const { ticket } = await tickets.createTicket({ teamId: fx.team.id, channel: "FORM", title: "Switch piscando", description: "Luz laranja", requester: { userId: fx.actors.REQUESTER.id } });

      const hits = await globalSearch(tech, "switch");
      expect(hits.filter((h) => h.type === "card").map((h) => h.title)).toEqual(expect.arrayContaining(["Trocar switch do andar 3", "Switch piscando"]));
      expect(hits.some((h) => h.type === "ticket" && h.id === ticket.id)).toBe(true);
      expect((await globalSearch(tech, `#${ticket.id.slice(-8)}`)).some((h) => h.id === ticket.id)).toBe(true);
      expect((await globalSearch(tech, "planejador")).some((h) => h.type === "agent")).toBe(true);
      expect((await globalSearch(tech, "Atendimento")).some((h) => h.type === "board" && h.id === fx.board.id)).toBe(true);
      expect(await globalSearch(tech, "s")).toEqual([]);
    });

    it("solicitante só encontra os próprios chamados", async () => {
      const hits = await globalSearch(fx.actors.REQUESTER, "switch");
      expect(hits.length).toBeGreaterThan(0);
      expect(hits.every((h) => h.type === "ticket" && h.href.startsWith("/solicitante/"))).toBe(true);
      expect(await globalSearch(fx.actors.AUDITOR, "switch")).not.toEqual([]);
      const outsider = await db.user.create({ data: { name: "Outro", email: `outro-${fx.run}@teste.local`, role: "REQUESTER", teamId: fx.team.id } });
      expect(await globalSearch({ id: outsider.id, role: "REQUESTER", teamId: fx.team.id }, "switch")).toEqual([]);
    });

    it("não vaza dados de outra equipe", async () => {
      const other = await createTeamFixture("busca");
      expect(await globalSearch(other.actors.TECHNICIAN, "switch")).toEqual([]);
    });
  });
});
