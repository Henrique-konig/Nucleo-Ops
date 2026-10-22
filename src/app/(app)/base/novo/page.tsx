import { requireUser } from "@/lib/session";
import { DocumentForm } from "@/components/knowledge/document-form";
import { createDocumentAction } from "../actions";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata = { title: "Novo documento" };

export default async function NewDocumentPage() {
  await requireUser("kb:edit");
  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
      <div className="animate-rise space-y-3">
        <Link href="/base" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
          <ArrowLeft className="size-4" aria-hidden /> Base de conhecimento
        </Link>
        <h1 className="page-title">Novo documento</h1>
      </div>
      <DocumentForm action={createDocumentAction} submitLabel="Criar documento" />
    </main>
  );
}
