# Stack fixa do BarberVP (não rediscutir com o usuário)

## Monorepo

- **pnpm + Turborepo**
- `apps/api` — NestJS
- `apps/site` — Next.js 14 (App Router) — institucional/vendas
- `apps/booking` — Next.js 14 (App Router) — booking público + área do cliente
- `apps/dashboard` — Next.js 14 (App Router) — dashboard da barbearia
- `apps/admin` — Next.js 14 (App Router) — super admin
- `packages/ui` — design system compartilhado (React + Tailwind, tokens do protótipo)
- `packages/types` — tipos/DTOs/enums compartilhados (gerados a partir do schema + Zod)
- `packages/config` — eslint, tsconfig, tailwind preset compartilhados

## Backend — NestJS

- **NestJS 10 + TypeScript strict**
- **Prisma ORM + PostgreSQL 16**
- **Redis + BullMQ** — filas (notificações, lembretes de agendamento, jobs de billing)
- **Auth**: JWT access curto (15min) + refresh em cookie httpOnly com rotação;
  argon2 para hash; OTP de 6 dígitos com expiração e rate limit para cliente guest
- **RBAC**: guards NestJS por papel + `TenantGuard` global (extrai tenant do
  token/slug e injeta no request; repositórios sempre filtram por `tenantId`)
- **Validação**: DTOs com class-validator em TODO endpoint; whitelist +
  forbidNonWhitelisted no ValidationPipe global
- **Segurança**: helmet, CORS por app (origens explícitas), rate limit
  (@nestjs/throttler, mais agressivo em auth/OTP), auditoria (tabela AuditLog)
- **Docs**: OpenAPI/Swagger gerado, com tags por módulo
- **Logs**: pino (nestjs-pino), requestId, sem dados sensíveis
- **Testes**: Jest — unit nos services de regra de negócio, e2e (supertest)
  nos fluxos críticos, e a **suíte de isolamento de tenant** (gate de aceite)

## Frontend — Next.js 14 (as 4 apps)

- App Router, TypeScript strict
- **Tailwind CSS** com preset compartilhado (tokens reais do protótipo)
- **TanStack Query v5** — todo data fetching; nada de dado hardcoded
- **Zustand** — estado global leve (sessão, toasts, carrinho da comanda)
- **React Hook Form + Zod** — todos os formulários, schemas em `packages/types`
- **Axios** — cliente HTTP com interceptors (refresh automático, tenant header)
- SEO: metadata API do Next em `site` e `booking`; `dashboard`/`admin` com noindex
- Acessibilidade: foco visível, aria em modais/drawers, contraste do tema escuro

## Infra

- **Docker Compose** dev: `db` (postgres:16), `redis`, `api`, e as 4 apps web;
  healthchecks; volumes nomeados
- `docker-compose.prod.yml` + Dockerfiles multi-stage
- `.env.example` completo na raiz + por app; validação de env com Zod/joi no boot
- `Makefile`: up/down/logs/migrate/seed/reset/test/test-isolation
- CI mínimo (GitHub Actions): lint + typecheck + testes + build

## Integrações (adapters — drivers mock nesta fase)

| Interface | Driver atual | Futuro |
|---|---|---|
| `NotificationAdapter` (sendBookingConfirmation, sendReminder, sendOtp...) | `MockNotificationDriver` (loga + persiste em tabela NotificationOutbox) | WhatsApp API |
| `PaymentAdapter` (createCharge, createSubscription, cancelSubscription, webhooks) | `MockPaymentDriver` (simula ciclos, permite aprovar/recusar via admin) | Asaas |
| E-mail transacional | `MockMailDriver` (outbox) | Resend/SES |

Regra: nenhum módulo de negócio importa driver — só a interface. Trocar
driver = mudar 1 binding no módulo, zero refatoração.
