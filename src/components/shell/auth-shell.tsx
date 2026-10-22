import { Bot, KanbanSquare, ShieldCheck } from "lucide-react";
import { Logo } from "./sidebar";

const HIGHLIGHTS = [
  { Icon: KanbanSquare, title: "Quadro em tempo real", text: "Chamados viram cartões e a equipe toda vê cada movimento na hora." },
  { Icon: Bot, title: "Agentes de IA", text: "Triagem, pesquisa na base e rascunhos de resposta, sempre com revisão humana." },
  { Icon: ShieldCheck, title: "Tudo auditado", text: "Cada ação de pessoas e agentes fica registrada, com permissões por papel." },
];

/** Moldura das telas de entrada (login e configuração inicial). */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-slate-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgb(116_104_241/0.45),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgb(139_92_246/0.3),transparent_50%)]" />
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgb(255_255_255)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]"
        />
        <div className="relative"><Logo /></div>
        <div className="relative max-w-md space-y-10">
          <div className="space-y-4">
            <h2 className="text-4xl leading-tight font-semibold tracking-tight">
              A central de operações da sua equipe de TI.
            </h2>
            <p className="text-lg text-slate-300">Chamados, tarefas e agentes de IA trabalhando juntos, num só lugar.</p>
          </div>
          <ul className="space-y-5">
            {HIGHLIGHTS.map(({ Icon, title, text }, i) => (
              <li key={title} className="flex animate-rise gap-4" style={{ animationDelay: `${150 + i * 100}ms` }}>
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10 ring-1 ring-white/15 backdrop-blur">
                  <Icon className="size-5 text-brand-200" aria-hidden />
                </span>
                <span>
                  <span className="block font-medium">{title}</span>
                  <span className="block text-sm text-slate-400">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-slate-400">Plantão · Central de operações para TI</p>
      </section>
      <section className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm animate-rise">
          <div className="mb-8 lg:hidden"><Logo /></div>
          {children}
        </div>
      </section>
    </main>
  );
}
