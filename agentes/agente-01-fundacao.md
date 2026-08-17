# Agente 01 — Fundação

Projeto: **BarberVP** — SaaS multi-tenant de gestão de barbearias. NÃO é
MVP: qualidade, segurança e responsividade de produto profissional desde
esta primeira fase.

## Leia primeiro

1. `agentes/CONTEXT.md` — estado atual (nenhuma dependência, é a primeira fase)
2. `agentes/SPEC.md` — inteiro (é curto), especialmente Stack, Modelo de
   dados e Regras invioláveis
3. Não precisa ler nenhum `.dc.html` nesta fase — infraestrutura pura

## Regras invioláveis (valem nesta sessão)

1. Responsividade obrigatória em todo frontend (360px–1920px).
2. Zero dado mockado no frontend — dados hardcoded viram `seed.ts`.
3. Isolamento de tenant é sagrado — a ESTRUTURA nasce aqui, mesmo sem auth real ainda.
4. Regras de negócio estruturais (não cosméticas) — a constraint anti double-booking é criada nesta fase via migration SQL manual.
5. Integrações externas atrás de adapters, com drivers mock completos.
6. Segurança de produção desde o início — helmet, CORS, rate limit, ValidationPipe global já nesta fase.

## Sua tarefa nesta sessão

Escopo: infraestrutura que **todas** as fases seguintes usam. NÃO entra:
nenhuma tela de produto, nenhum endpoint de negócio além de `/health`.

### Monorepo
- pnpm + Turborepo com `apps/api`, `apps/site`, `apps/booking`,
  `apps/dashboard`, `apps/admin`, `packages/ui`, `packages/types`,
  `packages/config`.
- `.gitignore`, `.env.example` completo na raiz + por app, `Makefile`
  (`up down logs migrate seed reset test test-isolation`), README raiz
  apontando para `agentes/SPEC.md`.

### Docker Compose
- Dev: `postgres:16` (healthcheck), `redis`, `api`, as 4 webs — volumes
  nomeados.
- `docker-compose.prod.yml` + Dockerfiles multi-stage para cada app.

### NestJS skeleton (`apps/api`)
- Config module com validação de env via Zod/joi.
- pino logger (nestjs-pino), sem dados sensíveis nos logs, interceptor de
  `requestId`.
- `ValidationPipe` global (`whitelist: true`, `forbidNonWhitelisted: true`).
- helmet, CORS por origem explícita (uma por app), `@nestjs/throttler`
  (mais agressivo depois em auth/OTP, na fase 03).
- Filtro global de exceções → formato de erro `{ code, message, details? }`
  (convenção do `SPEC.md`).
- Swagger com tags por módulo.
- `GET /health` — checa conexão com Postgres e Redis.

### TenantGuard + decorators
- Extração de tenant (JWT ou slug em rotas públicas) — ainda sem auth real
  (stub que a fase 03 completa), mas a ESTRUTURA de isolamento nasce aqui:
  `TenantGuard` global, `@CurrentTenant()`, `@Roles()`.

### Prisma — schema completo
Ler `agentes/SPEC.md` → Modelo de dados (é o resumo autoritativo; ele já
lista os campos reais extraídos do bundle). Modelar:

- **Globais**: `Tenant`, `SaasPlan`, `TenantSubscription`, `User` +
  `Membership`, `Client`, `AuditLog`, `NotificationOutbox`, `MailOutbox`.
- **Por tenant**: `Barber`, `Service`, `BarberService`, `WorkSchedule` (com
  `lunchStart`/`lunchEnd` e flag de folga/férias) + `ScheduleException`,
  `Appointment` (`timeRange` do tipo `tstzrange` para o EXCLUDE), `ClientPlan`
  + `ClientSubscription` + `SubscriptionUsage`, `LoyaltyProgram` +
  `LoyaltyPoints` + `LoyaltyRaffle`/`LoyaltyRaffleEntry`, `Product`, `Order`
  + `OrderItem` + `Payment`, `CommissionRule` (tipo FIXED ou TIERED, com
  faixas) + `CommissionEntry`, `Vale`, `CashRegister`/`CashMovement`,
  `AccountPayable`/`AccountReceivable` + `BankAccount`, `TenantSettings`,
  `WhatsappAutomationConfig`, `Unit`.
- Money sempre `Int` centavos. Datas UTC. `deletedAt` nas entidades com
  histórico financeiro (`Order`, `Payment`, `CommissionEntry`).
- Índice composto `(tenantId, ...)` nas consultas quentes (`Appointment` por
  data, `Client` por telefone, `Order` por status).

### Migration SQL manual (anti double-booking)

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "Appointment" ADD CONSTRAINT no_double_booking
EXCLUDE USING gist (
  "barberId" WITH =,
  "timeRange" WITH &&
) WHERE (status NOT IN ('CANCELED', 'NO_SHOW'));
```

### Seed (`seed.ts`) — dados REAIS do `SPEC.md`

- 2 tenants: `barbearia-central` (demo completo) e um segundo tenant vazio
  só para a suíte de isolamento.
- Tenant demo: nome "Barbearia Central", horário Seg–Sex 09:00–20:00, Sáb
  09:00–18:00, Dom fechado.
- Barbeiros: **Carlos Silva** (Fade), **Rafael Souza** (Barba clássica),
  **Diego Alves** (Cortes modernos — único que atende Pigmentação), **Bruno
  Costa** (Navalha).
- Serviços (nome / duração / preço em centavos): Corte Masculino 45min
  4500 · Barba 30min 3500 · Corte + Barba 70min 7000 · Sobrancelha 15min
  2000 · Pigmentação 40min 6000 · Corte Infantil 30min 3500 · Relaxamento
  50min 5500.
- `BarberService`: todos os 4 barbeiros atendem todos os serviços, exceto
  Pigmentação (só Diego Alves).
- Planos do SaaS: Essencial R$49 (2 barbeiros) · Profissional R$89 (4
  barbeiros) · Avançado R$139 (ilimitado) — com `features Json` seguindo o
  mapa de `SPEC.md` → Feature flags. Tenant demo no plano Profissional.
- Planos de assinatura do cliente: Corte Semanal R$120 (4× Corte Masculino)
  · Corte + Barba Quinzenal R$150 (2× Corte Masculino + 2× Barba) · Clube
  Completo R$220 (4× Corte Masculino + 4× Barba), cobrança dia 5.
- Alguns clientes, agendamentos e comandas de exemplo coerentes entre si
  (pode se inspirar no volume de `Dashboard.dc.html`, sem compromisso de
  serem idênticos).

### Esqueleto da suíte de isolamento
Helper de teste que cria os 2 tenants e afirma que consultas de um nunca
retornam dados do outro. Roda vazia agora (sem casos ainda) — cada fase
seguinte adiciona os seus.

### Frontends (as 4 apps)
Bootar Next.js 14 App Router com o preset Tailwind de `packages/config`
(tokens do tema de produto — ver `SPEC.md` → Design system: cores, Sora +
Inter), página placeholder por app, cliente axios + provider do TanStack
Query em local compartilhado (`packages/ui` ou lib comum).

## Critérios de aceite

- `make up` sobe tudo limpo (db, redis, api, 4 webs).
- `GET /health` retorna 200 e reflete conexão real com db + redis.
- `make seed` popula os 2 tenants com os dados acima.
- As 4 apps renderizam placeholder com o tema escuro correto (fundo
  `#0F1115`, dourado `#D4A84C`, Sora/Inter carregadas).
- `make test-isolation` roda e passa (verde, vazio — sem casos ainda).
- Migration da `EXCLUDE constraint` aplicada e testável manualmente (inserir
  2 appointments sobrepostos para o mesmo barbeiro deve falhar no banco).

## Ao finalizar

Atualizar `agentes/CONTEXT.md`: marcar fase 01 ✅ (só se todos os critérios
acima estiverem verdes), listar endpoints criados (`GET /health`), registrar
decisões técnicas tomadas (ex.: nome final de algum enum, se divergiu do
`SPEC.md`) e quaisquer dívidas técnicas novas.
