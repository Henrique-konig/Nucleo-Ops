import { describe, expect, it } from "vitest";
import { emailConfigFromEnv, shortIdFromSubject, stripQuotedReply, ticketSubject } from "./email";

describe("e-mail", () => {
  it("assunto carrega o número curto do chamado", () => {
    const subject = ticketSubject({ id: "cmabc123456789xyz", title: "VPN" });
    expect(subject).toBe("[Plantão #56789xyz] VPN");
    expect(shortIdFromSubject(`Re: ${subject}`)).toBe("56789xyz");
    expect(shortIdFromSubject("RES: [Plantao #ABCDEFGH] x")).toBe("abcdefgh");
    expect(shortIdFromSubject("Sem marcação")).toBeNull();
  });

  it("remove o histórico citado", () => {
    expect(stripQuotedReply("Resolvido, obrigado!\n\nOn Mon, Ana wrote:\n> antigo")).toBe("Resolvido, obrigado!");
    expect(stripQuotedReply("Oi\n> citado\nfim")).toBe("Oi\nfim");
    expect(stripQuotedReply("Ok\n-----Original Message-----\nDe: x")).toBe("Ok");
  });

  it("configura o envio pelas variáveis de ambiente", () => {
    expect(emailConfigFromEnv({})).toBeNull();
    expect(emailConfigFromEnv({ RESEND_API_KEY: "re_x" })).toBeNull();
    expect(emailConfigFromEnv({ EMAIL_FROM: "TI <ti@empresa.com>" })).toEqual({ provider: "log", from: "TI <ti@empresa.com>" });
    expect(emailConfigFromEnv({ EMAIL_FROM: " ti@empresa.com ", RESEND_API_KEY: " re_x " })).toEqual({ provider: "resend", apiKey: "re_x", from: "ti@empresa.com" });
  });
});
