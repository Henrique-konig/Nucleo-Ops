import { requireUser } from "@/lib/session";
import { DocumentForm } from "@/components/knowledge/document-form";
import { createDocumentAction } from "../actions";

export const metadata = { title: "Novo documento" };

export default async function NewDocumentPage() {
  await requireUser("kb:edit");
  return (
    <main className="mx-auto max-w-4xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">Novo documento</h1>
      <DocumentForm action={createDocumentAction} submitLabel="Criar documento" />
    </main>
  );
}
