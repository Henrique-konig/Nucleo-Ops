# Plantão — central de operações para TI

Central onde a equipe de TI recebe chamados, organiza tarefas e deixa agentes de IA
cuidarem da triagem e das respostas repetitivas, com registro de cada ação.

Este repositório está na **fase 1 (Fundação)** do cronograma: repositório, autenticação,
banco no Neon com Prisma e o quadro de tarefas. O modelo de dados já cobre todas as
entidades do planejamento, para que as próximas fases não exijam reestruturação.

## O que já funciona

- **Login** por e-mail e senha (Auth.js), com sessão em JWT e usuário relido do banco a cada
  requisição — desativar alguém ou mudar o papel vale na hora.
- **Papéis**: Solicitante, Técnico, Coordenador, Administrador e Auditor
  (`src/lib/permissions.ts`), verificados no servidor em toda operação.
- **Quadro de tarefas**: colunas personalizáveis (criar, renomear, reordenar, excluir vazias),
  cartões com responsável, prazo, etiquetas e checklist; arrastar e soltar; cartões são
  arquivados, nunca apagados.
- **Tempo real** sem serviço externo: triggers no Postgres fazem `pg_notify` a cada mudança no
  quadro e o servidor repassa aos navegadores por Server-Sent Events. Medido em ~0,3 s entre
  duas sessões (requisito: até 2 s).
- **Auditoria** (RF-08): toda alteração grava um registro em `Action` na mesma transação, com
  quem fez e o que mudou (valor anterior e novo). A tabela é append-only no banco.
- **Acessibilidade**: cartões focáveis, `Alt` + setas move o cartão focado entre colunas e
  posições, anúncios por `aria-live`, foco visível e diálogo nativo.

## Stack

| Camada | Escolha |
| --- | --- |
| Frontend | Next.js 16 (App Router), React 19, Tailwind 4 |
| Banco | PostgreSQL no Neon, com pgvector |
| ORM | Prisma 7 — `@prisma/adapter-neon` no Neon, `@prisma/adapter-pg` fora dele |
| Autenticação | Auth.js (next-auth v5) |
| Tempo real | Postgres `LISTEN/NOTIFY` + SSE |
| Testes | Vitest (unidade e integração contra Postgres real) |

## Regras no banco (SQL bruto na migração)

O Prisma não expressa estas regras, então elas ficam em `prisma/migrations/*_init/migration.sql`:

- **Unicidade de chamado por canal**: índice único parcial em `(teamId, channel, externalId)`
  quando há identificador externo — o mesmo e-mail ou evento de webhook não gera dois chamados.
- **Log imutável**: trigger bloqueia `UPDATE`, `DELETE` e `TRUNCATE` em `Action`.
- **Um autor por ação**: `CHECK` exige exatamente um entre `agentId` e `userId`.
- **pgvector**: extensão, coluna `Document.embedding vector(1024)` (`Unsupported("vector")` no
  schema) e índice HNSW por distância de cosseno. Buscas usam `$queryRaw`.
- **Tempo real**: triggers de `pg_notify('plantao_board', boardId)` em cartões, colunas e checklist.

> Atenção: o Prisma não conhece o índice HNSW. Ao gerar uma nova migração com
> `prisma migrate dev --create-only`, apague a linha `DROP INDEX "Document_embedding_idx"`
> se ela aparecer.

## Rodando localmente

Requisitos: Node 22+ e um Postgres 16 com pgvector (local ou um branch do Neon).

```bash
npm install
cp .env.example .env        # preencha DATABASE_URL, DIRECT_URL, AUTH_SECRET e INTEGRATION_ENCRYPTION_KEY
npx prisma migrate deploy
npm run db:seed             # equipe "TI", um usuário por papel e o quadro "Atendimento"
npm run dev
```

Usuários do seed (senha `plantao-dev`, ou a definida em `SEED_PASSWORD`):
`admin@`, `coordenador@`, `tecnico@`, `solicitante@` e `auditor@plantao.local`.

Para Postgres local com Docker: `docker run -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=plantao -p 5432:5432 pgvector/pgvector:pg16`.

### Neon e Vercel

- `DATABASE_URL`: URL **com pooling** (`-pooler`), usada pela aplicação.
- `DIRECT_URL`: URL **direta**, usada pelas migrações e pelo `LISTEN` do tempo real
  (o pooler em modo transação não mantém `LISTEN`).
- Com a integração Neon + Vercel, cada pull request ganha um branch do banco; rode
  `prisma migrate deploy` no build de preview.
- Na Vercel, a conexão SSE é encerrada no limite de duração da função (`maxDuration = 300`) e o
  navegador reconecta sozinho; a interface mostra o estado da conexão.

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Gera o cliente Prisma e faz o build |
| `npm run typecheck` | Gera os tipos de rota do Next e roda o `tsc` |
| `npm test` | Testes; os de integração rodam quando `DATABASE_URL` está definida |
| `npm run db:migrate` | Cria e aplica migrações em desenvolvimento |
| `npm run db:seed` | Dados iniciais (idempotente) |

## Estrutura

```
prisma/
  schema.prisma            modelo de dados completo
  migrations/              migração inicial + regras em SQL bruto
  seed.ts
src/
  auth.ts                  Auth.js (credenciais, JWT, papel e equipe na sessão)
  lib/
    boards.ts              regras do quadro: permissão, equipe, transação e auditoria
    permissions.ts         papéis × permissões
    audit.ts               registro de ações
    realtime.ts            LISTEN/NOTIFY compartilhado por instância
    ordering.ts            posições fracionárias para ordenar sem reescrever a lista
    crypto.ts              AES-256-GCM para configurações de integração
  app/
    (app)/boards/[boardId] página do quadro e server actions
    api/boards/[boardId]/events  SSE
  components/board/        quadro, cartão e checklist
test/                      testes de integração
```

## Próximas fases

| Fase | Entregas |
| --- | --- |
| 2. Entrada de chamados | Formulário, e-mail, criação automática de cartões |
| 3. Triagem e pesquisa | Agente de triagem, base de conhecimento, busca semântica |
| 4. Atendimento | Chatbot de primeiro nível, Slack ou Teams |
| 5. Execução e controle | Agente de execução, tela de auditoria, gestão de usuários e permissões |
| 6. Visibilidade | Painel de indicadores e resumos automáticos |

Questões em aberto que afetam as próximas fases: primeiro canal de entrada, provedor de IA (e
de embeddings — a coluna está dimensionada para 1024), Microsoft 365 ou Google Workspace, SLA por
prioridade e quem aprova ações de execução em produção.
