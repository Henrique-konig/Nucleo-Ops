import { requireUser } from "@/lib/session";
import { ROLE_LABELS } from "@/lib/permissions";
import { ActionForm } from "@/components/tickets/action-form";
import { changePasswordAction } from "./actions";
import { KeyRound } from "lucide-react";
import { initials } from "@/lib/initials";
import { RestartOnboardingButton } from "@/components/onboarding/restart-onboarding";

export const metadata = { title: "Minha conta" };

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
      <h1 className="page-title animate-rise">Minha conta</h1>
      <div className="panel flex items-center gap-4 p-5">
        <span className="grid size-14 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-lg font-semibold text-white shadow-glow">
          {initials(user.name)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold">{user.name}</p>
          <p className="truncate text-sm text-slate-500 dark:text-slate-400">{user.email}</p>
          <span className="badge mt-1.5 bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300">{ROLE_LABELS[user.role]}</span>
        </div>
      </div>
      <div className="panel flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h2 className="section-title">Introdução</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Veja de novo o tour rápido do primeiro acesso.</p>
        </div>
        <RestartOnboardingButton />
      </div>
      <ActionForm action={changePasswordAction} successMessage="Senha alterada." className="panel space-y-4 p-5">
        <h2 className="section-title flex items-center gap-2"><KeyRound className="size-4 text-slate-400" aria-hidden /> Trocar senha</h2>
        <label className="block space-y-1.5"><span className="field-label">Senha atual</span><input name="current" type="password" required autoComplete="current-password" className="input" /></label>
        <label className="block space-y-1.5"><span className="field-label">Nova senha (mín. 12 caracteres)</span><input name="next" type="password" required minLength={12} autoComplete="new-password" className="input" /></label>
        <label className="block space-y-1.5"><span className="field-label">Confirme a nova senha</span><input name="confirm" type="password" required minLength={12} autoComplete="new-password" className="input" /></label>
        <button className="btn-primary">Trocar senha</button>
      </ActionForm>
    </main>
  );
}
