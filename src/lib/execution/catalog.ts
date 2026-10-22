import { z } from "zod";

// Catálogo de ações pré-aprovadas. Só ações deste catálogo podem ser propostas e,
// dentre elas, só as que o administrador liberou para o agente de execução.
// "sensitive" marca ações que afetam produção: só coordenador ou administrador
// confirma, e nunca a mesma pessoa que propôs.

const email = z.email("E-mail inválido");
const slug = z.string().trim().min(1).max(100).regex(/^[\w.@-]+$/, "Use só letras, números, ponto, hífen e sublinhado");

export const ACTIONS = {
  reset_password: {
    label: "Redefinir senha",
    description: "Gera senha temporária e envia ao e-mail cadastrado do usuário",
    sensitive: false,
    params: z.object({ email }),
    paramHelp: { email: "e-mail do usuário" },
  },
  unlock_account: {
    label: "Desbloquear conta",
    description: "Desbloqueia a conta após tentativas de login erradas",
    sensitive: false,
    params: z.object({ email }),
    paramHelp: { email: "e-mail do usuário" },
  },
  add_to_group: {
    label: "Adicionar a grupo de acesso",
    description: "Inclui o usuário em um grupo (pasta, sistema, VPN)",
    sensitive: false,
    params: z.object({ email, group: slug }),
    paramHelp: { email: "e-mail do usuário", group: "nome do grupo" },
  },
  create_user: {
    label: "Criar usuário",
    description: "Cria conta corporativa (e-mail, rede) para um novo colaborador",
    sensitive: true,
    params: z.object({ name: z.string().trim().min(3).max(120), email, department: z.string().trim().min(2).max(80) }),
    paramHelp: { name: "nome completo", email: "e-mail a criar", department: "área" },
  },
  restart_service: {
    label: "Reiniciar serviço",
    description: "Reinicia um serviço em um servidor",
    sensitive: true,
    params: z.object({ host: slug, service: slug }),
    paramHelp: { host: "servidor", service: "nome do serviço" },
  },
} as const;

export type ActionKey = keyof typeof ACTIONS;

export function isActionKey(key: string): key is ActionKey {
  return Object.hasOwn(ACTIONS, key);
}

export function validateParams(key: ActionKey, params: unknown) {
  return ACTIONS[key].params.parse(params) as Record<string, string>;
}

export function catalogFor(allowed: string[]) {
  return (Object.keys(ACTIONS) as ActionKey[])
    .filter((key) => allowed.includes(key))
    .map((key) => ({ key, label: ACTIONS[key].label, description: ACTIONS[key].description, params: ACTIONS[key].paramHelp as Record<string, string>, sensitive: ACTIONS[key].sensitive }));
}
