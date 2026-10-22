import { requireUser } from "@/lib/session";
import { ROLE_LABELS } from "@/lib/permissions";
import { ActionForm } from "@/components/tickets/action-form";
import { changePasswordAction } from "./actions";

export const metadata = { title: "Minha conta" };

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <main className="mx-auto max-w-md space-y-4 p-6">
      <h1 className="text-xl font-semibold">Minha conta</h1>
      <p className="text-sm">{user.name} · {user.email} · {ROLE_LABELS[user.role]}</p>
      <ActionForm action={changePasswordAction} successMessage="Senha alterada." className="space-y-3">
        <label className="block space-y-1"><span className="text-sm font-medium">Senha atual</span><input name="current" type="password" required autoComplete="current-password" className="input" /></label>
        <label className="block space-y-1"><span className="text-sm font-medium">Nova senha (mín. 12 caracteres)</span><input name="next" type="password" required minLength={12} autoComplete="new-password" className="input" /></label>
        <label className="block space-y-1"><span className="text-sm font-medium">Confirme a nova senha</span><input name="confirm" type="password" required minLength={12} autoComplete="new-password" className="input" /></label>
        <button className="btn-primary">Trocar senha</button>
      </ActionForm>
    </main>
  );
}
