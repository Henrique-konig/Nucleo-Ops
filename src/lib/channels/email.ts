import "server-only";
import type { IntegrationConfig } from "@/lib/integrations";

export type OutgoingEmail = {
  to: string;
  subject: string;
  text: string;
  inReplyTo?: string;
};

/** O que o envio precisa: a integração de e-mail da equipe serve, e as variáveis de ambiente também. */
export type OutgoingEmailConfig = Pick<IntegrationConfig<"EMAIL">, "provider" | "apiKey" | "from">;

/**
 * Envio configurado só por variáveis de ambiente, para quem não cadastrou a
 * integração de e-mail: RESEND_API_KEY + EMAIL_FROM. Só EMAIL_FROM (sem chave)
 * registra no console, útil em desenvolvimento.
 */
export function emailConfigFromEnv(env: Record<string, string | undefined> = process.env): OutgoingEmailConfig | null {
  const from = env.EMAIL_FROM?.trim();
  if (!from) return null;
  const apiKey = env.RESEND_API_KEY?.trim();
  return apiKey ? { provider: "resend", apiKey, from } : { provider: "log", from };
}

/** Envia um e-mail pelo provedor configurado. Com provider "log", só registra no console. */
export async function sendEmail(config: OutgoingEmailConfig, email: OutgoingEmail): Promise<{ id?: string }> {
  if (config.provider === "log") {
    console.info(`[email] para ${email.to}: ${email.subject}\n${email.text}`);
    return {};
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: config.from,
      to: [email.to],
      subject: email.subject,
      text: email.text,
      headers: email.inReplyTo ? { "In-Reply-To": email.inReplyTo, References: email.inReplyTo } : undefined,
    }),
  });
  if (!res.ok) throw new Error(`Falha ao enviar e-mail (${res.status}): ${await res.text()}`);
  return (await res.json()) as { id?: string };
}

/** Assunto com o número curto do chamado, usado para encadear as respostas. */
export function ticketSubject(ticket: { id: string; title: string }): string {
  return `[Plantão #${shortId(ticket.id)}] ${ticket.title}`;
}

export function shortId(id: string): string {
  return id.slice(-8);
}

const SUBJECT_TAG = /\[Plant[aã]o #([a-z0-9]{8})\]/i;

export function shortIdFromSubject(subject: string): string | null {
  return SUBJECT_TAG.exec(subject)?.[1]?.toLowerCase() ?? null;
}

/** Remove o histórico citado de uma resposta de e-mail ("Em ... escreveu:", linhas com ">"). */
export function stripQuotedReply(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    if (/^(Em|On) .+(escreveu|wrote):\s*$/.test(line.trim())) break;
    if (/^-{2,}\s*(Mensagem original|Original Message)/i.test(line.trim())) break;
    if (line.startsWith(">")) continue;
    out.push(line);
  }
  return out.join("\n").trim();
}
