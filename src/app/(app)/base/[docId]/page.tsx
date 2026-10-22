import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getDocument } from "@/lib/knowledge";
import { NotFoundError } from "@/lib/errors";
import { DocumentForm } from "@/components/knowledge/document-form";
import { ActionForm } from "@/components/tickets/action-form";
import { deleteDocumentAction, updateDocumentAction } from "../actions";

export const metadata = { title: "Documento" };

export default async function DocumentPage({ params }: PageProps<"/base/[docId]">) {
  const user = await requireUser("board:view");
  const { docId } = await params;
  const doc = await getDocument(user, docId).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  const canEdit = can(user.role, "kb:edit");
  return (
    <main className="mx-auto max-w-4xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">{doc.title}</h1>
      <DocumentForm key={doc.updatedAt.toISOString()} action={updateDocumentAction.bind(null, doc.id)} doc={doc} readOnly={!canEdit} submitLabel="Salvar" />
      {canEdit && (
        <ActionForm action={deleteDocumentAction.bind(null, doc.id)} resetOnSuccess={false}>
          <button className="btn-danger">Excluir documento</button>
        </ActionForm>
      )}
    </main>
  );
}
