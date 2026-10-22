"use server";

import { redirect } from "next/navigation";
import { runAction } from "@/lib/action-result";
import { deleteDocument, saveDocument } from "@/lib/knowledge";

function fields(fd: FormData) {
  return {
    title: String(fd.get("title") ?? ""),
    content: String(fd.get("content") ?? ""),
    source: String(fd.get("source") ?? "") || null,
    validUntil: String(fd.get("validUntil") ?? "") || null,
  };
}

export async function createDocumentAction(fd: FormData) {
  const result = await runAction((user) => saveDocument(user, null, fields(fd)), ["/base"]);
  if (result.ok) redirect(`/base/${result.data.id}`);
  return result;
}

export async function updateDocumentAction(id: string, fd: FormData) {
  return runAction(async (user) => { await saveDocument(user, id, fields(fd)); }, ["/base", "/base/[docId]"]);
}

export async function deleteDocumentAction(id: string) {
  const result = await runAction((user) => deleteDocument(user, id), ["/base"]);
  if (result.ok) redirect("/base");
  return result;
}
