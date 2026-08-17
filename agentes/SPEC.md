# BarberVP — SPEC

Fonte de verdade técnica do projeto. Todo agente lê este arquivo antes de
começar. Enxuto por design: para enums/campos exatos de seed, ler os
`.dc.html` indicados — este documento resume, não duplica os dados linha a
linha.

## O que é

SaaS multi-tenant de gestão de barbearias. Quatro superfícies: site de vendas
do SaaS, booking público + área do cliente, dashboard da barbearia (dono,
gerente, barbeiro), super admin da plataforma. **Não é MVP** — produto
profissional, com segurança, responsividade e regras de negócio corretas
desde a fase 01.

## Stack (fixa — não rediscutir)

- **Monorepo**: pnpm + Turborepo — `apps/api` (NestJS), `apps/site`,
  `apps/booking`, `apps/dashboard`, `apps/admin` (Next.js 14 App Router
  cada), `packages/ui`, `packages/types`, `packages/config`.
- **Backend**: NestJS 10 + TS strict, Prisma + PostgreSQL 16, Redis + BullMQ,
  JWT access 15min + refresh httpOnly rotativo, argon2, OTP 6 dígitos,
  `TenantGuard` global, class-validator + ValidationPipe (whitelist +
  forbidNonWhitelisted), helmet, CORS por origem, `@nestjs/throttler`,
  Swagger, pino, Jest (unit + e2e + suíte de isolamento).
- **Frontend** (as 4 apps): TypeScript strict, Tailwind com preset
  compartilhado (tokens reais abaixo), TanStack Query v5, Zustand, React
  Hook Form + Zod, Axios com interceptors (refresh automático, tenant
  header). `site`/`booking` com SEO; `dashboard`/`admin` com noindex.
- **Infra**: Docker Compose dev (db/redis/api/4 webs, healthchecks),
  `docker-compose.prod.yml` + Dockerfiles multi-stage, `.env.example` +
  validação de env no boot, `Makefile` (up/down/logs/migrate/seed/reset/
  test/test-isolation), CI mínimo (lint + typecheck + test + build).
- **Adapters (drivers mock nesta fase)**: `NotificationAdapter` (WhatsApp →
  `MockNotificationDriver`, loga + persiste em `NotificationOutbox`),
  `PaymentAdapter` (Asaas → `MockPaymentDriver`, simula ciclos, aprovação/
  recusa manual via admin), e-mail transacional (`MockMailDriver` →
  `MailOutbox`). Nenhum módulo de negócio importa driver concreto, só a
  interface.

Detalhe completo em `references/stack.md` da skill.

## Superfícies, apps e telas do bundle

| Superfície | App | Telas do bundle | SEO |
|---|---|---|---|
| Site institucional/vendas | `apps/site` (SSR/SSG) | Vendas, Cadastro Estabelecimento, Login Estabelecimento | Sim |
| Booking público + área do cliente | `apps/booking` (rota `/{slug}`) | Agendamento Publico, AgendamentoWizard, ClienteAuth, MinhaConta, AssinaturaCliente | Sim |
| Dashboard da barbearia | `apps/dashboard` (CSR-heavy) | Configurar Barbearia (onboarding), Dashboard, DashboardFuncionario, CadastroFuncionario | Não |
| Super Admin do SaaS | `apps/admin` (CSR) | Sem tela no bundle — seguir o design system | Não |

## Design system

Ver decisão em README.md: unificar no **tema de produto**.

- **Cores**: fundo `#0F1115` (base) / `#12151A` / `#181B21` / `#1F232B`
  (cards, sheets do cliente) / `#20242C` (surface-3 do onboarding) — bordas
  `#2A2F38` / `#343B46`. Dourado `#D4A84C` → hover `#E6BE66`. Sucesso
  `#3FB68B`. Erro `#E05B5B` (produto) / `#E5484D` (sheets do cliente — usar
  um único token `--red` na build real). Info `#5B8DE0`. Alerta `#E8A13C`.
  Texto `#F2F3F5` (primário) / `#9AA1AC` (secundário) / `#5B616B` (mudo).
- **Fontes**: **Sora** peso 700 para títulos, **Inter** 400–700 para corpo e
  UI. O tema editorial do site (Playfair Display itálico) pode ser mantido
  como opção tipográfica de destaque em headlines de marketing, mas a
  paleta de cor é sempre a do produto — não os 4 temas alternativos que
  `Vendas.dc.html` expõe (`Light SaaS`/`Creme + Dourado`/`Dark Leve`/
  `Branco + Acento`; artefato de exploração, ignorar).
- **Animações reais** (portar como keyframes no preset Tailwind):
  `bvpFade`, `bvpUp`, `bvpPop`, `bvpGlow` (pulso no ícone de boas-vindas do
  onboarding), `bvpRing`/`bvpCheck` (check de conclusão do onboarding),
  `bvpInLeft`, `bvpRise`, `bvpFloat`, `bvpFadeBg` (telas de auth do site),
  `toastIn`/`wizToastIn`/`authToastIn`/`contaToastIn`/`assinToastIn`
  (padrão de toast — unificar em um único componente `Toast`),
  `successPop`/`checkDraw` (confirmação de sucesso — reusar em booking,
  registro de cliente e assinatura), `otpShake` (erro no código OTP).
- **Ícones**: SVGs inline no protótipo (outline, stroke-based) — portar como
  componentes React em `packages/ui`, não trocar por lib de terceiros
  (lucide etc.) para manter fidelidade visual exata.
- Tema escuro em todas as superfícies, sem alternância claro/escuro no
  produto real (a alternância vista em `Vendas.dc.html` não é feature do
  produto).

## Modelo de dados

Base conceitual em `references/data-model.md` da skill — usar como ponto de
partida do schema Prisma, mas **os campos/enums abaixo são os REAIS,
extraídos do bundle**, e têm prioridade sobre qualquer exemplo genérico do
template.

**Globais (sem `tenantId`)**: `Tenant` (slug, nome, timezone, status
TRIAL/ACTIVE/SUSPENDED/CANCELED, planId), `SaasPlan`, `TenantSubscription`,
`User` (login de estabelecimento) + `Membership` (userId, tenantId, role
OWNER/MANAGER/BARBER), `Client` (telefone como identidade, nome, email,
verificação OTP), `AuditLog`, `NotificationOutbox`/`MailOutbox`.

**Por tenant**: `Barber`, `Service`, `BarberService`, `WorkSchedule` (por dia
da semana, com **intervalo de almoço** `lunchStart`/`lunchEnd` e marcação de
**folga/férias**, conforme visto na Equipe do dashboard) +
`ScheduleException`, `Appointment` (origem PUBLIC/DASHBOARD, status
SCHEDULED/CONFIRMED/DONE/NO_SHOW/CANCELED, `subscriptionUsageId?`),
`ClientPlan` (planos de assinatura vendidos pela barbearia) +
`ClientSubscription` + `SubscriptionUsage` (débito atômico), `LoyaltyProgram`
(pontos: `gastoPorPonto`, `pontosParaDesconto`, `valorDesconto`, expiração em
meses) + `LoyaltyPoints` + `LoyaltyRaffle`/`LoyaltyRaffleEntry` (sorteios —
tela Dashboard tem aba dedicada, ativos e encerrados com vencedor), `Product`
(estoque com `estoqueMin` para alerta), `Order`/Comanda (desconto
percentual/fixo, resgate de pontos de fidelidade `useLoyalty`, split de
pagamento `Dividir` entre métodos) + `OrderItem` + `Payment`,
`CommissionRule` (tipo `FIXED` % único, ou `TIERED` faixas por faturamento —
ex. até R$5000 → 40%, até R$8000 → 45%, acima → 50%) + `CommissionEntry`,
`Vale` (adiantamento ao barbeiro, descontado da comissão do mês),
`CashRegister`/`CashMovement` (abrir com saldo inicial, fechar com valor
conferido — conferência de caixa), `AccountPayable`/`AccountReceivable`
(categoria, fornecedor/cliente, parcela, vencimento, status
pago/pendente/vencido/recebido) + `BankAccount`, `TenantSettings` (horário
por dia, `bloquearFaltasQtd` — padrão 3 faltas bloqueiam agendamento online,
`antecedenciaMinima`, política de cancelamento, branding da página pública:
slug, sobre, Instagram, toggles de seções visíveis), `WhatsappAutomationConfig`
(templates parametrizados por evento: lembrete, confirmação, cancelamento,
aniversário, reativação, avaliação — com `{nome}`/`{data}`/`{horario}`/
`{servico}`/`{barbeiro}`/`{link_agendamento}`), `Unit` (multi-unidade,
Avançado apenas).

**Feature flags do SaaS (`SaasPlan.features Json`) — mapa real extraído do
Dashboard**:

| Feature | Tier mínimo |
|---|---|
| `contasPagarReceber`, `vales`, `comissoes`, `fidelidadePontos`, `fidelidadeSorteios`, `whatsappCompleto`, `relatoriosAvancados` | Profissional (1) |
| `fidelidadeAssinaturas`, `multiUnidades`, `calculadoraPreco` | Avançado (2) |

`maxBarbeiros`: Essencial 2, Profissional 4, Avançado ilimitado. Gate
**sempre server-side** (403 no endpoint) — o frontend só espelha com
upsell discreto (`openUpgradeModal`), nunca é a única barreira.

### Constraints críticas

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "Appointment" ADD CONSTRAINT no_double_booking
EXCLUDE USING gist (
  "barberId" WITH =,
  "timeRange" WITH &&
) WHERE (status NOT IN ('CANCELED', 'NO_SHOW'));
```

- Débito de assinatura: `UPDATE ... SET used = used + 1 WHERE id = $1 AND used < quota RETURNING *` — 0 linhas ⇒ recusar.
- Fechamento de comanda: `prisma.$transaction` — valida soma dos pagamentos
  (incluindo split), baixa estoque de produtos, gera `CommissionEntry` por
  regra do barbeiro, marca `Appointment` DONE, debita `SubscriptionUsage` se
  coberto, credita pontos de fidelidade (`Math.round(subtotal)` no
  protótipo — ajustar pela config `gastoPorPonto` real).

### Seed (dados REAIS do bundle)

- **Serviços** (fonte: `AgendamentoWizard.dc.html`, é o catálogo canônico
  usado tanto no booking público quanto na assinatura do cliente): Corte
  Masculino 45min R$45 · Barba 30min R$35 · Corte + Barba 70min R$70 (combo
  automático quando os dois primeiros são selecionados juntos) · Sobrancelha
  15min R$20 · Pigmentação 40min R$60 · Corte Infantil 30min R$35 ·
  Relaxamento 50min R$55.
- **Barbeiros do tenant demo** (fonte canônica: `AgendamentoWizard.dc.html`/
  `Agendamento Publico.dc.html` — usar estes, não os nomes que aparecem como
  mock interno em `Dashboard.dc.html`/`DashboardFuncionario.dc.html`, que
  são fixtures de UI independentes e inconsistentes entre si): **Carlos
  Silva** (especialidade Fade, 4.9★), **Rafael Souza** (Barba clássica,
  4.8★), **Diego Alves** (Cortes modernos, 5.0★, único que atende
  Pigmentação), **Bruno Costa** (Navalha, 4.7★).
- **Planos do SaaS** (fonte: `BarberVP Vendas.dc.html`): Essencial R$49 (até
  2 barbeiros) · Profissional R$89 "★ Mais popular" (até 4 barbeiros) ·
  Avançado R$139 (ilimitado). Ver features por tier acima.
- **Planos de assinatura do cliente** (fonte: `AssinaturaCliente.dc.html`):
  Corte Semanal R$120/mês (4× Corte Masculino) · Corte + Barba Quinzenal
  R$150/mês "Mais popular" (2× Corte Masculino + 2× Barba) · Clube Completo
  R$220/mês (4× Corte Masculino + 4× Barba). Cobrança todo dia 5.
- 1 tenant demo `barbearia-central` (nome "Barbearia Central", horário
  Seg–Sáb 09:00–20:00/18:00 sáb, fechado domingo) + 1 tenant secundário só
  para a suíte de isolamento.
- Clientes, agendamentos e comandas de exemplo coerentes — usar os nomes e
  valores de `CLIENTS_ALL`/`APPOINTMENTS_DAY`/`COMANDAS_OPEN` de
  `Dashboard.dc.html` como inspiração de volume/realismo, sem compromisso de
  serem idênticos.

## Papéis e permissões (RBAC)

| Papel | Acesso |
|---|---|
| `SUPER_ADMIN` | `apps/admin` — tenants, planos do SaaS, billing, impersonar OWNER (com auditoria) |
| `OWNER` | Dashboard completo conforme plano contratado |
| `MANAGER` | Dashboard completo exceto configurações de billing/plano do SaaS |
| `BARBER` | `DashboardFuncionario`: própria agenda, próprias comissões, comandas que atende |
| `CLIENT` | Global na plataforma, com perfil por barbearia (`ClientProfile`) |

## Regras invioláveis

1. **Responsividade obrigatória** — os `.dc.html` de dashboard/site são
   desktop-fixos (as telas de booking/auth/assinatura já são sheets
   mobile-first no protótipo, mas ainda assim precisam de breakpoint
   desktop). Reconstruir mobile-first, 360px–1920px, ver
   `references/responsividade.md` da skill.
2. **Zero dado mockado no frontend** — todo array hardcoded dos `.dc.html`
   vira `seed.ts`, nunca constante no cliente.
3. **Isolamento de tenant é sagrado** — `tenantId` em todo modelo de
   negócio, `TenantGuard` global, suíte de isolamento como gate de aceite.
4. **Regras de negócio estruturais, não cosméticas** — anti double-booking
   via `EXCLUDE`, débito de assinatura atômico, fechamento de comanda em
   transação única, gates de feature por plano sempre server-side.
5. **Integrações externas atrás de adapters** — WhatsApp e Asaas com
   drivers mock completos e funcionais; trocar por real = 1 binding, zero
   refatoração de módulo de negócio.
6. **Segurança de produção desde o início** — validação em todo endpoint,
   helmet, CORS restrito, rate limit, bcrypt/argon2, JWT curto + refresh
   httpOnly, RBAC por papel, auditoria de ações sensíveis, LGPD
   (consentimento, exportação e exclusão de dados do cliente — **não
   visível na UI do protótipo**, implementar mesmo assim por exigência
   legal; ver decisão em `CONTEXT.md`).

## Decisões tomadas na leitura do bundle

- **Design system unificado no tema de produto** (`#0F1115` + Sora/Inter)
  para as 4 apps, ignorando o seletor de 4 paletes de `Vendas.dc.html` e a
  identidade Playfair Display separada do site — ver seção Design system.
- **Barbeiros seed = os 4 do booking** (Carlos Silva, Rafael Souza, Diego
  Alves, Bruno Costa), não os nomes-mock do dashboard interno, que divergem
  entre `Dashboard.dc.html` e `DashboardFuncionario.dc.html` e servem só de
  fixture de tela.
- **Guest booking**: o protótipo do wizard (`AgendamentoWizard.dc.html`,
  passo 4) coleta nome + WhatsApp do visitante e confirma **sem** exigir OTP
  ali — a verificação OTP só aparece no fluxo completo de criação de conta
  (`ClienteAuth.dc.html`). Mantemos a regra do `system-map.md` (OTP para
  guest booking) por segurança/anti-spam, mas o rate limit deve ser
  calibrado para não adicionar fricção onde o protótipo mostra fluxo
  direto — ex.: permitir guest booking sem OTP para o primeiro agendamento
  por telefone, e exigir OTP a partir de padrões suspeitos (mesmo IP/
  telefone repetido). Documentar a decisão final tomada pelo agente 04 em
  `CONTEXT.md`.
- **Toast e modais de sucesso**: 5 variações quase idênticas de animação de
  toast (`toastIn`/`wizToastIn`/`authToastIn`/`contaToastIn`/`assinToastIn`)
  e de tela de sucesso (`successPop`+`checkDraw`) aparecem repetidas em
  telas diferentes do protótipo — consolidar num único componente `Toast` e
  `SuccessScreen` em `packages/ui` (agente 02), não portar 5 versões.

## Convenções

- API REST `/api/v1`, JSON, erros no formato `{ code, message, details? }`.
- Money sempre `Int` em centavos; datas em UTC; timezone por tenant.
- Nomes de schema em inglês; toda UI em pt-BR.
- Commits convencionais; branch por agente opcional.

## Fora de escopo desta fase

WhatsApp real (API oficial), gateway Asaas real (cobranças/webhooks),
qualquer outro gateway de pagamento externo. Interfaces + drivers mock
completos prontos para troca futura.
