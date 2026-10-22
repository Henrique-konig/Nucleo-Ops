"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { GraduationCap } from "lucide-react";
import { restartOnboardingAction } from "@/app/(app)/conta/actions";

export function RestartOnboardingButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="btn"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await restartOnboardingAction();
          if (result.ok) router.refresh();
        })
      }
    >
      <GraduationCap className="size-4" aria-hidden /> Rever a introdução
    </button>
  );
}
