# Plantão — central de operações para TI

Central onde a equipe de TI recebe chamados, organiza tarefas e deixa agentes de IA
cuidarem da triagem e das respostas repetitivas. Tudo fica num só lugar, com registro
de cada ação.

As seis fases do cronograma estão implementadas:

| Fase | Entregas | Onde |
| --- | --- | --- |
| 1. Fundação | Autenticação, banco no Neon com Prisma, quadro em tempo real | `/boards` |
| 2. Entrada de chamados | Formulário, e-mail, webhook, cartão automático, notificação pelo canal de origem | `/solicitante`, `/chamados` |
| 3. Triagem e pesquisa | Agente de triagem, base de conhecimento, busca semântica, rascunhos com fontes | `/base` |
| 4. Atendimento | Chatbot de primeiro nível, Slack e Teams | `/solicitante` |
| 5. Execução e controle | Agente de execução, auditoria, permissões por papel, administração | `/execucoes`, `/auditoria`, `/admin` |
| 6. Visibilidade | Painel de indicadores, resumos automáticos, GitHub/GitLab, retenção | `/indicadores`, `/relatorios` |

## Como um chamado anda

1. A pessoa abre o chamado pelo portal, chat, e-mail, Slack ou webhook.
2. O agente de triagem classifica, define a prioridade e sugere um responsável
   (considerando a escala de plantão e a carga de cada um).
3. O cartão entra na coluna de entrada do quadro.
4. O agente de pesquisa consulta a base de conhecimento e chamados parecidos e propõe uma resposta com fontes.
5. O técnico revisa e envia a resposta, executa ações pré-aprovadas ou move o cartão.
   A coluna pode definir o status do chamado.
6. O solicitante recebe cada atualização pelo mesmo canal por onde abriu.

## Requisitos funcionais

| ID | Requisito | Implementação |
| --- | --- | --- |
| RF-01 | Abrir chamado por formulário, e-mail, chat e webhook | `src/lib/tickets.ts`, `src/lib/inbound.ts`, `src/lib/chatbot.ts`, `src/lib/commands.ts` |
| RF-02 | Classificar categoria, prioridade e responsável | `src/lib/agents/triage.ts` |
| RF-03 | Cartão automático para cada chamado | `createCardForTicket` em `src/lib/tickets.ts` |
| RF-04 | Mover cartões em tempo real | `src/lib/boards.ts`, `src/lib/realtime.ts` (LISTEN/NOTIFY + SSE) |
| RF-05 | Consultar a base e propor resposta com fontes | `src/lib/agents/research.ts`, `src/lib/knowledge.ts` |
| RF-06 | Ações pré-aprovadas com confirmação humana | `src/lib/execution/` |
| RF-07 | Notificar pelo canal de origem | `src/lib/notifications.ts` |
| RF-08 | Log de toda ação de agente e de usuário | `src/lib/audit.ts` (tabela `Action`, append-only no banco) |
| RF-09 | Resumo diário e semanal | `src/lib/agents/summary.ts` |
| RF-10 | Indicadores de tempo, volume e resolução | `src/lib/metrics.ts` |
| RF-11 | Automações do quadro | `src/lib/automations.ts` |
| RF-12 | Vincular cartão a PR (GitHub/GitLab) | `src/lib/code-links.ts` |

## Papéis

| Papel | Pode fazer |
| --- | --- |
| Solicitante | Abrir chamados, acompanhar, conversar com o chatbot, avaliar |
| Técnico | Assumir e mover cartões, responder, editar a base, propor e confirmar ações não sensíveis |
| Coordenador | O do técnico + atribuir responsáveis, prioridades, colunas, automações e confirmar ações sensíveis |
| Administrador | Tudo + usuários, integrações, agentes e dados da equipe |
| Auditor | Ler quadro, chamados, indicadores e log, sem alterar nada |

As permissões ficam em `src/lib/permissions.ts` e são verificadas no servidor em toda operação.
A matriz completa (papel × permissão) aparece em **Administração > Perfis de acesso** (`/admin/perfis`).
Exportar a lista de chamados é restrito a coordenador e administrador.

### Auditoria e exportação

- Toda mudança grava uma linha no log append-only (`Action`) na mesma transação. Logins e tentativas
  com senha errada (de contas existentes) também ficam registrados.
- `/auditoria` filtra por pessoa, agente, ação, tipo de alvo e período, e exporta em **CSV** (até
  50 mil linhas) ou **PDF** (até 5 mil).
- `/chamados` exporta a lista filtrada em CSV ou PDF; `/relatorios` baixa cada relatório em PDF.
- Toda exportação também fica no log (`audit.export`, `ticket.export`, `report.export`).
- Os PDFs são gerados no servidor com `pdf-lib`, sem navegador headless.

## Agentes de IA

| Agente | Lê | Escreve | Confirmação humana |
| --- | --- | --- | --- |
| Triagem | Chamado e categorias | Categoria, prioridade, responsável sugerido | Não, mas pode ser desfeita |
| Pesquisa | Base e histórico de chamados | Rascunho de resposta | Sim, antes de enviar |
| Chatbot | Base e chamados do solicitante | Respostas de primeiro nível | Não; passa para a equipe quando não resolve |
| Execução | Catálogo de ações e alvos | Ações da lista de permitidas | Sim, em toda ação |
| Resumo | Ações e chamados do período | Relatório | Não |

Controles comuns a todos os agentes, configurados em `/admin/agentes`:

- **Lista de permitidas**: só as ações que o administrador liberou podem rodar.
- **Limites**: execuções por minuto e por dia.
- **Pausa automática**: após 3 falhas seguidas, o agente pausa e a equipe é avisada.
- **Simulação**: o agente registra o que faria, sem alterar nada.
- **Parada imediata**: botão "Parar agora".

**Ações sensíveis**, isto é, as que afetam produção, como reiniciar serviço ou criar usuário,
só podem ser confirmadas por coordenador ou administrador, e nunca pela mesma pessoa que propôs.

**Provedor de modelos.** Com `ANTHROPIC_API_KEY`, os agentes usam o Claude
(`claude-opus-5-5` por padrão, configurável em `AI_MODEL`), com saída estruturada e fallback
automático em recusas. Sem chave, usam um provedor local por regras, sem custo e sem enviar dados
a terceiros. O contrato entre os dois está em `src/lib/ai/types.ts`.

**Custo.** Cada chamada ao modelo registra tokens e custo. O custo por chamado aparece na tela do
chamado e no painel. Cada equipe tem um teto mensal: ao chegar a 80% a equipe é avisada, e no teto
os agentes param até o mês seguinte.

## Stack

| Camada | Escolha |
| --- | --- |
| Frontend | Next.js 16 (App Router), React 19, Tailwind 4 |
| Banco | PostgreSQL no Neon, com pgvector |
| ORM | Prisma 7 — `@prisma/adapter-neon` no Neon, `@prisma/adapter-pg` fora dele |
| Autenticação | Auth.js (credenciais, JWT, usuário relido do banco a cada requisição) |
| Tempo real | Postgres `LISTEN/NOTIFY` + Server-Sent Events |
| Fila | Tabela `Job` no Postgres (`FOR UPDATE SKIP LOCKED`), retentativa com espera exponencial |
| IA | API da Anthropic (`@anthropic-ai/sdk`); embeddings Voyage (opcional) |
| Testes | Vitest: unidade e integração contra Postgres real |

## Regras no banco (SQL bruto nas migrações)

- **Unicidade de chamado por canal**: índice único parcial em `(teamId, channel, externalId)`.
  O mesmo e-mail ou evento de webhook não gera dois chamados.
- **Log imutável**: triggers bloqueiam `UPDATE`, `DELETE` e `TRUNCATE` em `Action`, e um `CHECK`
  exige exatamente um autor (agente ou usuário).
- **pgvector**: `Document.embedding vector(1024)` com índice HNSW, mais índices de texto completo
  em português para a busca sem embeddings.
- **Tempo real**: triggers de `pg_notify` em cartões, colunas e checklist.

> O Prisma não conhece o índice HNSW. Ao gerar uma migração com `prisma migrate dev --create-only`,
> apague a linha `DROP INDEX "Document_embedding_idx"` se ela aparecer.

## Rodando localmente

Requisitos: Node 22+ e Postgres 16 com pgvector (local ou um branch do Neon).

```bash
npm install
cp .env.example .env        # preencha as variáveis (veja abaixo)
npx prisma migrate deploy
npm run db:seed             # equipe "TI", um usuário por papel, quadro, agentes e documentos de exemplo
npm run dev
```

Usuários do seed (senha `plantao-dev`, ou a definida em `SEED_PASSWORD`):
`admin@`, `coordenador@`, `tecnico@`, `solicitante@` e `auditor@plantao.local`.

Postgres com Docker: `docker run -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=plantao -p 5432:5432 pgvector/pgvector:pg16`.

### Variáveis de ambiente

| Variável | Para quê |
| --- | --- |
| `DATABASE_URL` | Conexão da aplicação (no Neon, a URL com `-pooler`) |
| `DIRECT_URL` | Conexão direta: migrações e o `LISTEN` do tempo real (ou `DATABASE_URL_UNPOOLED`, da integração Neon) |
| `AUTH_SECRET` | Assinatura das sessões (`openssl rand -base64 32`) |
| `INTEGRATION_ENCRYPTION_KEY` | Chave AES-256 das configurações de integração (32 bytes em base64) |
| `APP_URL` | Endereço público, usado nos links de acompanhamento |
| `CRON_SECRET` | Protege `/api/cron/*` (a Vercel envia `Authorization: Bearer`) |
| `SETUP_TOKEN` | Código exigido na primeira configuração (`/setup`) |
| `ANTHROPIC_API_KEY`, `AI_MODEL`, `AI_PROVIDER` | Provedor de IA (sem chave: provedor local) |
| `VOYAGE_API_KEY` | Embeddings para busca semântica (sem chave: texto completo) |
| `USD_BRL` | Cotação para mostrar custos em reais (padrão 5,40) |
| `RESEND_API_KEY`, `EMAIL_FROM` | E-mail de saída sem cadastrar a integração (só `EMAIL_FROM`: registra no console) |

### Deploy na Vercel

1. Importe o repositório na Vercel (framework Next.js). O `vercel.json` já define
   `npm run vercel-build`, que aplica as migrações antes do build quando há banco.
2. Em **Storage → Neon**, crie o banco e conecte ao projeto. A integração define
   `DATABASE_URL` (com pooling) e `DATABASE_URL_UNPOOLED`, que o Plantão usa para
   migrações e tempo real. Habilite a extensão pgvector (a migração já roda
   `CREATE EXTENSION IF NOT EXISTS vector`).
3. Defina `AUTH_SECRET`, `INTEGRATION_ENCRYPTION_KEY`, `CRON_SECRET`, `SETUP_TOKEN`,
   `APP_URL` e, se for usar o Claude, `ANTHROPIC_API_KEY`. Depois faça um novo deploy.
4. Abra o site: sem equipe cadastrada, ele leva a `/setup`, onde você cria a equipe e o
   primeiro administrador (o código pedido é o `SETUP_TOKEN`).

No plano Hobby, a Vercel só aceita cron diário: a fila é processada logo após cada
requisição e pela rotina diária. No plano Pro, adicione
`{ "path": "/api/cron/jobs", "schedule": "* * * * *" }` em `vercel.json` para as
retentativas rodarem a cada minuto.

### Neon e Vercel

- Use a URL com pooling em `DATABASE_URL` e a direta em `DIRECT_URL`. O pooler em modo transação
  não mantém `LISTEN`.
- Com a integração Neon + Vercel, cada pull request ganha um branch do banco. Rode
  `prisma migrate deploy` no build de preview.
- `vercel.json` agenda `/api/cron/daily` às 07:00 de Brasília: processa a fila, gera os
  resumos, aplica a retenção, encerra conversas paradas e, às segundas, avisa sobre
  documentos vencendo.
- A conexão SSE é encerrada no limite da função (300 s) e o navegador reconecta sozinho.

## Integrações

Configuradas em `/admin/integracoes`. As configurações são cifradas antes de gravar, e os segredos
gerados aparecem uma única vez, junto com a URL a configurar no serviço externo.

| Integração | Entrada | Saída |
| --- | --- | --- |
| E-mail | `POST /api/inbound/email/:id` (formato genérico ou Postmark, `Authorization: Bearer`) | Resend (ou log no console) |
| Webhook genérico | `POST /api/inbound/webhook/:id` com `X-Plantao-Signature: sha256=…` | Callback assinado a cada atualização |
| Slack | Slash command `/plantao` em `/api/integrations/slack/:id` | Aviso no canal da equipe e DM ao solicitante |
| Teams | Webhook de saída em `/api/integrations/teams/:id` (só consultas) | Webhook de entrada no canal |
| GitHub | `/api/integrations/github/:id` (evento `pull_request`) | — |
| GitLab | `/api/integrations/gitlab/:id` (Merge request events) | — |
| Agenda de plantão | URL iCal secreta (Google Calendar ou Outlook) | — |
| Executor de ações | — | POST assinado ao seu orquestrador (n8n, Rundeck, AWX…) |

**Avisos por e-mail.** Com a integração de e-mail cadastrada, ou só com `RESEND_API_KEY` e
`EMAIL_FROM` no ambiente, o Plantão envia e-mail:

- ao solicitante, a cada resposta pública ou mudança de status, inclusive em chamados abertos pelo
  portal ou passados do chat para a equipe (com o link de acompanhamento);
- a quem for definido como responsável por um cartão (menos quando a pessoa atribui a si mesma).

Para vincular um PR a um cartão, cite o código do cartão (`PLT-xxxxxxxx`, mostrado no cartão) no
título, na descrição ou no branch do PR, ou cole o link no cartão.

Formato do webhook genérico:

```json
{ "id": "123", "title": "Servidor sem disco", "description": "…", "requester": { "email": "pessoa@empresa.com" }, "priority": "HIGH" }
```

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Gera o cliente Prisma e faz o build |
| `npm run typecheck` | Gera os tipos de rota do Next e roda o `tsc` |
| `npm test` | Testes; os de integração rodam quando `DATABASE_URL` está definida |
| `npm run db:migrate` | Cria e aplica migrações em desenvolvimento |
| `npm run db:seed` | Dados iniciais (idempotente) |

## Decisões tomadas para as questões em aberto

- **Primeiro canal de entrada**: os três (formulário, e-mail e chat) ficaram prontos. O e-mail
  aceita o formato genérico e o do Postmark.
- **Provedor de IA**: Claude via API da Anthropic, atrás de uma interface própria. O provedor local
  atende quem não pode enviar dados a terceiros.
- **Microsoft 365 ou Google Workspace**: as duas opções funcionam. E-mail entra por webhook do
  provedor de e-mail, avisos vão para Slack ou Teams, e a escala de plantão é lida de qualquer
  agenda iCal.
- **SLA por prioridade**: ainda não há SLA formal. O painel mede o tempo de primeira resposta e o de
  resolução, que servem de base para defini-lo.
- **Quem aprova ações que afetam produção**: coordenador ou administrador, sempre diferente de quem
  propôs. A marcação de ação sensível fica em `src/lib/execution/catalog.ts`.
