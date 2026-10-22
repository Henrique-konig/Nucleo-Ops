"use client";

import { ErrorView } from "@/components/feedback/error-view";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorView error={error} reset={reset} />;
}
