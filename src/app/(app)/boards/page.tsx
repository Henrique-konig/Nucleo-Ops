import { KanbanSquare } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui/page-header";
import { BoardsManager, NewBoardButton } from "@/components/board/boards-manager";
import { listBoards } from "@/lib/boards";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";

export const metadata = { title: "Quadros" };

export default async function BoardsPage({ searchParams }: PageProps<"/boards">) {
  const user = await requireUser("board:view");
  const [boards, params] = await Promise.all([listBoards(user), searchParams]);
  const canManage = can(user.role, "board:manage");
  const options = boards.map((b) => ({ id: b.id, name: b.name }));

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
      <PageHeader
        title="Quadros"
        description="Cada quadro organiza um fluxo de trabalho: atendimento, projetos, infraestrutura, plantão."
        actions={canManage && <NewBoardButton boards={options} autoOpen={params.novo === "1"} />}
      />
      {boards.length === 0 ? (
        <EmptyState icon={<KanbanSquare className="size-5" />} title="Nenhum quadro ainda">
          {canManage ? "Crie o primeiro quadro no botão acima." : "Peça a um coordenador para criar o primeiro quadro."}
        </EmptyState>
      ) : (
        <BoardsManager boards={boards} canManage={canManage} />
      )}
    </main>
  );
}
