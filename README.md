# BarberVP

> Fonte de verdade técnica: **[`agentes/SPEC.md`](agentes/SPEC.md)**.
> Estado entre sessões: [`agentes/CONTEXT.md`](agentes/CONTEXT.md).
> Execução do kit multi-agente: [`agentes/00-guia-de-uso.md`](agentes/00-guia-de-uso.md).
> Deploy de produção: [`docs/DEPLOY.md`](docs/DEPLOY.md).
> Plugar WhatsApp/Asaas de verdade: [`docs/INTEGRACOES.md`](docs/INTEGRACOES.md).

## Rodando o projeto

```bash
make env        # cria .env a partir de .env.example
make install    # pnpm install no monorepo
make up         # db + redis + api + web (docker compose)
make migrate    # aplica as migrations (inclui a EXCLUDE anti double-booking)
make seed       # popula os 2 tenants com os dados do SPEC
```

| Serviço | URL |
|---|---|
| API (`/api/v1`) | http://localhost:3333/api/v1 |
| Swagger | http://localhost:3333/api/docs |
| Health | http://localhost:3333/api/v1/health |
| Landing de vendas | http://localhost:3000/ |
| Booking público | http://localhost:3000/{slug} (raiz: `/agendar`) |
| Dashboard da barbearia | http://localhost:3000/app |
| Super Admin | http://localhost:3000/admin |

Desde a fase 11 é **um frontend só** (`apps/web`): as quatro superfícies são
prefixos de rota do mesmo app Next. Em produção o `middleware.ts` resolve cada
host (`barbervp.com`, `agendar.`, `app.`, `admin.`) para o seu prefixo, e
`/admin/*` só responde no host do admin. Em desenvolvimento o prefixo é digitado
direto na URL, sem host nenhum configurado.

`make help` lista todos os alvos (`down`, `logs`, `reset`, `test`,
`test-isolation`, `psql`, ...).

### Verificando

```bash
make test            # unitários (81)
make test-e2e        # e2e contra o banco real (129)
make test-isolation  # GATE de isolamento de tenant (106) — reprovou, não fecha
make lint typecheck  # 11/11
make build           # 3/3, inclusive o standalone do `apps/web`
make build-web       # build isolado do frontend (é o que a Vercel roda)
make build-api       # build isolado do backend (é o que a Railway roda)
```

Varredura responsiva (Chrome de verdade, 5 tamanhos, nas 4 superfícies — precisa
do `web` e da `api` no ar):

```bash
make responsive
# o dashboard dispara muitas consultas por tela — dê folga ao rate limit:
node scripts/responsive-sweep.mjs --app=dashboard --delay=6000
```

### Filas

Quatro filas BullMQ (`apps/api/src/queue/`): `outbox` (lembretes e e-mail, a
cada 60s), `subscriptions`, `billing` e `maintenance` (diárias). O super admin
acompanha em `/admin/filas` e vê o que os adapters geraram em `/admin/mensagens`.
`QUEUE_WORKERS_ENABLED=false` separa réplica de web de réplica de worker
usando a mesma imagem — ver [`docs/DEPLOY.md`](docs/DEPLOY.md).

### Layout do monorepo

```
apps/api          NestJS 10 + Prisma + Postgres 16 + Redis
apps/web          Next.js 14 — as 4 superfícies, uma por route group:
                    app/(marketing)/      /  ·  /entrar  /cadastro  /recuperar-senha   (SEO)
                    app/(booking)/        /{slug}  ·  /agendar                          (SEO)
                    app/(dashboard)/app/  painel da barbearia                           (noindex)
                    app/(admin)/admin/    super admin do SaaS                           (noindex)
packages/config   tsconfig base + preset Tailwind (tokens do design system)
packages/types    enums, contratos e tipos compartilhados api ↔ web
packages/ui       cliente HTTP, provider do TanStack Query, primitivas de UI
```

## O que é este projeto

BarberVP é um SaaS multi-tenant de gestão de barbearias. **Não é um MVP** — é um
produto profissional de mercado, com quatro superfícies: site institucional de
vendas do SaaS, booking público + área do cliente, dashboard da barbearia e
super admin da plataforma. Este bundle contém as 12 telas exportadas do Claude
Design que serviram de protótipo visual e funcional; ele foi lido por completo
e o resultado da leitura está consolidado em `agentes/SPEC.md`.

## Como ler este bundle

| # | Arquivo | Superfície | O que extrair |
|---|---|---|---|
| 1 | `BarberVP Vendas.dc.html` | site | Landing, planos do SaaS (Essencial/Profissional/Avançado), copy, FAQ |
| 2 | `BarberVP Cadastro Estabelecimento.dc.html` | site | Fluxo de cadastro do tenant, vínculo com conta de cliente existente |
| 3 | `BarberVP Login Estabelecimento.dc.html` | site | Login owner/staff |
| 4 | `BarberVP Configurar Barbearia.dc.html` | dashboard | Onboarding pós-cadastro (wizard de 6 passos) |
| 5 | `Agendamento Publico.dc.html` | booking | Página pública da barbearia (por slug) |
| 6 | `AgendamentoWizard.dc.html` | booking | Wizard de 4 passos: serviço → barbeiro → data/hora → confirmação. **Fonte de verdade de serviços, preços, durações e barbeiros** |
| 7 | `ClienteAuth.dc.html` | booking | Login/registro do cliente + verificação por OTP |
| 8 | `MinhaConta.dc.html` | booking | Conta do cliente: agendamentos, assinatura, dados, segurança, notificações |
| 9 | `AssinaturaCliente.dc.html` | booking | Detalhe do plano de assinatura, pagamento (cartão/Pix), sucesso |
| 10 | `Dashboard.dc.html` | dashboard | TODOS os módulos internos (arquivo grande, ~570KB) — fonte de verdade do dashboard |
| 11 | `DashboardFuncionario.dc.html` | dashboard | Visão restrita do barbeiro (própria agenda/comissões) |
| 12 | `CadastroFuncionario.dc.html` | dashboard | Aceite de convite de equipe → criação de senha |

Ignore a pasta `uploads/` (duplicatas dos mesmos arquivos) e `screenshots/`
(referência visual apenas). Os arrays de dados hardcoded nos `.dc.html`
(serviços, barbeiros, planos, clientes, comandas...) viram `seed.ts` do
Prisma — **nunca** constantes no frontend real.

## Design system real

Duas identidades visuais coexistem no bundle — ver decisão em `agentes/SPEC.md`:

- **Tema de produto (dashboard/booking/onboarding/auth — 9 das 12 telas):**
  fundo `#0F1115` / `#12151A` / `#181B21` / `#1F232B` (cards) / bordas
  `#2A2F38`; dourado `#D4A84C` → `#E6BE66`; sucesso `#3FB68B`; erro `#E05B5B`
  (`#E5484D` nos sheets do cliente); info `#5B8DE0`; alerta `#E8A13C`; texto
  `#F2F3F5` / `#9AA1AC` / `#5B616B`. Fontes **Sora 700** (títulos) + **Inter
  400–700** (corpo). Tema escuro fixo.
- **Tema editorial (Vendas/Cadastro/Login Estabelecimento/CadastroFuncionario):**
  mesmo dourado (`#D4A24A`/`#ECC46B`), mas título em **Playfair Display**
  itálico serifado sobre fundo `#0E1013`. `Vendas.dc.html` ainda inclui um
  seletor de 4 paletes (`Light SaaS`, `Creme + Dourado`, `Dark Leve`, `Branco +
  Acento`) — artefato de exploração de design, não o produto final.

Decisão tomada para a build real: **unificar tudo no tema de produto**
(`#0F1115` + Sora/Inter), inclusive a landing de vendas, mantendo o toque editorial
(Playfair Display) apenas como opção tipográfica de destaque em headlines,
não como sistema de cor paralelo. Detalhe completo em `agentes/SPEC.md`.

## Regra-mestre

Fidelidade visual (cores/fontes/hierarquia/espaçamento relativo) +
responsividade obrigatória. Os `.dc.html` são desktop-fixos (ou sheets
mobile-first isolados, no caso do booking) — todo layout deve ser
reconstruído mobile-first e funcionar de 360px a 1920px. Ver
`agentes/SPEC.md` → Design system, e as 6 regras invioláveis abaixo.

## Regras invioláveis (repetir em toda sessão de agente)

1. **Responsividade obrigatória** — 360px a 1920px, sem scroll horizontal, tabelas viram cards no mobile.
2. **Zero dado mockado no frontend** — todo dado vem da API; os arrays dos `.dc.html` viram `seed.ts`.
3. **Isolamento de tenant é sagrado** — `tenantId` em todo modelo de negócio, guard global, suíte de testes de isolamento como gate de aceite.
4. **Regras de negócio estruturais, não cosméticas** — anti double-booking via `EXCLUDE` no Postgres, débito de assinatura atômico, fechamento de comanda em transação única, gates de feature por plano server-side.
5. **Integrações externas atrás de adapters** — WhatsApp e Asaas com drivers mock completos; plugar o real depois não pode exigir refatoração.
6. **Segurança de produção desde o início** — validação em todo endpoint, helmet, CORS, rate limit, bcrypt/argon2, JWT curto + refresh httpOnly, RBAC, auditoria, LGPD.

## Fonte de verdade técnica

`agentes/SPEC.md` é a fonte de verdade técnica completa (stack, modelo de
dados, design system real, papéis, convenções). Estado do projeto entre
sessões: `agentes/CONTEXT.md`. Como executar o kit: `agentes/00-guia-de-uso.md`.
