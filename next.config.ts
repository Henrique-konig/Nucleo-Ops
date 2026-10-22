import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg", "@prisma/adapter-pg"],
  // Anexos de até 4 MB passam por server action (o padrão é 1 MB).
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
};

// Monitoramento de erros (Sentry). Sem SENTRY_DSN/NEXT_PUBLIC_SENTRY_DSN o SDK fica
// desligado; sem SENTRY_AUTH_TOKEN o build não envia source maps.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  widenClientFileUpload: true,
  // Envia os eventos do navegador pelo próprio domínio, para não serem barrados por bloqueadores.
  tunnelRoute: "/monitoring",
  telemetry: false,
});
