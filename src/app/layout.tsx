import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Plantão", template: "%s · Plantão" },
  description: "Central de operações para TI",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
