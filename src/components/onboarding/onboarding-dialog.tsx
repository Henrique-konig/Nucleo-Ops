"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Bot, Hand, Inbox, KanbanSquare, MessageSquare, PartyPopper, Settings, Ticket, type LucideIcon } from "lucide-react";
import { finishOnboardingAction } from "@/app/(app)/conta/actions";

export type OnboardingAudience = "staff" | "admin" | "requester";

type Step = { Icon: LucideIcon; title: string; body: React.ReactNode; link?: { href: string; label: string } };

const STAFF_STEPS: Step[] = [
  {
    Icon: PartyPopper,
    title: "Boas-vindas ao Plantão",
    body: "Aqui chegam os chamados de todos os canais (portal, e-mail, chat, Slack e webhook). Cada um vira um cartão no quadro, e os agentes de IA ajudam na triagem e nas respostas.",
  },
  {
    Icon: KanbanSquare,
    title: "O quadro",
    body: (
      <>
        Arraste os cartões entre as colunas para mostrar em que pé está cada tarefa. No celular, toque e segure o cartão para arrastar, e deslize para os lados para trocar de coluna.
        <span className="mt-2 block">
          Pelo teclado: <kbd>Tab</kbd> até o cartão, <kbd>Alt</kbd> + setas para mover e <kbd>Enter</kbd> para abrir.
        </span>
      </>
    ),
  },
  {
    Icon: Ticket,
    title: "Chamados",
    body: "A fila completa fica em Chamados, com busca e filtros. Ao abrir um chamado você vê a conversa, responde ao solicitante e acompanha o que os agentes fizeram.",
    link: { href: "/chamados", label: "Ver a fila de chamados" },
  },
  {
    Icon: Bot,
    title: "Agentes trabalham, você decide",
    body: "O agente de triagem classifica e sugere um responsável. O de pesquisa propõe respostas com fontes da base de conhecimento. Nada sensível acontece sem a confirmação de uma pessoa, e tudo fica registrado na auditoria.",
  },
];

const ADMIN_STEP: Step = {
  Icon: Settings,
  title: "Deixe a equipe pronta",
  body: "Em Administração você convida pessoas, conecta e-mail, Slack e Teams e define o que cada agente pode fazer.",
  link: { href: "/admin", label: "Abrir a administração" },
};

const REQUESTER_STEPS: Step[] = [
  {
    Icon: Hand,
    title: "Boas-vindas ao Plantão",
    body: "Este é o canal para pedir ajuda à equipe de TI. Você abre o chamado, acompanha o andamento e avalia o atendimento, tudo aqui.",
  },
  {
    Icon: Inbox,
    title: "Abra um chamado",
    body: "Descreva o problema com suas palavras. Quanto mais detalhes (mensagem de erro, desde quando acontece), mais rápido a equipe resolve.",
  },
  {
    Icon: MessageSquare,
    title: "Converse com o assistente",
    body: "Para dúvidas comuns, como senha, VPN e impressora, o assistente responde na hora. Se ele não resolver, passa a conversa para uma pessoa da equipe.",
  },
];

function stepsFor(audience: OnboardingAudience) {
  if (audience === "requester") return REQUESTER_STEPS;
  return audience === "admin" ? [...STAFF_STEPS, ADMIN_STEP] : STAFF_STEPS;
}

/** Introdução mostrada no primeiro acesso; fechar ou pular conta como vista. */
export function OnboardingDialog({ audience, firstName }: { audience: OnboardingAudience; firstName: string }) {
  const steps = stepsFor(audience);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(true);
  const finished = useRef(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  function finish() {
    // Fechar o <dialog> dispara onClose; o ref evita gravar duas vezes.
    if (finished.current) return;
    finished.current = true;
    setOpen(false);
    dialogRef.current?.close();
    startTransition(async () => {
      await finishOnboardingAction();
    });
  }

  if (!open) return null;
  const step = steps[index];
  const last = index === steps.length - 1;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="onboarding-title"
      aria-describedby="onboarding-body"
      onClose={finish}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-lift dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
    >
      <div className="space-y-5 p-6">
        <div className="flex items-center justify-between">
          <p className="eyebrow">
            {index === 0 ? `Olá, ${firstName}` : `Passo ${index + 1} de ${steps.length}`}
          </p>
          <button type="button" className="btn-ghost py-1 text-xs" onClick={finish}>Pular introdução</button>
        </div>
        <div key={index} className="animate-rise space-y-3">
          <span className="grid size-12 place-items-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100 dark:bg-brand-950/60 dark:text-brand-300 dark:ring-brand-900">
            <step.Icon className="size-6" aria-hidden />
          </span>
          <h2 id="onboarding-title" className="text-xl font-semibold tracking-tight">{step.title}</h2>
          <div id="onboarding-body" className="text-sm leading-relaxed text-slate-600 dark:text-slate-300 [&_kbd]:rounded [&_kbd]:border [&_kbd]:border-slate-300 [&_kbd]:bg-slate-50 [&_kbd]:px-1 [&_kbd]:font-mono [&_kbd]:text-xs dark:[&_kbd]:border-slate-700 dark:[&_kbd]:bg-slate-800">
            {step.body}
          </div>
          {step.link && (
            <Link href={step.link.href} className="link inline-flex items-center gap-1 text-sm" onClick={finish}>
              {step.link.label} <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 pt-1">
          <ol className="flex gap-1.5" aria-label="Progresso">
            {steps.map((s, i) => (
              <li key={s.title} aria-current={i === index ? "step" : undefined} className={`h-1.5 rounded-full transition-all ${i === index ? "w-6 bg-brand-600 dark:bg-brand-400" : "w-1.5 bg-slate-300 dark:bg-slate-700"}`}>
                <span className="sr-only">Passo {i + 1}{i === index ? " (atual)" : ""}</span>
              </li>
            ))}
          </ol>
          <div className="flex gap-2">
            {index > 0 && (
              <button type="button" className="btn" onClick={() => setIndex((i) => i - 1)}>
                <ArrowLeft className="size-4" aria-hidden /> Voltar
              </button>
            )}
            <button type="button" className="btn-primary" autoFocus onClick={() => (last ? finish() : setIndex((i) => i + 1))}>
              {last ? "Começar a usar" : "Próximo"} {!last && <ArrowRight className="size-4" aria-hidden />}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
