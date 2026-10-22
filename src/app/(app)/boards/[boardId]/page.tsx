import { notFound } from "next/navigation";
import { getBoard, getBoardOptions, listSavedFilters, NotFoundError } from "@/lib/boards";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { BoardView } from "@/components/board/board-view";

export async function generateMetadata({ params }: PageProps<"/boards/[boardId]">) {
  const user = await requireUser("board:view");
  const { boardId } = await params;
  const board = await getBoard(user, boardId).catch(() => null);
  return { title: board?.name ?? "Quadro" };
}

export default async function BoardPage({ params, searchParams }: PageProps<"/boards/[boardId]">) {
  const user = await requireUser("board:view");
  const [{ boardId }, query] = await Promise.all([params, searchParams]);

  const board = await getBoard(user, boardId).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  const [options, savedFilters] = await Promise.all([getBoardOptions(user), listSavedFilters(user, board.id)]);
  // A busca global abre o cartão direto: /boards/[id]?cartao=[cardId]
  const initialCardId = typeof query.cartao === "string" ? query.cartao : null;

  return (
    <BoardView
      key={board.id}
      board={board}
      boards={options.boards}
      members={options.members}
      labels={options.labels}
      agents={options.agents}
      savedFilters={savedFilters}
      userId={user.id}
      initialCardId={initialCardId}
      permissions={{
        createCard: can(user.role, "card:create"),
        editCard: can(user.role, "card:edit"),
        moveCard: can(user.role, "card:move"),
        assign: can(user.role, "card:assign"),
        manageColumns: can(user.role, "column:manage"),
        runAgents: can(user.role, "ai:use"),
      }}
    />
  );
}
