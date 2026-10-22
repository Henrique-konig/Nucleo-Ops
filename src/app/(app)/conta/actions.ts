"use server";

import { runAction } from "@/lib/action-result";
import { changeOwnPassword } from "@/lib/admin";
import { finishOnboarding, restartOnboarding } from "@/lib/onboarding";

export async function changePasswordAction(fd: FormData) {
  if (fd.get("next") !== fd.get("confirm")) return { ok: false as const, error: "A confirmação não confere com a nova senha" };
  return runAction((u) => changeOwnPassword(u, { current: String(fd.get("current") ?? ""), next: String(fd.get("next") ?? "") }));
}

export async function finishOnboardingAction() {
  return runAction((u) => finishOnboarding(u));
}

export async function restartOnboardingAction() {
  return runAction((u) => restartOnboarding(u));
}
