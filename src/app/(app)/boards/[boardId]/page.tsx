import { notFound } from "next/navigation";
import { getBoard, getBoardOptions, NotFoundError } from "@/lib/boards";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { BoardView } from "@/components/board/board-view";

export async function generateMetadata({ params }: PageProps<"/boards/[boardId]">) {
  const user = await requireUser("board:view");
  const { boardId } = await params;
  const board = await getBoard(user, boardId).catch(() => null);
  return { title: board?.name ?? "Quadro" };
}

export default async function BoardPage({ params }: PageProps<"/boards/[boardId]">) {
  const user = await requireUser("board:view");
  const { boardId } = await params;

  const board = await getBoard(user, boardId).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  const options = await getBoardOptions(user);

  return (
    <BoardView
      board={board}
      members={options.members}
      labels={options.labels}
      permissions={{
        createCard: can(user.role, "card:create"),
        editCard: can(user.role, "card:edit"),
        moveCard: can(user.role, "card:move"),
        assign: can(user.role, "card:assign"),
        manageColumns: can(user.role, "column:manage"),
      }}
    />
  );
}
