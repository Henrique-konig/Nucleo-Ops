import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getDocument } from "@/lib/knowledge";
import { NotFoundError } from "@/lib/errors";
import { DocumentForm } from "@/components/knowledge/document-form";
import { ActionForm } from "@/components/tickets/action-form";
import { deleteDocumentAction, updateDocumentAction } from "../actions";
import Link from "next/link";
import { ArrowLeft, Trash2 } from "lucide-react";

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
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
      <div className="animate-rise space-y-3">
        <Link href="/base" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
          <ArrowLeft className="size-4" aria-hidden /> Base de conhecimento
        </Link>
        <h1 className="page-title">{doc.title}</h1>
      </div>
      <DocumentForm key={doc.updatedAt.toISOString()} action={updateDocumentAction.bind(null, doc.id)} doc={doc} readOnly={!canEdit} submitLabel="Salvar" />
      {canEdit && (
        <ActionForm action={deleteDocumentAction.bind(null, doc.id)} resetOnSuccess={false}>
          <button className="btn-danger"><Trash2 className="size-4" aria-hidden /> Excluir documento</button>
        </ActionForm>
      )}
    </main>
  );
}
