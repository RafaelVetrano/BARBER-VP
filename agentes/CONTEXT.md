# BarberVP — CONTEXT (memória entre sessões)

Atualizado por último: 2026-08-16 — fase 06 (Dashboard I) concluída

## Status das fases

| # | Fase | Status |
|---|---|---|
| 01 | Fundação | ✅ |
| 02 | Design system | ✅ |
| 03 | Auth & Tenancy | ✅ |
| 04 | Booking público | ✅ |
| 05 | Área do cliente | ✅ |
| 06 | Dashboard I | ✅ |
| 07 | Dashboard II | ⬜ |
| 08 | Super Admin | ⬜ |
| 09 | Integrações & Hardening (GATE) | ⬜ |

(⬜ pendente · 🟨 em andamento · ✅ concluída — só marcar ✅ com critérios de
aceite verdes; NUNCA avançar com a fase anterior quebrada)

## Endpoints existentes

| Método | Rota | Auth | Tenant | Observações |
|---|---|---|---|---|
| GET | `/api/v1/health` | pública | não exige | Ping real em Postgres e Redis; 200 se ambos up, 503 se algum down. Fora do rate limit. |

### Auth de estabelecimento (`/api/v1/auth`) — fase 03

Todas `@TenantOptional()`: o tenant destas rotas nasce do login, nunca de header.

| Método | Rota | Auth | Rate limit | Observações |
|---|---|---|---|---|
| POST | `/auth/check-email` | pública | 20/min | `available` \| `establishment` \| `client` — os 3 estados do campo de e-mail do cadastro. |
| POST | `/auth/register` | pública | 5/h | `User`+`Tenant`(TRIAL)+`Membership` OWNER+`TenantSettings`+7 `TenantBusinessHour`+`Barber` do dono, em UMA transação. 201. |
| POST | `/auth/register/link` | pública | 5/h | Vincula conta de `Client` existente (confirma senha atual). 201. |
| POST | `/auth/login` | pública | 10/min | Aceita `tenantId` opcional para quem tem N barbearias. |
| POST | `/auth/refresh` | cookie | 60/min | Rotaciona; reuso do token antigo revoga a família inteira. |
| POST | `/auth/logout` | opcional | — | Revoga a sessão e limpa o cookie. 204. |
| GET | `/auth/me` | Bearer | — | Usuário + `memberships[]` com `onboardingDone`/`onboardingStep`. |
| POST | `/auth/context` | Bearer | — | **Seletor de contexto**: emite par novo apontando para outra barbearia. |
| POST | `/auth/password/change` | Bearer | 5/min | Derruba as demais sessões; mantém a atual. 204. |
| POST | `/auth/password/forgot` | pública | 5/15min | 202 sempre — não revela se o e-mail existe. Envia por `MailOutbox`. |
| POST | `/auth/password/reset` | pública | 10/15min | Token do e-mail; derruba TODAS as sessões. 204. |

### Auth do cliente (`/api/v1/client-auth`) — fase 03

| Método | Rota | Auth | Rate limit | Observações |
|---|---|---|---|---|
| POST | `/client-auth/login` | pública | 10/min | Campo único: telefone **ou** e-mail. |
| POST | `/client-auth/register` | pública | 5/15min | **Não cria a conta** — valida, guarda o cadastro pendente e dispara o OTP. 202. |
| POST | `/client-auth/otp/verify` | pública | 15/5min | Cadastro → sessão; recuperação → `resetToken`. |
| POST | `/client-auth/otp/resend` | pública | 10/15min | Cooldown de 59s (429 `OTP_COOLDOWN` com `retryInSeconds`). |
| POST | `/client-auth/otp/call` | pública | 5/15min | "Receber por chamada" — stub, registra a intenção no outbox. |
| POST | `/client-auth/password/forgot` | pública | 5/15min | Desafio de fachada quando não há conta (ver decisões). |
| POST | `/client-auth/password/reset` | pública | 10/15min | Token de uso único. 204. |
| POST | `/client-auth/refresh` · `/logout` | cookie | 60/min | Cookie e audience próprios. |
| GET | `/client-auth/me` | Bearer | — | `@Roles('CLIENT')`. |

### Onboarding (`/api/v1/onboarding`) — fase 03

`@Roles('OWNER','MANAGER')`; tenant SEMPRE do `@CurrentTenant()` (JWT).
Todo `PUT` devolve o `OnboardingState` completo.

| Método | Rota | Observações |
|---|---|---|
| GET | `/onboarding` | Estado do wizard — permite retomar de onde parou. |
| GET | `/onboarding/slug?slug=` | Disponibilidade do link público, com sugestão. |
| GET | `/onboarding/cep/:cep` | Proxy da ViaCEP com cache no Redis (30 dias). 30/min. |
| PUT | `/onboarding/profile` | Passo 1 — nome, telefone, Instagram, descrição (200 chars). |
| PUT | `/onboarding/location` | Passo 2 — endereço estruturado + linha única renderizada. |
| PUT | `/onboarding/identity` | Passo 3 — logo, capa, slug (pulável). |
| PUT | `/onboarding/services` | Passo 4 — `Service` em lote (sumiu = soft delete). |
| PUT | `/onboarding/team` | Passo 5 — `Barber` em lote (pulável); o dono é preservado. |
| PUT | `/onboarding/business-hours` | Passo 6 — `TenantBusinessHour` + propaga para `WorkSchedule`. |
| POST | `/onboarding/complete` | Marca `onboardingDoneAt`. |

### Booking público (`/api/v1/public/:slug`) — fase 04

Todas `@Public()` — mas **não** `@TenantOptional()`: o `:slug` da rota é o que
resolve a barbearia, e todo serviço filtra por `@CurrentTenant('id')`. Nenhuma
aceita `tenantId` no corpo ou na query. O token, quando existe, é lido mesmo
assim (acende o selo de assinatura e liga o agendamento à conta).

| Método | Rota | Rate limit | Observações |
|---|---|---|---|
| GET | `/public/:slug` | global | Página inteira numa resposta: serviços, equipe, planos, avaliações, horário, política. |
| GET | `/public/:slug/quote` | global | Aplica o combo, precifica, marca cobertura de assinatura e diz quem atende (com o motivo de quem não atende). |
| GET | `/public/:slug/availability` | 60/min | Chips de dia (com "sem vagas"), horários do dia por período e atalho do próximo dia livre. |
| POST | `/public/:slug/appointments` | 30/h (env) | Cliente logado ou visitante. `201` com `kind: 'confirmed'` ou `'otp-required'`. `409 DOUBLE_BOOKING` se o horário foi tomado. |
| POST | `/public/:slug/appointments/confirm` | 15/5min | Fecha o guest booking verificado (código de 6 dígitos). |
| GET | `/public/:slug/appointments/:code` | 20/min | Consulta pelo código; visitante prova com o telefone. |
| POST | `/public/:slug/appointments/:code/cancel` | 20/min | Respeita `TenantSettings.cancelamentoHoras` e devolve o uso da assinatura. |
| POST | `/public/:slug/appointments/:code/reschedule` | 20/min | Revalida a grade e passa de novo pela EXCLUDE. |

Swagger em `http://localhost:3333/api/docs` (tags já registradas para os
módulos das fases seguintes).

### "Meus dados" e LGPD (`/api/v1/client-auth`) — fase 05

Globais (`@TenantOptional()`, como o resto de `client-auth`) — o perfil, a
senha e os dados exportados são do cliente, não de uma barbearia.

| Método | Rota | Auth | Rate limit | Observações |
|---|---|---|---|---|
| PATCH | `/client-auth/me` | `@Roles('CLIENT')` | — | Nome, e-mail, `notifyWhatsapp`/`notifyEmail`. |
| POST | `/client-auth/me/phone` | `@Roles('CLIENT')` | 5/15min | Inicia a troca de telefone — dispara `OtpPurpose.CLIENT_PHONE_CHANGE`. |
| POST | `/client-auth/me/phone/confirm` | `@Roles('CLIENT')` | 15/5min | Confirma com o código; sincroniza `ClientProfile.phone` em TODAS as barbearias do cliente. |
| POST | `/client-auth/password/change` | `@Roles('CLIENT')` | 5/min | Senha atual como prova; derruba as demais sessões (mesmo padrão do painel). 204. |
| GET | `/client-auth/me/export` | `@Roles('CLIENT')` | — | JSON completo (LGPD) — perfil, agendamentos, assinaturas e avaliações de TODAS as barbearias. |
| POST | `/client-auth/me/delete` | `@Roles('CLIENT')` | 5/h | Anonimiza (`name`/`phone`/`email`/`passwordHash`), preserva `Order`/`Payment`. 204. |

### Agendamentos e assinatura do cliente (`/api/v1/public/:slug/account`) — fase 05

Tenant do `:slug`, como o resto do booking; `@Roles('CLIENT')` em vez de
`@Public()` — exige Bearer. Cancelar/remarcar continuam sendo as MESMAS rotas
da fase 04 (`/public/:slug/appointments/:code/cancel`/`reschedule`), chamadas
pelo cliente logado com o `bookingCode` que esta lista devolve.

| Método | Rota | Rate limit | Observações |
|---|---|---|---|
| GET | `/account/appointments` | — | Próximos (futuro, SCHEDULED/CONFIRMED) e histórico. |
| POST | `/account/appointments/:id/rate` | 20/min | 1–5 estrelas, uma vez por atendimento (`Review.appointmentId` `@unique`). 409 na segunda tentativa. |
| GET | `/account/subscription/plans` | — | 403 `FEATURE_NOT_IN_PLAN` se o tenant não tem `fidelidadeAssinaturas`. |
| GET | `/account/subscription` | — | `{ enabled, subscription, billingHistory }` — nunca lança pelo gate, só `enabled: false`. |
| POST | `/account/subscription` | 10/h | Assina (cartão OU Pix mock, auto-aprovado). 409 se já houver assinatura não cancelada. |
| POST | `/account/subscription/pause` \| `/resume` \| `/cancel` | — | Ver decisões abaixo. |

### Clientes (`/api/v1/clients`) — fase 06

`@Roles('OWNER','MANAGER')` — `BARBER` toma 403 (a visão dele é a própria
agenda, não a base de clientes). Tudo escopado por `@CurrentTenant('id')`.

| Método | Rota | Observações |
|---|---|---|
| GET | `/clients` | Paginado; `search` (nome/telefone/e-mail), `favoriteBarberId`, `blocked`, `sort`/`order`. |
| PATCH | `/clients/:id` | Notas e barbeiro favorito (`ClientProfile`, não `Client`). |
| PATCH | `/clients/:id/block` \| `/unblock` | Bloqueia/libera o agendamento online deste cliente NESTA barbearia. |

### Serviços & Produtos (`/api/v1/services`, `/api/v1/products`) — fase 06

`@Roles('OWNER','MANAGER')`. É o MESMO `Service`/`Product` que o booking
público e o motor de disponibilidade leem — editar aqui muda a vitrine na
hora, sem sincronização à parte.

| Método | Rota | Observações |
|---|---|---|
| GET \| POST | `/services` | Paginado (`search`/`category`/`active`); criar sincroniza `BarberService`. |
| PATCH | `/services/:id` | Atualiza campos + `barberIds` (substitui a lista). |
| PATCH | `/services/:id/activate` \| `/deactivate` | Some do booking, mantém histórico (nunca hard-delete — `Appointment`/`Order` referenciam). |
| GET \| POST | `/products` | Paginado (`search`/`category`/`active`/`lowStock`); `lowStock` compara `stock` com `estoqueMin` (filtro em memória — Prisma não expressa comparação entre duas colunas em `where`). |
| PATCH | `/products/:id` \| `/:id/activate` \| `/:id/deactivate` | Idem serviços. |

### Equipe (`/api/v1/barbers`, `/api/v1/team/invites`, `/api/v1/staff-invites`) — fase 06

`/barbers` e `/team/invites` são `@Roles('OWNER','MANAGER')`. `/staff-invites/*`
é `@Public()` + `@TenantOptional()` — quem ainda não tem sessão nenhuma só tem
o token do e-mail.

| Método | Rota | Observações |
|---|---|---|
| GET \| POST | `/barbers` | Lista o time (grid); `POST` adiciona barbeiro SEM login, copiando `TenantBusinessHour` para o `WorkSchedule` dele. Gate `maxBarbeiros` do plano. |
| PATCH | `/barbers/:id` | Nome/especialidade/contato/`serviceIds`/`active`. Barbeiro-dono não pode ser desativado. |
| GET \| PUT | `/barbers/:id/work-schedule` | Escala semanal (7 dias, com intervalo de almoço e `isDayOff`). |
| GET \| POST | `/barbers/exceptions` | Folga avulsa/férias/feriado — `barberId` nulo = barbearia inteira. |
| DELETE | `/barbers/exceptions/:id` | Remove a exceção. |
| GET \| POST | `/team/invites` | Lista/convida por e-mail com serviços pré-marcados e dias de trabalho. Gate `maxBarbeiros` (conta ativos + convites `PENDING`). |
| POST | `/team/invites/:id/resend` \| `/revoke` | Reenvio gera token novo (o antigo perde validade); revogação é definitiva. |
| GET | `/staff-invites/:token` | Preview público — e-mail travado, serviços, dias, `valid`/`invalidReason`. |
| POST | `/staff-invites/accept` | `{ token, password }` → cria `User` (se preciso) + `Membership` BARBER + `Barber` + `WorkSchedule` + `BarberService`, e já devolve sessão logada (mesmo formato do login). |

### Agenda interna (`/api/v1/staff-agenda`) — fase 06

`@Roles('OWNER','MANAGER','BARBER')` — MESMO endpoint para `Dashboard` e
`DashboardFuncionario`; `StaffScopeService` resolve `forcedBarberId` a partir
de `(tenantId, userId)` e o serviço filtra por dentro. `BARBER` pedindo
`barberId` de outro no `GET` tem o parâmetro silenciosamente ignorado (a
resposta só mostra a própria coluna); tentando **criar/mover/cancelar** um
agendamento de outro barbeiro toma 403 — é esse o caso coberto pelo critério
de aceite "BARBER tentando acessar agenda de outro barbeiro".

| Método | Rota | Observações |
|---|---|---|
| GET | `/staff-agenda` | `date`+`view` (`DAY`\|`WEEK`\|`TIMELINE` — `TIMELINE` usa a mesma forma de `DAY`, o front é que desenha diferente) `+barberId` opcional. |
| POST | `/staff-agenda` | Cria pelo staff — cliente cadastrado OU walk-in (`guestName`/`guestPhone`). Reusa `AvailabilityService`/`CatalogService`/`SubscriptionCoverageService` da fase 04; `origin: DASHBOARD`. |
| PATCH | `/staff-agenda/:id/move` | Remarca (novo horário e/ou barbeiro), revalida a grade. |
| PATCH | `/staff-agenda/:id/cancel` | Cancela e devolve uso de assinatura, se houver. |

## O que a fase 01 entregou

- **Monorepo** pnpm + Turborepo: `apps/api`, `apps/site`, `apps/booking`,
  `apps/dashboard`, `apps/admin`, `packages/config`, `packages/types`,
  `packages/ui`. `Makefile` com `up/down/logs/migrate/seed/reset/test/
  test-isolation` (+ `env`, `install`, `lint`, `typecheck`, `psql`, `sh`).
- **Docker**: `docker-compose.yml` (postgres 16 + redis + api + 4 webs, todos
  com healthcheck) e `docker-compose.prod.yml` com Dockerfile multi-stage por
  app (`apps/*/Dockerfile`) + `Dockerfile.dev` compartilhado.
- **API NestJS**: config validada por Zod no boot, pino com redaction de
  campos sensíveis, `RequestIdInterceptor`, `ValidationPipe` global
  (`whitelist` + `forbidNonWhitelisted`), helmet, CORS por origem explícita,
  `@nestjs/throttler`, filtro global de exceções no contrato
  `{ code, message, details? }`, Swagger.
- **Isolamento**: `TenantGuard` global + `RolesGuard`, decorators
  `@CurrentTenant()`, `@CurrentUser()`, `@Roles()`, `@Public()`,
  `@TenantOptional()`.
- **Prisma**: 41 modelos, migration inicial com a EXCLUDE anti double-booking
  e mais 7 constraints estruturais. Seed com os dados reais do `SPEC.md`.
- **Adapters**: `NotificationAdapter`/`MailAdapter`/`PaymentAdapter` com
  drivers mock completos, ligados por factory em `AdaptersModule`.
- **Frontends**: as 4 apps Next.js 14 App Router no tema de produto, com
  provider do TanStack Query e cliente axios compartilhados em `packages/ui`.

Contas de desenvolvimento criadas pelo seed (senha `BarberVP@2026`):
`admin@barbervp.com.br` (SUPER_ADMIN) · `dono@barbeariacentral.com.br` (OWNER)
· `gerente@barbeariacentral.com.br` (MANAGER) ·
`carlos@barbeariacentral.com.br` (BARBER).

## O que a fase 02 entregou

- **`packages/config/tokens.js`** (+ `.d.ts`): paleta bruta em JS puro, fonte
  única de cor do projeto. `tailwind-preset.js` monta o tema a partir daqui;
  os 4 `app/layout.tsx` importam `@barbervp/config/tokens` para o
  `viewport.themeColor`, então nenhum hex de marca mora fora deste arquivo
  (`@barbervp/config` migrou de `devDependencies` para `dependencies` nas 4
  apps por causa desse import em tempo de build).
- **Preset Tailwind revisado**: cores relidas contra os `.dc.html` (ver
  decisões abaixo), `borderRadius.control` (10px, controles), `boxShadow`
  ampliado (`card`/`sheet`/`modal`/`menu`/`toast`/`gold`),
  `transitionTimingFunction.sheet` (a curva `cubic-bezier(.32,.72,0,1)` das
  sheets), e as 13 keyframes do SPEC com valores conferidos um a um contra o
  bundle (não só os nomes — duração, delay e curva).
- **Ícones** (`packages/ui/src/icons`): ~30 componentes SVG outline portados
  path por path dos `.dc.html` (nav do dashboard, check, chevron, olho
  mostrar/ocultar, cadeado, kebab, busca, spinner) + `EmptyCalendarArt`
  (ilustração de "sem horários" da `MinhaConta`). API com prop `size` (não
  `width`/`height` soltos) — os 2 ícones da fase 01 (`api-status.tsx`,
  `placeholder-screen.tsx`) foram ajustados para o novo contrato.
- **Formulário**: `Button`/`IconButton` (variantes primary/outline/ghost/
  danger + loading/disabled), `Field` (moldura label+erro+hint reaproveitada
  por todos os campos), `Input`, `Textarea`, `Select`, `OtpInput` (6 caixas,
  auto-advance, paste, shake), `PasswordInput` (toggle + força de 4 barras,
  exporta `passwordStrength`/`isPasswordValid`), `Checkbox`/`Radio`/`Switch`.
- **Overlays**: `Modal`/`Drawer` compartilhando um `OverlayRoot` único —
  bottom-sheet < 768px, modal centrado/drawer lateral ≥ 768px, tudo via
  classes `md:` do Tailwind (sem `ResizeObserver`/`window.innerWidth`, ver
  decisão abaixo); hooks reutilizáveis em `lib/use-overlay.ts`
  (`useScrollLock`, `useFocusTrap`, `useEscapeKey`, `useMountTransition`,
  `useIsMounted`). `Toast`/`ToastProvider`/`useToast` (fila, portal, pílula
  única). `SuccessScreen` (círculo dourado + check animado + resumo +
  código).
- **Estrutura e conteúdo**: `Card`/`CardHeader`, `Badge`/`StatusPill` +
  `AppointmentStatusPill` (ligado ao enum real `AppointmentStatus` de
  `@barbervp/types`, não string solta), `Tabs`/`TabPanel` (roláveis no
  mobile, variantes `underline`/`segmented`), `Menu` (kebab acessível),
  `ResponsiveTable` (tabela ≥ `md`, cards com papéis
  `title`/`subtitle`/`meta` < `md`), `EmptyState`, `Skeleton`/
  `SkeletonGroup`, `Avatar` (+ `initialsOf`), `StatCard` (com sparkline
  SVG).
- **Agenda**: `DayPill`/`DatePicker` (chips de dia, ponto de "sem vagas"),
  `TimeChip`/`TimeSlotGrid` (grade por período + esqueleto de carregamento).
- **`AppShell`**: sidebar fixa colapsável ≥ `lg`, drawer sobreposto < `lg`
  com foco preso/scroll lock/ESC, topbar com busca e ações.
- **Playground**: rota `/playground` em `apps/dashboard` (não Storybook —
  ver decisão abaixo) com todos os primitives, mais `/playground/shell` para
  o `AppShell` (que precisa da viewport inteira). Alterna 360/768/1440px
  recarregando a mesma rota dentro de um `<iframe>` daquela largura exata
  (`?frame=1`), não `transform: scale`.

## O que a fase 03 entregou

- **Modelos novos** (`migration 20260815120000_auth_tenancy`): `AuthSession`
  (refresh rotativo, com família), `OtpCode` (código do cliente + cadastro
  pendente + token de troca), `PasswordResetToken` (link por e-mail do painel).
  Enums `TokenAudience`, `OtpPurpose`, `OtpChannel`. Campos novos:
  `Client.userId`/`email @unique`/`emailVerifiedAt`/`lastLoginAt`,
  `TenantSettings.address*` (endereço estruturado) + `onboardingStep`/
  `onboardingDoneAt`. `NotificationOutbox.tenantId` virou nullable.
  3 CHECK à mão: `auth_session_subject`, `otp_attempts_within_max`,
  `onboarding_step_bounds`.
- **Auth de estabelecimento**: registro (transação única), vínculo de conta de
  cliente, login, refresh rotativo com detecção de reuso, logout, `/me`,
  seletor de contexto, troca e recuperação de senha.
- **Auth do cliente**: login por telefone ou e-mail, registro com OTP, reenvio
  com cooldown, "receber por chamada" (stub), recuperação pelo mesmo desafio.
- **RBAC real**: `JwtAuthGuard` global **antes** do `TenantGuard` na cadeia de
  `APP_GUARD` — é ele quem preenche `request.principal`, de onde o tenant sai.
  `AuthPrincipal` ganhou `activeTenantId`, `audience` e `sessionId`.
- **Onboarding**: os 6 passos, retomáveis, + proxy de CEP com cache.
- **`AuditLog`** em login, login falho, logout, troca/recuperação de senha,
  reuso de sessão, criação e vínculo de tenant, troca de contexto, alterações
  de `TenantSettings` e conclusão do onboarding (`AuditAction` em
  `src/audit/audit.service.ts`).
- **`packages/types`**: `auth.ts` e `onboarding.ts` — as regras que precisam dar
  o MESMO resultado nos dois lados (senha, telefone, slug, e-mail) e os
  contratos de resposta. O `PasswordInput` de `packages/ui` passou a reexportar
  `isPasswordValid`/`passwordStrength` daqui em vez de ter cópia própria.
- **`packages/ui/src/auth/`**: `EstablishmentAuthProvider`/`ClientAuthProvider`
  (token em memória + refresh silencioso no mount), `auth-api.ts` tipado,
  `RequireEstablishmentAuth`, máscaras de digitação.
- **Frontends**: `apps/site` com `/entrar`, `/cadastro` (incluindo o card de
  vínculo) e `/recuperar-senha`; `apps/dashboard` com `/configurar` (wizard de
  6 passos) e `/selecionar-barbearia`; `apps/booking` com o `ClienteAuth` como
  sheet reutilizável; `middleware.ts` nas 4 apps.
- **Testes**: 34 unitários, 28 e2e (`test/auth.e2e-spec.ts`) e 11 de isolamento
  (`test/isolation/auth-tenancy.isolation-spec.ts`, com app real e token real).
- **Dependências novas**: `@nestjs/jwt` + `cookie-parser` na API;
  `react-hook-form` + `@hookform/resolvers` + `zod` nas 4 apps web.

## O que a fase 04 entregou

- **Modelos novos** (`migration 20260816000000_booking_public`):
  `ServiceComboPart` (composição dos combos), `AppointmentService` (seleção
  múltipla do wizard, com preço e duração fotografados na reserva), `Review`
  (as avaliações da página pública). Campos novos: `Appointment.bookingCode`
  (`@@unique([tenantId, bookingCode])`), `NotificationOutbox.scheduledFor`,
  `TenantSettings.slotIntervalMin`/`lembrete1Horas`/`lembrete2Horas`. Valor novo
  no enum `OtpPurpose`: `GUEST_BOOKING`. 6 CHECK à mão
  (`tenant_settings_slot_interval_bounds`, `tenant_settings_reminder_bounds`,
  `service_combo_part_not_self`, `service_combo_part_quantity_positive`,
  `appointment_service_price_non_negative`, `appointment_service_duration_positive`,
  `review_rating_bounds`). A migration faz backfill: toda linha antiga de
  `Appointment` ganhou a sua `AppointmentService` e um `bookingCode`.
- **`common/utils/timezone.ts`** — conversão relógio-de-parede ↔ instante via
  `Intl`, sem dependência nova. **Resolve a dívida da fase 01** do offset fixo
  de -3h: o offset passa a ser perguntado data a data, então horário de verão
  volta a funcionar sozinho (coberto por teste com `America/New_York`).
- **Motor de disponibilidade** (`availability.service.ts`): cruza
  `TenantBusinessHour` + `WorkSchedule` (com almoço) + `ScheduleException`
  (do barbeiro e da casa) + agendamentos ativos + duração somada da seleção +
  `slotIntervalMin` + `antecedenciaMinima`, no fuso do tenant. Devolve os 14
  dias com contagem de vagas (para o ponto de "sem vagas" do chip), os horários
  do dia escolhido já com o período (MANHÃ/TARDE/NOITE) e o próximo dia livre.
- **Catálogo** (`catalog.service.ts`): combo automático e compatibilidade
  barbeiro↔serviço, com o motivo textual de cada bloqueio.
- **Agendamento** (`appointments.service.ts`): criação por cliente logado ou
  visitante, cancelamento e remarcação pelo código da reserva, débito atômico de
  assinatura, `ClientProfile` sincronizado na escrita, e a EXCLUDE
  `no_double_booking` traduzida em `409 DOUBLE_BOOKING` com texto de gente.
- **OTP condicional do guest booking** (`guest-risk.service.ts`) — ver decisão.
- **Notificações** (`booking-notifications.service.ts`): confirmação imediata +
  dois lembretes agendados, saindo pelo `NotificationAdapter` com os templates
  de `WhatsappAutomationConfig`. Cancelar ou remarcar derruba o lembrete velho.
- **`packages/types/src/booking.ts`**: contratos da página, da grade, da cotação
  e do agendamento, mais as regras que os dois lados precisam compartilhar
  (faixa do dia, `formatDuration`, limiar de "últimos horários").
- **`apps/booking`**: rota `/{slug}` (componente de servidor, com metadata
  dinâmica e JSON-LD de `HairSalon`), `not-found` e `loading` próprios, a página
  pública inteira e o wizard de 4 passos com estados de carregando, vazio, 409 e
  sucesso (com `.ics` e compartilhamento).
- **Seed**: composição do combo Corte + Barba, 5 avaliações do protótipo,
  `bookingCode` determinístico (`AG-S0001`…) e `AppointmentService` em todo
  agendamento semeado.
- **Testes**: 65 unitários (9 novos de timezone, 7 de risco do visitante, 15 de
  janela/combo/código/template), 60 e2e (`test/booking.e2e-spec.ts` com 32
  casos, incluindo a corrida de slot) e 21 de isolamento
  (`test/isolation/booking.isolation-spec.ts`, 9 casos novos).
- **Sem dependência nova** — nem no backend nem no frontend.

## O que a fase 05 entregou

- **Modelos** (`migration 20260816120000_client_area`): `Client.consentVersion`
  (LGPD versionado) + `notifyWhatsapp`/`notifyEmail` (preferências de canal,
  separadas do consentimento — a `MinhaConta` do protótipo já mantinha
  "Notificações" longe de "Segurança"); `Review.appointmentId` (`@unique`,
  liga a nota ao atendimento específico — sem isso não dava para saber o que
  já foi avaliado). Valor novo em `OtpPurpose`: `CLIENT_PHONE_CHANGE`.
  `ClientPlan`/`ClientSubscription`/`SubscriptionUsage` já existiam desde a
  fase 01/04; esta fase só liga a ESCRITA (assinar/pausar/reativar/cancelar/
  renovar) — a leitura de cobertura e o débito atômico já eram da fase 04
  (`SubscriptionCoverageService`, inalterado).
- **`auth/client-auth.service.ts` ganhou "Meus dados" e LGPD**: `updateProfile`,
  `requestPhoneChange`/`confirmPhoneChange` (OTP, mesmo desafio do registro),
  `changePassword`, `exportData`, `requestDeletion` — endpoints em
  `client-auth.controller.ts` (ver tabela acima).
- **Módulo novo `client-account`** (`apps/api/src/client-account/`):
  - `ClientAppointmentsService` — lista Próximos/Histórico do cliente NESTA
    barbearia e grava a avaliação; reusa `isWithinChangeWindow` do
    `booking/appointments.service.ts` (função pura exportada, não o serviço
    inteiro — o módulo não depende do `BookingModule`).
  - `ClientSubscriptionService` — vitrine de planos (com economia calculada),
    assinar (cobra via `PAYMENT_ADAPTER`, cria `ClientSubscription` +
    `SubscriptionUsage` zerado em transação), pausar, reativar, cancelar,
    `renewCycle` (cobra de novo e abre período novo — chamado tanto pelo job
    quanto por `resume` quando o ciclo pausado já venceu).
  - `SubscriptionRenewalService.runOnce()` — a "lógica de renovação testável
    isoladamente" do SPEC; sem BullMQ real ainda (mesma dívida do lembrete de
    agendamento da fase 04), mas pronta para o `@Cron`/worker da fase 09
    chamar sem mudar uma linha.
- **`packages/types/src/client-account.ts`** (novo): contratos de
  `MinhaConta`/`AssinaturaCliente`. `auth.ts` ganhou `CURRENT_TERMS_VERSION`
  e `AuthClient.notifyWhatsapp`/`notifyEmail`.
- **`apps/booking`**: `components/minha-conta/` (sheet com as 3 abas reais —
  Agendamentos com sub-abas Próximos/Histórico e avaliação por estrelas,
  Assinatura condicionada ao gate, Meus dados com edição campo a campo, troca
  de telefone com OTP embutido, senha, notificações, exportar dados,
  excluir conta) e `components/assinatura-cliente/` (detalhe → pagamento →
  sucesso, reaproveitável dos dois pontos de entrada: vitrine da página
  pública e aba "Assinatura" sem plano). `RescheduleDialog` novo — reusa
  `DatePicker`/`TimeSlotGrid` do design system fora do wizard. O selo
  "Incluído na assinatura" do wizard **já existia desde a fase 04**
  (`step-services.tsx` já lia `coveredBySubscription` da cotação); esta fase
  só fez esse selo passar a refletir uma assinatura de verdade.
- **Testes**: 15 unitários novos (débito atômico e ciclo de vida da
  assinatura com Prisma/`PaymentAdapter` mockados, renovação em lote, regras
  de avaliação), 18 e2e (`test/client-account.e2e-spec.ts` — inclui o caso
  central do critério de aceite: três reservas do MESMO serviço disparadas
  juntas contra uma quota de 2 debitam no máximo 2, nunca 3) e 4 de
  isolamento (`test/isolation/client-account.isolation-spec.ts` — um cliente
  global com histórico em duas barbearias, provando que `MinhaConta` aberta
  pelo slug A nunca mostra assinatura/agendamento do slug B; a exportação
  LGPD, ao contrário, é global de propósito — ver decisão). Total do projeto:
  80 unit + 78 e2e + 25 isolamento, todos verdes.
- **Sem dependência nova** — nem no backend nem no frontend.

## O que a fase 06 entregou

- **Modelos** (`migration 20260816150000_staff_management`, escrita à mão pelo
  mesmo motivo de sempre — o diff bruto mexe na coluna GERADA
  `Appointment.timeRange`): `ClientProfile.favoriteBarberId` (barbeiro
  favorito da tela Clientes) e `StaffInvite` (convite de funcionário — e-mail,
  telefone, `serviceIds`/`workDays` pré-marcados, `tokenHash` no MESMO padrão
  HMAC do `PasswordResetToken`, ciclo `PENDING → ACCEPTED/EXPIRED/REVOKED`).
  Todo o resto do schema desta fase (`Barber`, `Service`, `Product`,
  `WorkSchedule`, `ScheduleException`, `BarberService`) **já existia desde a
  fase 01** — esta fase só escreveu os endpoints em cima.
- **Módulos novos** (`apps/api/src/`): `clients/` (CRUD de `ClientProfile`),
  `catalog-admin/` (CRUD de `Service`/`Product` — nome separado de
  `booking/catalog.service.ts`, que é o motor de leitura pública, para não
  misturar escrita administrativa com o caminho quente do booking),
  `team/` (`BarbersService` — CRUD + escala + exceções; `InvitesService` —
  convite/reenvio/revogação/preview/aceite; `PlanLimitsService` — gate de
  `maxBarbeiros` server-side, `null` durante TRIAL porque a contratação de
  plano é fase 07/08), `staff-agenda/` (`StaffAppointmentsService` reusando
  literalmente `AvailabilityService`/`CatalogService`/
  `SubscriptionCoverageService` do `BookingModule`; `StaffScopeService`
  resolve o recorte do papel `BARBER`).
- **`EstablishmentAuthService` ganhou `issueSessionForUser`** (método
  público de 3 linhas em cima do `issueForUser` privado que já existia) —
  o aceite de convite de equipe emite sessão pelo MESMO caminho do
  login/registro, sem duplicar a lógica de `roles`/claims. `AuthModule` passou
  a exportar `EstablishmentAuthService` e `RefreshCookieService` por isso.
- **`packages/types/src/management.ts`** (novo): todos os contratos da
  operação diária — `ClientListItem`, `ServiceListItem`/`ProductListItem`,
  `BarberListItem`/`WorkScheduleDay`/`ScheduleExceptionItem`,
  `StaffInviteListItem`/`StaffInvitePreview`, `StaffAgendaResponse`/
  `StaffAppointmentItem`. `enums.ts` ganhou `StaffInviteStatus`.
- **`apps/dashboard`**: `DashboardChrome` (novo) — casca comum ao `Dashboard`
  e ao `DashboardFuncionario`; **mesmo componente, mesma rota**, só o `nav`
  muda por papel (`lib/nav.ts` → `navForRole`). Rotas novas: `/agenda`
  (dia/semana, colunas por barbeiro, walk-in, mover/cancelar), `/clientes`
  (busca + paginação + drawer de notas/favorito/bloqueio), `/servicos-produtos`
  (abas Serviços/Produtos, CRUD em modal), `/equipe` (grid do time, escala
  semanal, convites pendentes), `/aceitar-convite` (pública, fora do
  `DashboardGuard` — e-mail travado do convite, senha nova, já entra logado).
  `/` virou o resumo real (hoje: agendamentos, faturamento previsto, estoque
  baixo, próximos horários) — antes era o `PlaceholderScreen`.
- **Simplificação assumida no modal de novo agendamento**: o horário digitado
  é interpretado no fuso do NAVEGADOR (`new Date(`${data}T${hora}`)`), não no
  fuso IANA do tenant que a API devolve. Correto sempre que quem opera o
  dashboard está fisicamente na barbearia (o caso real); ver dívida abaixo
  para o caso de operação remota.
- **Testes**: os 80 unitários e 78 e2e das fases anteriores continuam verdes
  (nada quebrou). Isolamento ganhou `test/isolation/dashboard-operation.
  isolation-spec.ts` — 11 casos novos: tenant (Clientes/Serviços/Barbeiros/
  convites de A nunca aparecem em B; mover/cancelar agendamento de B com
  token de A → 404) e papel (`BARBER` toma 403 em Clientes/Serviços/Produtos/
  Equipe/Convites; a agenda pedida por `BARBER` só mostra a própria coluna
  mesmo pedindo `barberId` de outro; criar/mover/cancelar na agenda de outro
  barbeiro → 403; criar na própria agenda funciona). Total do projeto: 80
  unit + 78 e2e + 36 isolamento, todos verdes.
- **Sem dependência nova.**

## Decisões tomadas

- 2026-08-14 — Design system unificado no tema de produto (`#0F1115` +
  Sora/Inter) para as 4 apps — o bundle tem duas identidades visuais
  (produto vs. editorial do site) e um seletor de 4 paletes em
  `Vendas.dc.html` que é artefato de exploração, não produto final. Ver
  `SPEC.md` → Design system.
- 2026-08-14 — Seed de barbeiros usa os 4 nomes canônicos do booking
  (Carlos Silva, Rafael Souza, Diego Alves, Bruno Costa), não os nomes-mock
  do dashboard interno (que divergem entre `Dashboard.dc.html` e
  `DashboardFuncionario.dc.html`). Ver `SPEC.md` → Seed.
- 2026-08-14 — Guest booking sem OTP explícito no protótipo do wizard;
  mantida a exigência de OTP do `system-map.md` por segurança, com
  calibração de rate limit a decidir pelo agente 04. Ver `SPEC.md` →
  Decisões tomadas.

### Fase 06 — decisões técnicas

- **Formato do link de convite**: `{dashboard}/aceitar-convite?token={id}.{segredo}`
  — mesmo par id+segredo do link de recuperação de senha (`PasswordResetToken`),
  mesmo hash HMAC com o pepper do refresh (`hashSecret`/`secretMatches`), TTL
  fixo de 7 dias (`INVITE_TTL_DAYS`, não configurável por env nesta fase — não
  havia pedido de configuração no bundle). Reenviar gera par novo e invalida
  o anterior (não existem dois links válidos ao mesmo tempo para o mesmo
  convite).
- **Convite sempre cria `Barber` com `WorkSchedule` a partir de
  `TenantBusinessHour` + `workDays` escolhidos no convite** (dia fora dos
  `workDays` OU fora do horário de funcionamento vira `isDayOff: true`) — é
  o mínimo para o barbeiro aparecer com agenda utilizável assim que aceita,
  sem precisar passar pela aba Escala antes do primeiro atendimento.
- **`maxBarbeiros` conta ativos + convites `PENDING`** (não só `Barber`
  ativos) — sem isso o dono furaria o limite do plano abrindo N convites
  simultâneos que só colidiriam com o teto no aceite, um por um. Trial
  (`planId` nulo) não tem limite — mesma decisão "trial libera tudo" das
  fases 04/05.
- **Papel `BARBER` no `GET /staff-agenda`**: pedir `barberId` de outro
  barbeiro é IGNORADO (a resposta mostra só a própria coluna), não 403 — um
  403 na leitura revelaria menos que simplesmente devolver o que a pessoa
  pode ver. Já **criar/mover/cancelar** um agendamento de outro barbeiro É
  403 (`StaffScopeService.assertAllowed`), porque aí a intenção é agir sobre
  um recurso alheio, não só consultar. O critério de aceite da fase
  ("BARBER tentando acessar agenda de outro barbeiro → 403") é coberto pelo
  caminho de escrita — documentado explicitamente porque a leitura, de
  propósito, não segue o mesmo caminho.
- **Layout final da Agenda**: dia único (colunas por barbeiro, `grid` que
  empilha < `lg`) é a view padrão e a ÚNICA no mobile — a aba "Semana" fica
  `hidden` abaixo de `lg` no lugar de aparecer e renderizar mal; a visão
  timeline do protótipo (`isTimelineView`) usa a MESMA resposta da API que o
  dia único (`view=TIMELINE` no contrato, mas o backend trata igual a `DAY`
  — quem muda é só o desenho no front, que nesta fase ainda não diferencia
  as duas; ver dívida abaixo).
- **`CatalogAdminModule` é um módulo separado de `booking/catalog.service.ts`**
  de propósito — o de booking é o motor de LEITURA pública (cotação, combo,
  cobertura) que a agenda interna também reusa; misturar CRUD administrativo
  ali acoplaria o caminho quente do booking a validações que só fazem
  sentido no dashboard (nome único, barbeiro pertence ao tenant etc.).

### Fase 05 — decisões técnicas

- **Tenant demo passou de Profissional para Avançado** (`DEMO_PLAN_CODE` em
  `seed-data.ts`). A fase 01 tinha decidido Profissional; mas o seed já
  semeava `ClientPlan`/`ClientSubscription` reais desde então, e a aba
  "Assinatura" da `MinhaConta` só existe com `fidelidadeAssinaturas`
  (Avançado). Deixar o demo no Profissional tornaria o próprio dado semeado
  invisível na tela que existe para mostrá-lo — sem sentido para um ambiente
  de demonstração. `maxBarbeiros` ilimitado do Avançado não muda nada (o
  tenant tem 4).
- **Exportação LGPD SEM botão visível — dívida herdada, resolvida como
  endpoint desde já.** O protótipo (`MinhaConta.dc.html`) só tem "Excluir
  minha conta"; a exportação nunca existiu na tela. Em vez de inventar uma UI
  que o bundle não desenhou, a fase 05 seguiu a segunda opção do enunciado:
  **acrescentou o botão como melhoria sobre o protótipo** — "Exportar meus
  dados" mora na mesma seção que "Excluir minha conta" (Meus dados →
  rodapé), baixa um `.json` no navegador via `Blob`/`<a download>`. Decisão
  de design: texto discreto (`text-fg-muted underline`), não um CTA
  primário — é uma ação rara, e um botão dourado ali competiria com "Sair" e
  "Excluir conta" por atenção que não merece.
- **Exportação é GLOBAL, exclusão é local ao registro global.** A tela abre
  escopada a UMA barbearia (`/{slug}`), mas o `GET /client-auth/me/export`
  não filtra por tenant — traz agendamentos/assinaturas/avaliações de TODAS
  as barbearias do cliente. Não é vazamento cross-tenant (regra 3 protege
  contra um cliente ver o de outro, não contra o titular ver a si mesmo): a
  LGPD (art. 18) dá direito aos PRÓPRIOS dados completos, e o `Client` é uma
  identidade global — exportar só o pedaço de uma barbearia seria uma
  exportação incompleta por escolha de rota, não por exigência legal.
  Coberto por `client-account.isolation-spec.ts`.
- **Exclusão anonimiza, nunca apaga `Order`/`Payment`.** `Client.deletedAt`
  já existia (fase 01) mas nada o usava. `requestDeletion` sobrescreve
  `name`/`email`/`passwordHash`/`birthDate` e troca `phone` por
  `deleted-<id>` (o campo é `@unique`, não dá para deixar vazio) — mas o
  `Client.id` sobrevive intacto, então todo `Order`/`Payment`/`AuditLog` que
  aponta para ele continua íntegro. Consequência testada: o telefone
  original fica livre para um cadastro novo depois da exclusão.
- **Troca de telefone reusa o desafio de OTP do registro** (`OtpPurpose.
  CLIENT_PHONE_CHANGE` novo, mesmo `OtpService`). O telefone é a identidade
  de login do cliente (`Client.phone` `@unique`) — trocá-lo sem prová-lo
  deixaria a conta associada a um número que ninguém verificou, o mesmo
  risco que a fase 03 fechou no registro. **Resolve a dívida da fase 01/03**:
  a confirmação também escreve em TODA `ClientProfile.phone` do cliente (a
  desnormalização por tenant), então a busca `(tenantId, phone)` do
  dashboard nunca fica com um número morto depois da troca.
- **Assinatura aprova a cobrança na hora, sem fila de admin.** O SPEC
  (`stack.md` → Adapters) fala em "aprovação/recusa manual via admin" para o
  `MockPaymentDriver` — mas isso é a fila de cobranças recorrentes do super
  admin (fase 08+), não a primeira contratação: o critério de aceite desta
  fase pede "assinar um plano mock, agendar um serviço coberto, ver o saldo
  decrementar" no MESMO fluxo, e não existe painel de admin ainda para
  aprovar nada. `subscribe()`/`renewCycle()` chamam
  `simulateTransition(PENDING→CONFIRMED→RECEIVED)` no mesmo request.
- **Uma assinatura ativa por barbearia, não por cliente.** `subscribe()`
  recusa (409) se já existe uma `ClientSubscription` com status diferente de
  `CANCELED` para aquele `(tenant, client)`. O protótipo só mostra uma
  (`hasAssinatura` é booleano); nada no SPEC pede múltiplos planos
  simultâneos na mesma casa, e permitir isso multiplicaria a superfície de
  teste (qual plano cobre qual corte?) sem pedido de produto por trás.
- **Reativar com o ciclo vencido dispara `renewCycle` de verdade — reativar
  com o ciclo ainda válido só destrava o status.** "Pausar zera cobrança até
  reativar" (SPEC) não diz o que fazer quando a pausa atravessa a data que
  teria renovado. Devolver o saldo cheio de um período que nunca foi pago
  seria dar cortes de graça; cobrar de novo e abrir período novo é o que um
  gateway real faria ao reativar uma assinatura vencida. `renewCycle` é
  método público justamente para `resume()` e o job de renovação chamarem a
  MESMA lógica.
- **Cartão nunca é persistido — nem mascarado guarda o meio.** `SubscribeDto`
  valida formato (`Matches`) mas `ClientSubscriptionService` só extrai os 4
  últimos dígitos (`last4Of`) antes de gravar em `Payment.metadata`; número
  completo e CVV morrem no fim do request. Verdade mesmo sendo um driver
  mock — não há razão para uma dívida de segurança que o mock não precisa
  ter.
- **Cancelar/remarcar da `MinhaConta` NÃO duplicam o `AppointmentsService`.**
  `POST /account/appointments/:id/rate` é rota nova (só o cliente logado
  avalia), mas cancelar e remarcar continuam batendo nas MESMAS rotas
  `/public/:slug/appointments/:code/cancel`/`reschedule` da fase 04 — o
  `RescheduleDialog` do frontend é só uma casca nova (`DatePicker`/
  `TimeSlotGrid` fora do wizard) sobre o endpoint que já existia.
- **`ClientAccountModule` não importa `BookingModule`.** Só reusa
  `isWithinChangeWindow`, uma função pura exportada de
  `appointments.service.ts` — trazer o módulo inteiro (que já importa
  `AuthModule` pelo `OtpService`) criaria uma dependência maior do que o que
  de fato é preciso.
- **Consentimento versionado é constante de código, não campo de formulário.**
  `CURRENT_TERMS_VERSION` (`@barbervp/types`) é carimbado em
  `Client.consentVersion` a cada aceite — subir a versão dos termos no futuro
  não pede migration, só trocar a constante. O cliente só marca o checkbox
  "aceito os termos" (já existia desde a fase 03); qual versão estava
  vigente é decisão do servidor, nunca dado que o formulário manda.

### Fase 04 — decisões técnicas

- **O combo é regra de CATÁLOGO (`ServiceComboPart`), não cálculo de tela nem de
  reserva.** O protótipo troca os ids no navegador (`COMBO_ID`/`PAIR_IDS`);
  aqui a composição é uma tabela com FK e a troca acontece no servidor. Motivo:
  preço promocional decidido no cliente é preço que qualquer um edita, e a mesma
  regra precisa valer para o agendamento feito pelo dashboard (fase 06), que não
  passa por este wizard. **Com um porém: o combo só entra quando de fato sai mais
  barato.** Para um assinante cujo plano cobre Corte e Barba separadamente,
  agrupá-los num terceiro serviço fora do plano transformaria dois atendimentos
  gratuitos num de R$ 70 — nesse caso a seleção fica como está. É literalmente o
  que o toast do protótipo promete ("sai mais barato").
- **Guest booking com OTP CONDICIONAL.** O protótipo confirma direto com nome +
  WhatsApp; o `system-map.md` pedia OTP sempre. Os dois extremos são ruins: sem
  verificação, qualquer um lota a agenda com telefones alheios (e queima a
  barbearia com clientes que nunca souberam do horário); com OTP sempre, some a
  razão de existir do guest booking, que é agendar em 30 segundos. O código é
  pedido só quando algo destoa — `REGISTERED_PHONE` (o número já é de conta
  verificada ou com senha), `TOO_MANY_OPEN` (o número já tem 2 horários futuros
  nesta barbearia) ou `IP_BURST` (6 reservas de visitante do mesmo IP na última
  hora). Os três limites são env (`BOOKING_GUEST_*`). **A tela nunca diz qual
  regra disparou**: "esse número já tem conta" transformaria o agendamento num
  oráculo de quem é cadastrado na plataforma.
- **Rate limit por IP é frouxo de propósito** (`BOOKING_CREATE_HOURLY_LIMIT`,
  30/h). Operadora de celular e wi-fi de shopping põem milhares de pessoas atrás
  do mesmo IP; travar cliente de verdade é pior que deixar passar spam. A
  barreira real contra agenda lotada de graça é o OTP condicional acima, que
  olha telefone e comportamento. O teto é lido de `process.env` no decorator
  (`@Throttle` é avaliado antes de existir container de DI) — a variável está no
  `envSchema`, e o default dos dois lugares tem de andar junto.
- **Seleção múltipla vira `AppointmentService`, não N agendamentos
  encadeados.** O wizard deixa marcar vários serviços e a duração do slot é a
  soma — mas continua sendo uma visita, um horário, uma cadeira. Um único
  intervalo é o que a EXCLUDE `no_double_booking` precisa guardar, e um único
  registro é o que a comanda fecha. `Appointment.serviceId` sobrevive como
  "serviço principal" (o primeiro da seleção), porque agenda, comissão e comanda
  falam de um serviço só. **Fecha a pendência que a fase 01 deixou em aberto**
  ("se a fase 04 precisar de múltiplos serviços, será uma migration nova").
- **A grade nasce de `slotIntervalMin` (15 min), não da duração do serviço.**
  Com passo igual à duração, um cancelamento às 09:20 deixaria um buraco que
  nunca mais seria oferecido.
- **Toda comparação de sobreposição acontece em INSTANTE (UTC), nunca em minutos
  locais** — assim uma virada de horário de verão no meio da janela não cria nem
  esconde vaga.
- **O `startsAt` recebido é revalidado contra a grade antes de gravar.** A
  EXCLUDE só enxerga colisão com outro agendamento, não expediente: sem essa
  checagem, bastaria editar o corpo da requisição para agendar às 3h da manhã,
  no almoço do barbeiro ou nas férias dele.
- **`Review` existe porque a regra 2 não admite array mockado.** As avaliações do
  `Agendamento Publico.dc.html` são dado do bundle, então viram seed — e seed
  precisa de tabela. A COLETA (pedir avaliação após o atendimento) continua sendo
  o template `REVIEW` do WhatsApp, da fase 07/09; aqui só há leitura.
- **O visitante NÃO ganha um `Client`.** O agendamento guarda
  `guestName`/`guestPhone`, que é para isso que os campos existem. Criar uma conta
  não verificada a partir de um agendamento ocuparia o telefone de outra pessoa —
  exatamente o bloqueio trivial que a fase 03 evitou ao decidir que "a conta do
  cliente só nasce depois do OTP".
- **Código de reserva com entropia** (`AG-` + 5 caracteres de um alfabeto sem
  `0/O` e `1/I/L`): é a credencial de quem agendou sem conta, então tem de ser
  imprevisível — os 4 dígitos sequenciais do protótipo não seriam. E ele sozinho
  não basta: o visitante também prova o telefone, porque o código viaja por
  WhatsApp e pode ser encaminhado sem querer.
- **404 idêntico para "não existe" e "não é seu"** na consulta por código —
  responder diferente transformaria a rota num oráculo de códigos válidos.
- **"Sem preferência" escolhe quem tem menos atendimentos no dia**, não o
  primeiro da lista: senão o Carlos, que abre a lista, lotaria enquanto o Bruno
  fica vazio.
- **Lembretes nascem no `NotificationOutbox` com `scheduledFor` e `PENDING`.**
  Nada os envia ainda — a fila BullMQ é da fase 09, e é ela que vai varrer
  `status = PENDING AND scheduledFor <= now()`. O `scheduledFor` entrou no
  CONTRATO do `NotificationAdapter` (e não num outbox agendado à parte) porque
  "mandar depois" é responsabilidade do canal: provedor real de WhatsApp aceita
  agendamento nativo, e trocar o driver não pode obrigar o módulo de negócio a
  mudar de API.
- **`TenantSettings.cancelamentoHoras` é a fonte única da política.** O protótipo
  escrevia "3h" na tela de sucesso do agendamento e "2h" na `MinhaConta`; agora a
  API devolve `cancelWindowHours` no resumo do agendamento e as duas telas leem
  dali. Nenhum texto de tela repete o número. (O campo do enunciado chamava-se
  `cancelamentoAntecedencia`; o nome real no schema, desde a fase 01, é
  `cancelamentoHoras`.)
- **O wizard renderiza UM passo por vez, com entrada animada, em vez do track de
  400% do protótipo.** O track mantém as quatro colunas montadas lado a lado e
  desliza um `translateX`, o que deixa três telas de campos e botões vivos fora
  de vista, alcançáveis por Tab e lidos por leitor de tela. Aqui só o passo
  corrente existe no DOM, e ele entra pelo lado do movimento (`bvp-in-right` ao
  avançar, `bvp-in-left` ao voltar — keyframe novo no preset). Efeito visual
  igual, comportamento com teclado correto.
- **A primeira carga da página `/{slug}` é do SERVIDOR e ANÔNIMA.** É página
  indexada e aberta em 4G no meio da rua; precisa de HTML pronto. Nenhum cookie
  de sessão atravessa, então a resposta pode ser cacheada (60s) e servida a
  qualquer visitante — o que depende de quem está logado (assinatura ativa,
  avatar no cabeçalho) é buscado depois da hidratação. Isso exigiu
  `API_INTERNAL_URL` no compose: dentro do container, `localhost` é o próprio
  Next, não a API.
- **O `.ics` de "adicionar ao calendário" é montado no navegador** — são 15
  linhas com dado que a tela já tem, e uma rota na API para isso só
  acrescentaria latência e mais uma superfície pública.
- **Alvos de toque subiram para 44px no mobile**: o ✕/← do `Modal` (era 36px, e
  fechar sheet é o alvo mais usado do celular) e os botões de ação da vitrine
  (`h-11 sm:h-10`). Na lista de serviços do wizard, o rótulo passou a envolver a
  LINHA inteira com associação implícita — o alvo é a linha de 64px, não a
  caixinha de 24px. O `Menu` de `packages/ui` ganhou `trigger` opcional (o
  avatar da conta no lugar do kebab).

### Fase 03 — decisões técnicas

- **Audience do JWT: `bvp:establishment` e `bvp:client`** (constante
  `TokenAudience` em `@barbervp/types`), com `AuthSession.audience` espelhando
  no banco (`ESTABLISHMENT`/`CLIENT`) e uma CHECK garantindo que uma sessão
  pertence a um `User` OU a um `Client`, nunca aos dois. Cookies de refresh
  separados (`bvp_rt` / `bvp_crt`), com `path` escopado em `/api/v1/auth` e
  `/api/v1/client-auth`. Motivo: o dono precisa poder estar logado no painel
  numa aba e agendando como cliente na outra, sem uma sessão derrubar a outra;
  e nenhuma rota fora de auth chega a ver o refresh.
- **Claims do access token**: `sub`, `aud`, `tid` (tenant ativo), `rol` (papéis
  NAQUELE tenant), `sa` (super admin), `sid` (`AuthSession.id`). O `sid` existe
  para o `JwtAuthGuard` confirmar que a sessão continua viva — sem isso, um
  logout só teria efeito quando o access token expirasse, até 15 minutos depois.
- **Vínculo cliente↔dono resolvido por `Client.userId`** (`@unique`), e não por
  fundir as duas tabelas. Quando o e-mail digitado no cadastro já é conta de
  `Client`, o fluxo confirma a senha atual e cria um `User` **com o mesmo
  `passwordHash`**, amarrando os dois registros. Consequência assumida: toda
  troca de senha (voluntária ou por recuperação, dos dois lados) atualiza os
  dois hashes na mesma transação. A alternativa — dar login de painel ao
  `Client` — quebraria `Membership.userId` e o RBAC inteiro. O que a tela
  promete ("seus agendamentos como cliente continuam intactos") é literal: o
  `Client.id` não muda, então `Appointment`/`ClientProfile` seguem apontando
  para ele.
- **A conta do cliente só nasce depois do OTP.** `POST /client-auth/register`
  valida e guarda o cadastro em `OtpCode.payload`; o `Client` é criado na
  verificação. Sem isso, digitar o telefone de outra pessoa ocuparia aquele
  número (que é a identidade do cliente) e a impediria de se cadastrar — um
  bloqueio de conta alheia trivial de executar.
- **Recuperação de senha do cliente cria "desafio de fachada" para destino sem
  conta**: linha real de `OtpCode`, sem `clientId` e sem `payload`, que conta
  para o limite por destino e **não envia mensagem nenhuma**. A resposta fica
  idêntica à do caso com conta. Sem isso, o endpoint viraria um oráculo de
  quem tem conta na plataforma.
- **Refresh opaco, não JWT.** O cookie carrega `<sessionId>.<segredo>` e o banco
  guarda só o HMAC-SHA256 do segredo (pepper = `JWT_REFRESH_SECRET`). Cada uso
  rotaciona; um refresh já revogado reaparecendo revoga a **família inteira**
  (`familyId`), conforme RFC 6819 §5.2.2.3 — é o sinal clássico de token
  roubado. Coberto por teste e2e.
- **Argon2 para senha, HMAC-SHA256 para os demais segredos** (refresh, OTP,
  token de reset). Estes últimos são gerados por nós com entropia suficiente:
  não há dicionário a resistir, e o `/refresh` roda a cada 15 minutos por
  sessão ativa — argon2 ali seria custo sem ganho. A defesa do OTP (que tem só
  6 dígitos) é o limite de tentativas + expiração, não o custo do hash.
- **Login sempre queima o tempo do argon2**, mesmo sem conta
  (`PasswordService.burn`), senão o tempo de resposta denuncia quais e-mails
  existem.
- **Tenant do JWT tem precedência sobre o header `x-tenant-slug`.** Um dono
  autenticado não navega para outra barbearia mandando header; para trocar,
  `POST /auth/context` emite um par novo. Testado no
  `auth-tenancy.isolation-spec.ts`.
- **Tenant nasce `TRIAL` com `planId` null.** O texto do passo 5 diz "durante o
  trial tudo é permitido"; amarrar um plano já no cadastro faria o gate de
  features recusar coisas que o trial libera. A contratação é da fase 07/08.
- **ViaCEP consultada pela API, não pelo navegador** (`GET /onboarding/cep/:cep`
  com cache no Redis por 30 dias). O protótipo chama do cliente; mover para o
  servidor evita liberar host externo no CSP das apps, compartilha o cache
  entre todos os donos e deixa a troca de provedor sem tocar em frontend.
  Falha da ViaCEP degrada para preenchimento manual, como no protótipo.
- **Passos do onboarding gravam progresso no banco** (`TenantSettings.
  onboardingStep`, que só sobe). O wizard é retomável de outro dispositivo —
  `useState` morreria com a aba. "Pular etapa" avança sem salvar, e por isso
  não pode fazer o contador regredir.
- **Fim do onboarding liga todo barbeiro ativo a todo serviço ativo**
  (`syncBarberServices`, idempotente) e propaga o horário da barbearia para o
  `WorkSchedule` de cada barbeiro. É o mínimo para a fase 04 conseguir montar
  grade de horários; o ajuste fino de "quem faz o quê" é tela da fase 06.
  Detalhe: dia fechado grava `isDayOff` com `endTime = startTime + 1`, porque a
  CHECK `work_schedule_bounds` exige fim > início.
- **`AppConfigModule` deixou de duplicar a lista de envs.** A dívida da fase 01
  bateria feio aqui (8 variáveis novas); agora a lista sai do próprio
  `envSchema` (`ENV_KEYS`), então acrescentar env ao schema já a faz chegar ao
  `AppConfig`. **Dívida da fase 01 resolvida.**
- **`middleware.ts` das 4 apps NÃO decide sessão** — só `noindex` e cabeçalhos
  de proteção. O refresh é httpOnly e escopado no host da API, invisível para a
  borda do Next, e o access token vive em memória; fingir a decisão ali só
  produziria redirect errado (mandaria para o login quem tem sessão válida).
  Quem decide é o `RequireEstablishmentAuth`, depois do refresh silencioso.
- **Access token só em memória** (`useRef` no provider), nunca em
  `localStorage`. A persistência entre recarregamentos vem do refresh httpOnly.
- **`Modal` do design system serve o `ClienteAuth` inteiro** — bottom-sheet
  < 768px, modal centrado acima, com foco preso, ESC e scroll lock já
  resolvidos na fase 02. O sheet é **componente**, não rota: o wizard da fase 04
  e a página pública abrem o mesmo, via `open`/`onClose`/`onAuthSuccess`.
- **Split das telas de auth do site colapsa em `lg` (1024px), não em 860px.**
  O `max-width:860px` do protótipo espremeria o formulário de 432px numa coluna
  de ~45% já em tablet; a construção aqui é mobile-first (uma coluna por
  padrão) e o split só entra quando as duas colunas cabem de fato.
- **A tela de sucesso do cadastro do cliente não fecha sozinha.** O protótipo
  fecha em 2,5s; aqui quem fecha é o usuário — fechamento automático corta a
  leitura de quem usa leitor de tela.
- **`Button` ganhou `buttonClasses()`** para `<Link>` do Next vestir a mesma
  aparência sem virar `<button onClick>` — o site é indexado e precisa de
  âncoras de verdade. `Checkbox` ganhou `error`, para o aceite de termos.

### Fase 02 — decisões técnicas

- **`surface-3` absorveu de vez o `#20242C` do onboarding** — o preset da
  fase 01 ainda guardava os dois tons (`surface.3: '#20242C'` e um `bg.2`/
  `bg.3` extras não usados por ninguém). A fase 02 limpou para 4 degraus só:
  `bg` `#0F1115`, `surface` `#12151A`, `surface-2` `#181B21`, `surface-3`
  `#1F232B` — como o SPEC já pedia (usar o mais comum). Os meio-tons do
  protótipo fora da escala (`#15171C` das sheets do wizard, `#1A1D23` dos
  inputs) foram aproximados para o degrau mais próximo; não viram token
  novo.
- **Rampa `gold-50..900` removida.** O protótipo só usa dourado sólido ou
  `rgba(212,168,76, x)`; a rampa da fase 01 não tinha consumidor. Fundos
  translúcidos agora saem por modificador de opacidade do Tailwind
  (`bg-gold/10`, `border-gold/30`), que é exatamente o padrão do bundle.
- **`Modal`/`Drawer` resolvem o breakpoint só em CSS** (`md:` = 768px),
  **não** com `ResizeObserver`/`window.innerWidth` como o protótipo. Motivo:
  JS de viewport muda o HTML entre servidor e cliente e quebra a hidratação
  do Next; classes responsivas dão o mesmo resultado visual sem esse risco e
  sem round-trip de re-render. O corte continua sendo 768px em todo lugar.
- **`AppointmentStatusPill` deriva do enum real** (`AppointmentStatus` de
  `@barbervp/types`), não do `STATUS_COLORS` do protótipo (que é um objeto
  solto por tela, com rótulos que variam entre `Dashboard.dc.html` e
  `DashboardFuncionario.dc.html`). Evita rótulo/cor de status divergir do
  schema em fases futuras.
- **Sem Storybook.** Optou-se pela rota `/playground` (opção B do enunciado):
  zero dependência nova, roda dentro do Next real da app (mesmo Tailwind,
  mesmos providers), e a alternância de breakpoint usa `<iframe>` de largura
  fixa em vez de `transform: scale`, então o layout é o real, com scroll e
  media query de verdade.
- **`AppShell` collapsa em `lg` (1024px), não em `640px` como o `!important`
  do protótipo.** O bundle é desktop-fixo e só "esconde" texto da sidebar
  abaixo de 640px; aqui o drawer sobreposto entra bem antes (regra 1:
  mobile-first de verdade), com a sidebar fixa reservada a telas que cabem
  254px de painel sem apertar o conteúdo.
- **`ResponsiveTable` não é genérica ao ponto de adivinhar colunas** — quem
  chama marca explicitamente `mobile: 'title' | 'subtitle' | 'meta'` em cada
  coluna. Verboso de propósito: decidir o que sobrevive no card mobile é
  julgamento de produto, não algo para a tabela inferir sozinha.

### Fase 01 — decisões técnicas

- **`Appointment.timeRange` é coluna GERADA**, não escrita pela aplicação:
  `tstzrange("startsAt","endsAt",'[)') STORED`. No `schema.prisma` aparece
  como `Unsupported("tstzrange")?` (o Prisma Client a ignora), e o `GENERATED
  ALWAYS` é escrito à mão na migration. Assim o intervalo nunca diverge de
  `startsAt`/`endsAt` e a fase 04 cria agendamentos pelo Prisma normal, sem
  SQL cru. Intervalo **semiaberto**: 10:00–10:45 e 10:45–11:30 coexistem.
- **Migration inicial escrita à mão** a partir de `prisma migrate diff`
  (`apps/api/prisma/migrations/20260815000000_init/`). Além da EXCLUDE, leva:
  `appointment_time_order`, `subscription_usage_within_quota` (rede de
  segurança do débito atômico), `service_price_non_negative`,
  `product_stock_non_negative`, `order_total_non_negative`,
  `work_schedule_bounds`, `business_hour_bounds`.
- **Horários de agenda são `Int` = minutos desde a meia-noite** (540 = 09:00)
  no fuso do tenant, em `WorkSchedule`, `ScheduleException` e
  `TenantBusinessHour`. Os nomes `lunchStart`/`lunchEnd` do SPEC foram
  mantidos; só o tipo mudou (era implicitamente `time`).
- **Modelos acrescentados ao mapa do SPEC**, por serem estruturalmente
  necessários: `ClientProfile` (perfil do cliente por barbearia — o `Client` é
  global; carrega `noShowCount`/`blocked` de `bloquearFaltasQtd` e desnormaliza
  `phone` para o índice `(tenantId, phone)`), `TenantBusinessHour` (o "horário
  por dia" de `TenantSettings`, como tabela em vez de Json),
  `ClientPlanItem` (quota por serviço do plano de assinatura),
  `CommissionTier` (faixas da regra TIERED).
- **`Appointment` tem um único `serviceId`.** O combo "Corte + Barba" é um
  serviço próprio no catálogo (o wizard converte a seleção dupla nele), então
  não há tabela de junção. Se a fase 04 precisar de múltiplos serviços por
  agendamento, será uma migration nova.
- **Percentuais em basis points** (`percentBps`: 4000 = 40%) e nota do
  barbeiro em `ratingBps` (490 = 4.9★) — nenhum float atravessa a fronteira.
- **Token único de erro `danger` = `#E05B5B`.** O protótipo tinha `#E05B5B`
  (produto) e `#E5484D` (sheets do cliente); o SPEC já pedia unificação.
- **Toast e sucesso consolidados no preset Tailwind**: as 5 animações de toast
  viraram `bvpToastIn`, e `successPop`/`checkDraw` viraram
  `bvpSuccessPop`/`bvpCheckDraw`. Os componentes `Toast`/`SuccessScreen` em si
  continuam sendo tarefa da fase 02.
- **`ScheduleExceptionType`** nasceu como enum novo (`DAY_OFF`, `VACATION`,
  `HOLIDAY`, `CUSTOM_HOURS`) — o SPEC citava folga/férias sem nomear o enum.
- **Auth ainda é stub.** O `TenantGuard` resolve tenant por slug (param de
  rota ou header `x-tenant-slug`); o ramo que lê `request.principal` já existe
  mas ninguém preenche `principal` até a fase 03 plugar o `JwtAuthGuard`
  **antes** dele na cadeia de `APP_GUARD`.
- **Timezone**: o seed converte horário local ↔ UTC com offset fixo de -3h,
  válido porque o Brasil não tem mais horário de verão. Se voltar, trocar por
  lib de timezone (`date-fns-tz`/`luxon`).
- **`deleteOutDir: false`** no `nest-cli.json`: `apps/api/dist` é volume no
  compose de dev (para o container root não deixar artefatos root-owned no
  host) e volume não pode ser removido de dentro. Use `pnpm clean` no host.

## Dívidas técnicas

- ~~LGPD (exportação/exclusão de dados do cliente)~~ — **resolvida na fase
  05**: `GET /client-auth/me/export` (JSON completo) e
  `POST /client-auth/me/delete` (anonimização, preserva `Order`/`Payment`),
  com o botão de exportação acrescentado como melhoria sobre o protótipo
  (que só tinha "Excluir minha conta"). Ver decisão da fase 05. A auditoria
  fina (retenção de `AuditLog`, revisão de hardening) segue para a fase 09.
- ~~Calibrar rate limit / exigência de OTP no guest booking do wizard~~ —
  **resolvida na fase 04**: OTP condicional por regra de risco, com os três
  limites em env (`BOOKING_GUEST_IP_HOURLY_LIMIT`, `BOOKING_GUEST_OPEN_LIMIT`,
  `BOOKING_CREATE_HOURLY_LIMIT`). Ver decisão da fase 04.

### Dívidas novas da fase 01

- **Sem CI ainda.** O `SPEC.md` pede "CI mínimo (lint + typecheck + test +
  build)". Os alvos existem (`make lint/typecheck/test/build`), mas não há
  workflow. Resolver na fase 09 (ou antes, se o repo ganhar remote).
- **Suíte de isolamento roda só o arnês.** `test/isolation/tenant-fixture.ts`
  monta os dois tenants e tem o assert de vazamento; `harness.isolation-spec.ts`
  valida o próprio arnês. **Cada fase seguinte deve adicionar o seu
  `*.isolation-spec.ts`** — sem isso o gate não mede nada de novo.
- ~~`ClientProfile.phone` é desnormalizado de `Client.phone` — sincronia
  depende de disciplina~~ — **resolvida na fase 05**: a troca de telefone
  (`POST /client-auth/me/phone/confirm`) escreve em TODA `ClientProfile` do
  cliente na mesma transação; o registro (fase 03) e o primeiro agendamento
  por barbearia (fase 04) já cobriam os outros dois pontos de escrita. Os
  três caminhos que tocam `Client.phone` agora sincronizam — nenhuma trigger
  de banco foi necessária.
- **`MockPaymentDriver` guarda estado no Redis** (chave `bvp:mock-payment:*`,
  TTL 30 dias). `make reset` limpa; um `docker compose restart redis` sem
  `--appendonly` perderia as cobranças simuladas. Sem impacto real até a
  fase 07/08 usarem o adapter.
- **Sem `Unit` no seed.** O modelo existe (multi-unidade do plano Avançado),
  mas o tenant demo está no Profissional e não tem unidade — todos os
  `unitId` são `null`. A fase 08 que exercitar multi-unidade precisa semear.
- ~~**`AppConfigModule` reconstrói o objeto de config** listando as chaves à
  mão~~ — **resolvida na fase 03**: a lista agora sai de `ENV_KEYS`, derivado do
  próprio `envSchema`.

### Dívidas novas da fase 02

- **`apps/api/dist` root-owned bloqueia `pnpm turbo run build` local.** É a
  dívida "`deleteOutDir: false`" da fase 01 batendo na prática: um `make up`
  anterior deixou `apps/api/dist` com dono `root` (volume do container), e
  `nest build` fora do container não consegue escrever nele. `pnpm turbo run
  lint typecheck` roda 100% verde (inclusive `apps/api`); as 4 apps Next
  (`site`/`booking`/`dashboard`/`admin`) buildam limpas. Só o build standalone
  da API falha localmente — dentro do Docker (produção) não acontece, porque
  lá o container é dono do volume. Resolver criando o `pnpm clean` que o
  `CONTEXT.md` da fase 01 já prometia (`rm -rf apps/api/dist` via container,
  já que o host não tem permissão), ou rodar `sudo chown` uma vez.
- **Nenhum `.dc.html` deste bundle tem tela de Super Admin** — o `AppShell`
  foi validado com o `NAV_DEFS` do dashboard da barbearia (14 itens). A fase
  08 provavelmente precisa de um conjunto de nav diferente; o componente já
  aceita qualquer lista de `AppShellNavItem`, então não é retrabalho, só
  falta o conteúdo.
- **Sem componente de "stepper" dedicado** para o indicador de etapas do
  wizard (`stepperSegments`/`stepperLabel` do `AgendamentoWizard.dc.html` —
  as 4 barrinhas + "Etapa X de 4"). É simples o bastante (um `<div
  className="flex gap-1">` com cor condicional) para não justificar
  primitive própria nesta fase; a fase 04 decide se cristaliza um
  `Stepper` ao implementar o wizard de verdade ou mantém inline.
- **`packages/ui` ainda não tem teste automatizado** (nem unit nem
  visual/a11y). O `Makefile`/CI da fase 09 precisa decidir a ferramenta
  (Vitest + Testing Library é o caminho natural, já que não há Storybook
  para plugar um addon de a11y). Sem isso, regressão de acessibilidade em
  overlay/foco só é pega manualmente no `/playground`.

### Dívidas novas da fase 03

- **Google OAuth adiado.** O botão "Continuar com Google" existe no
  `ClienteAuth`, como no protótipo, e responde com o toast "Em breve" — não
  finge autenticar. Implementar como adapter próprio (mesmo padrão de
  `NotificationAdapter`), provavelmente na fase 09. É a única funcionalidade
  desenhada no protótipo desta fase que não ficou funcional.
- **Upload de logo e capa é campo de URL, não upload.** O passo 3 grava
  `TenantSettings.logoUrl`/`coverUrl` a partir de uma URL digitada, porque não
  existe storage de arquivo no projeto ainda. A fase 09 (integrações) decide o
  destino (S3/R2) e troca o campo por um seletor de arquivo — o schema já está
  pronto e não muda.
- **`ClientProfile.phone` continua desnormalizado e agora TEM serviço de
  escrita.** A dívida da fase 01 previa isto: `ClientAuthService` altera
  `Client.phone` e `Client.name`, mas nenhum `ClientProfile` existe ainda nesta
  fase (só nascem no primeiro agendamento, fase 04). **Quem implementar a fase
  04/05 precisa sincronizar os dois na escrita, ou promover a trigger.**
- **Não há tela de "trocar senha" no painel.** O endpoint
  `POST /auth/password/change` está pronto e testado, mas a UI dele pertence à
  tela de Configurações (fase 07). Idem para gerenciar sessões ativas — os
  dados estão em `AuthSession`, falta a tela.
- **`OtpCode` e `AuthSession` expiradas não são limpas.** Ambas têm índice em
  `expiresAt` e não atrapalham consulta, mas crescem para sempre. A fase 09
  (hardening) deve agendar um job BullMQ de limpeza — o Redis e o BullMQ já
  estão de pé desde a fase 01.
- **Rate limit do throttler é por IP, em memória.** Suficiente para uma
  instância; com N réplicas atrás de load balancer, cada uma conta o seu. A
  fase 09 deve plugar o storage Redis do `@nestjs/throttler`. O limite por
  destino do OTP não tem esse problema: é contado no banco.
- **`prisma/migrations/migration_lock.toml` nasceu na fase 03.** A fase 01
  escreveu a migration à mão sem ele, o que impedia `prisma migrate diff
  --from-migrations`. Já está no lugar; só vale saber que ele apareceu depois.
- **Container e host precisam de `pnpm install` separados.** Os `node_modules`
  do compose são volumes anônimos: instalar dependência nova no host não a leva
  para dentro do container. Depois de mexer em `package.json`, rode
  `docker exec -e CI=true barbervp-<svc> pnpm install` em cada serviço afetado
  (ou recrie os containers). O `CI=true` é necessário porque o pnpm recusa
  limpar `node_modules` sem TTY.

### Dívidas novas da fase 04

- **BullMQ continua desligado — os lembretes existem, mas ninguém os envia.**
  `NotificationOutbox` já tem as linhas `PENDING` com `scheduledFor`, e o índice
  `(status, scheduledFor)` existe para isso. **A fase 09 precisa do worker** que
  varre `status = PENDING AND scheduledFor <= now()`, entrega e marca `SENT`.
  Enquanto isso, "cancelar um lembrete" é marcá-lo `FAILED` com o motivo — sem
  fila, não há job para remover.
- **Nenhuma tela cria avaliação.** O modelo `Review` existe e é lido pela página
  pública; a coleta (disparo do template `REVIEW` após o atendimento + tela de
  resposta) é da fase 07/09. Hoje só o seed planta avaliação.
- **Reserva de assinatura na página pública é vitrine.** O card "Assinar"
  responde com toast; a contratação (`AssinaturaCliente.dc.html`) é da fase 05.
  A LEITURA está pronta: cobertura por serviço, débito atômico, estorno no
  cancelamento e o resumo "Sua assinatura" no lugar da lista de ofertas.
- **"Meus agendamentos" ainda não abre nada.** O menu da conta existe e o
  endpoint de consulta por código está pronto, mas a listagem por cliente é
  `MinhaConta`, fase 05.
- **Capa e logo entram por `<img>` cru, não por `next/image`.** São URLs
  arbitrárias digitadas pelo dono (a dívida de upload da fase 03), e o loader do
  Next exigiria allowlist de domínio. Quando a fase 09 trocar o campo por upload
  em storage próprio, o domínio passa a ser conhecido e o `next/image` entra
  junto — com lazy loading e responsive srcset de brinde.
- **Combo resolve um por vez.** Um catálogo com dois combos que compartilham peça
  exigiria decidir prioridade entre eles, e não há regra de negócio para isso. O
  catálogo real tem um ("Corte + Barba"); se a fase 06 deixar o dono criar
  vários, esta decisão volta à mesa.
- **A grade não conhece `Unit`.** Todo `unitId` continua `null` (dívida da fase
  01): o motor ignora unidade ao montar horários. A fase 08, que exercita
  multi-unidade, precisa acrescentar o filtro — o campo já existe em
  `Appointment` e em `Barber`.
- **Sem teste de frontend automatizado.** A verificação desta fase (360/390/768/
  1024/1440 sem rolagem horizontal, alvos de toque, fluxo completo até o código
  da reserva) foi feita com Puppeteer em scripts descartáveis, não versionados.
  A dívida da fase 02 (`packages/ui` sem teste) segue de pé e agora vale para as
  telas também; a fase 09 decide a ferramenta.

### Dívidas novas da fase 05

- **BullMQ continua desligado — a renovação de assinatura existe, mas nada a
  agenda de verdade.** `SubscriptionRenewalService.runOnce()` está pronta e
  testada isoladamente (mock de Prisma/`PaymentAdapter`), exatamente como o
  lembrete de agendamento da fase 04 ficou. **A fase 09 precisa do worker**
  que chama `runOnce()` num `@Cron` diário — até lá, uma assinatura cujo
  `currentPeriodEnd` vence sem ninguém rodar o job manualmente continua
  `ACTIVE` com o período vencido (a cobertura já para de contar, porque
  `SubscriptionCoverageService` filtra `periodEnd > now` nos usos, mas o
  status não muda sozinho para `PAST_DUE`).
  Rodar manualmente: `SubscriptionRenewalService.runOnce()` a partir de um
  script Nest (não há endpoint HTTP para isto — é job, não ação de cliente).
- **Sem tela de gestão de planos pelo lado da barbearia.** `ClientPlan` só é
  criado pelo seed nesta fase — o CRUD de planos (criar, editar preço,
  desativar) é do dono/gerente e é trabalho explícito da **fase 07**
  (Dashboard II, "assinatura/fidelidade" do lado da casa). A fase 05 só
  consome o que já existe.
- **Remarcar da `MinhaConta` mantém o barbeiro fixo.** O `RescheduleDialog`
  não oferece trocar de profissional (só data/horário) — o endpoint
  (`AppointmentsService.reschedule`, fase 04) aceita `barberId` opcional, a
  UI desta fase é que não expõe o campo. Decisão de escopo: trocar de
  barbeiro é uma decisão maior que "mesmo corte, outro horário", e o
  protótipo (`MinhaConta.dc.html`) também não oferece essa opção no botão
  "Remarcar".
- **Pausar/reativar não tem histórico próprio.** `ClientSubscription` não
  ganhou `pausedAt`/campos de auditoria de pausa — o `AuditLog`
  (`SUBSCRIPTION_PAUSED`/`SUBSCRIPTION_RESUMED`) registra QUANDO, mas a
  tela não mostra "pausada desde X". Se a fase 07 (visão da barbearia)
  precisar disso, é campo novo + migration pequena.
- **Sem teste de frontend automatizado para `MinhaConta`/`AssinaturaCliente`**
  — mesma dívida da fase 02/04, ainda sem ferramenta escolhida. A verificação
  desta fase foi `pnpm typecheck`/`lint`/`build` limpos nas 3 apps tocadas
  (`api`, `booking`, `packages/types`, `packages/ui`) mais os 18 e2e/4
  isolamento contra o backend real — o layout responsivo em si (768px,
  alvos de toque) foi conferido por leitura de código contra os primitives
  já testados na fase 02 (`Modal`/`Tabs`/`EmptyState`), não por captura de
  tela em breakpoints.
- **`AssinaturaCliente` não reoferece o card "Sua assinatura" na cotação do
  wizard quando o cliente cancela e assina outro plano no meio de um
  agendamento em andamento.** Caso de borda raro (trocar de plano com o
  wizard aberto na aba ao lado) — não coberto por teste, sem relato de
  produto pedindo isso.

### Dívidas novas da fase 06

- **`pnpm --filter @barbervp/dashboard build` (produção) falha em TODAS as
  rotas, inclusive `/404`/`/500` do próprio Next e páginas de fases
  anteriores (`/playground`, `/configurar`) — `TypeError: Cannot read
  properties of null (reading 'useContext')` durante a pré-renderização
  estática. **Confirmado que não é regressão desta fase**: reproduz igual com
  o servidor de dev parado e `.next` limpo, e atinge páginas que este agente
  não tocou. Cheira a duas cópias de React no bundle de produção (`next dev`
  não passa por esse caminho, por isso nunca apareceu antes). `next dev`,
  `tsc --noEmit` e `next lint` das 4 apps ficam limpos — só o `next build`
  standalone quebra. Como o `Dockerfile.dev`/`docker-compose.yml` rodam
  tudo em `next dev`, isto não bloqueou a verificação desta fase, mas
  **bloqueia `docker-compose.prod.yml`, que usa `next build`** — precisa de
  investigação antes da fase 09 (hardening/deploy). Sem tempo nesta sessão
  para isolar a causa raiz (candidatos: `output: 'standalone'` +
  `transpilePackages` resolvendo `react`/`react-dom` duplicados via
  `outputFileTracingRoot`, ou uma dependência do design system importando
  `react` fora do `peerDependencies`).
- **Sem `e2e-spec.ts` dedicado para os módulos desta fase.** A fase 06 ganhou
  a suíte de isolamento (`dashboard-operation.isolation-spec.ts`, 11 casos —
  tenant + papel, é o critério de aceite explícito da fase) mas, diferente
  das fases 03–05, não ganhou um `test/*.e2e-spec.ts` cobrindo casos de
  validação e regra de negócio fora do isolamento (nome de serviço duplicado,
  `estoqueMin`/estoque negativo, convite para e-mail já convidado, escala com
  `endTime <= startTime`, combo aplicado num agendamento criado pelo staff
  etc.). Os unitários das fases 01–05 continuam 100% verdes porque nada foi
  alterado nelas; o que falta é cobertura NOVA para os módulos desta fase.
- **Modal de novo agendamento assume fuso do navegador = fuso do tenant**
  (decisão documentada acima). Correto para o caso real (staff operando da
  própria barbearia); errado se algum dia existir operação remota/multi-fuso.
  Resolver: repetir no frontend a mesma conversão `zonedTimeToUtc` que
  `apps/api/src/common/utils/timezone.ts` já tem no backend, usando o
  `timezone` que `GET /staff-agenda` já devolve.
- **Mover agendamento só troca o horário do MESMO dia** — o `MoveModal` do
  `/agenda` não deixa escolher outra data (nem outro barbeiro, embora o
  endpoint `PATCH /staff-agenda/:id/move` aceite `barberId`). Simplificação
  de UI para caber no tempo desta sessão; o backend já suporta o caso
  completo, falta o formulário.
- **Sem marcar `DONE`/`NO_SHOW` pela agenda.** Esta fase só cobre criar/mover/
  cancelar (`AppointmentStatus` fica em `SCHEDULED`/`CONFIRMED`/`CANCELED`) —
  fechar o atendimento como concluído ou falta é ação de Comandas, fase 07
  explícita no enunciado. Consequência: `ClientProfile.noShowCount` (usado
  pelo bloqueio de agendamento online, regra já ativa desde a fase 04) segue
  sem nenhum caminho de escrita até a fase 07 nascer.
- **Visão "Timeline" do protótipo (`isTimelineView`) não tem desenho
  próprio no frontend** — o contrato (`AgendaView.TIMELINE`) existe e o
  backend responde igual a `DAY`, mas a tela ainda renderiza as duas do
  mesmo jeito (colunas por barbeiro). O protótipo mostra uma barra de tempo
  horizontal por barbeiro; portar esse desenho específico ficou de fora por
  tempo, sem perda de dado (a resposta da API já tem tudo que a timeline
  precisaria).
- **Sem teste de frontend automatizado** para os 5 módulos desta fase — mesma
  dívida das fases 02/04/05, ainda sem ferramenta escolhida. Verificação
  feita por `tsc --noEmit`/`next lint` limpos + `curl` nas 6 rotas novas
  (200, sem erro no log do `next dev`) + leitura de código contra os
  primitives já testados na fase 02, não por captura de tela em breakpoints
  nem interação real de usuário.
- **`ProductsAdminService.list` com `lowStock=true` carrega a tabela inteira
  em memória** para comparar `stock <= estoqueMin` (Prisma não expressa
  comparação entre duas colunas do mesmo registro em `where`). Sem problema
  no volume de uma barbearia (dezenas de produtos), mas não escala — se um
  catálogo de centenas de produtos aparecer, trocar por `$queryRaw` com
  `WHERE stock <= "estoqueMin"`.

## Como retomar

Abrir sessão nova do Claude Code → colar o conteúdo do próximo
`agentes/agente-NN-*.md` pendente (na ordem da tabela acima). Se uma sessão
estourar o contexto no meio de uma fase, abrir sessão nova, colar o MESMO
agente e acrescentar "continue de onde o CONTEXT.md indica".

Para subir o ambiente: `make env && make install && make up && make seed`
(ou `make reset` para zerar tudo). Detalhe no `README.md` da raiz.

### Como conferir a fase 03 rodando

Com a stack de pé (`make up && make seed`):

1. **Cadastro → onboarding → dashboard**: `http://localhost:3000/cadastro` →
   preencher → cai em `http://localhost:3002/configurar` → 6 passos → conclusão
   com o link copiável.
2. **Login do painel**: `http://localhost:3000/entrar` com
   `dono@barbeariacentral.com.br` / `BarberVP@2026`.
3. **Cliente**: `http://localhost:3001` → "Criar conta" abre o `ClienteAuth`.
   O código OTP sai no `NotificationOutbox` — é de lá que o e2e o lê também:
   `docker exec barbervp-db psql -U barbervp -d barbervp -tA -c 'SELECT body
   FROM "NotificationOutbox" ORDER BY "createdAt" DESC LIMIT 1'`
4. **Testes**: `make test` (34 unit + 28 e2e) e `make test-isolation` (11).

### Como conferir a fase 04 rodando

Com a stack de pé (`make up && make seed`):

1. **Página pública**: `http://localhost:3001/barbearia-central`. Capa, status
   aberto/fechado calculado do horário real, serviços (5 + "ver todos"), planos,
   equipe, avaliações e horário com o dia de hoje em dourado.
2. **Agendar**: "Agendar horário" → marque **Corte Masculino + Barba** e veja o
   rodapé virar "Corte + Barba · 1h10 · R$ 70" (e não R$ 80) — é o combo sendo
   aplicado pelo servidor. Siga até o código da reserva.
3. **Compatibilidade**: marque só **Pigmentação** e vá ao passo 2 — três
   barbeiros ficam apagados com "não realiza Pigmentação"; só o Diego atende.
4. **Confirmação e lembretes** no outbox:
   `docker exec barbervp-db psql -U barbervp -d barbervp -c 'SELECT
   "templateKey", status, "scheduledFor" FROM "NotificationOutbox" ORDER BY
   "createdAt" DESC LIMIT 3'` — uma `SENT` e duas `PENDING` com data futura.
5. **Cancelar**: `POST /api/v1/public/barbearia-central/appointments/<código>/
   cancel` com `{"phone":"<o telefone usado>"}`. O horário volta à grade.
6. **OTP condicional**: agende como visitante usando o telefone de um cliente do
   seed (`(11) 9 8765-0001`) — a resposta vira `otp-required`, e o código sai no
   `NotificationOutbox`.
7. **Isolamento**: `http://localhost:3001/barbearia-isolamento` mostra a outra
   barbearia, vazia. Um código de reserva de uma nunca abre pela outra.
8. **Testes**: `make test` (65 unit + 60 e2e) e `make test-isolation` (21).

### Como conferir a fase 05 rodando

Com a stack de pé (`make up && make seed`):

1. **Login pronto para teste**: `http://localhost:3001/barbearia-central` →
   avatar/"Entrar" → telefone `(11) 9 8765-0001` (ou o e-mail
   `andre.martins@exemplo.com`) / senha `BarberVP@2026`. É o único cliente do
   seed com senha — já nasce assinante do "Corte + Barba Quinzenal", com 1
   corte usado de 2.
2. **`MinhaConta`**: clique no nome/avatar (ou "Meus agendamentos" no menu) →
   sheet com 3 abas. **Agendamentos**: Próximos com remarcar/cancelar,
   Histórico com "Agendar de novo" e estrelas nos atendimentos `DONE`.
   **Assinatura**: saldo `1/2` do corte, `0/2` da barba, histórico de
   cobrança, "Pausar"/"Cancelar assinatura". **Meus dados**: editar nome/
   e-mail, trocar telefone (OTP sai no `NotificationOutbox`), trocar senha,
   toggles de notificação, "Exportar meus dados" (baixa um `.json`), "Excluir
   minha conta" (checkbox de confirmação).
3. **Assinar do zero**: use outro cliente do seed sem assinatura (ex.: `(11)
   9 8765-0002` não tem senha — cadastre um novo cliente por
   "Criar conta"). Na página pública, seção "Planos para membros" → "Assinar"
   → detalhe → pagamento (cartão OU Pix, ambos mock) → sucesso → volte ao
   wizard e marque o serviço coberto: o rodapé mostra "Incluído na
   assinatura" e o preço vira R$ 0.
4. **Débito atômico sob concorrência** — o caso que o critério de aceite
   pede — já está automatizado (item 8 abaixo); para ver manualmente, assine
   um plano com quota 2 e dispare 3 `POST .../appointments` para horários
   diferentes do mesmo serviço quase ao mesmo tempo (`curl` em paralelo):
   no máximo 2 saem com `totalPriceCents: 0`.
5. **Gate por plano**: `PATCH` o tenant demo para o plano `essencial` (ou
   `profissional`) via `psql`/Prisma Studio e recarregue — a aba "Assinatura"
   some da `MinhaConta` e `GET .../account/subscription/plans` passa a
   responder 403 `FEATURE_NOT_IN_PLAN`. Lembre de voltar para `avancado`
   depois (é o plano do seed).
6. **Isolamento**: um cliente com assinatura na `barbearia-central` não a vê
   ao abrir `MinhaConta` pela `barbearia-isolamento` (aba "Assinatura" nem
   aparece, porque o gate também é por tenant).
7. **Testes**: `make test` (80 unit + 78 e2e) e `make test-isolation` (25).

### Como conferir a fase 06 rodando

Com a stack de pé (`make up && make seed`):

1. **Dono/gerente**: `http://localhost:3002` → login
   `dono@barbeariacentral.com.br` / `BarberVP@2026` (ou
   `gerente@barbeariacentral.com.br`, mesma senha). Nav completo: Dashboard,
   Agenda, Clientes, Serviços & Produtos e Equipe são rotas reais; o resto
   ainda é placeholder "em construção" (fase 07/08).
2. **`DashboardFuncionario`**: login `carlos@barbeariacentral.com.br` /
   `BarberVP@2026` — MESMA URL (`http://localhost:3002`), nav restrito
   (some Clientes/Serviços & Produtos/Equipe/Financeiro/Configurações) e
   `/agenda` mostra só a coluna do Carlos, sem seletor de barbeiro.
3. **Agenda**: `/agenda` como dono → "Novo agendamento" numa coluna
   qualquer → escolha serviço(s), cliente cadastrado OU walk-in, horário →
   confirma. Aparece na hora na coluna certa. Kebab do card → "Mover
   horário" (novo horário no mesmo dia) ou "Cancelar" (com confirmação).
   Redimensione a janela abaixo de 1024px: a sidebar vira drawer e a aba
   "Semana" some (só dia único no mobile, como pede o critério de aceite).
4. **Clientes**: `/clientes` → busca por nome/telefone, clique numa linha →
   drawer com barbeiro favorito, notas e "Bloquear agendamento" (o cliente
   bloqueado leva `ACCOUNT_DISABLED` tentando agendar pelo booking público —
   mesma regra da fase 04, `bloquearFaltasQtd`/`blocked`).
5. **Serviços & Produtos**: `/servicos-produtos` → aba Produtos → edite o
   estoque de um item abaixo do `estoqueMin` → volta pra lista com selo
   "Estoque baixo"; aba Serviços → editar quem atende reflete no booking
   público (`http://localhost:3001/barbearia-central`) na mesma hora.
6. **Convite de funcionário**: `/equipe` → "Convidar barbeiro" → preenche
   e-mail/serviços/dias → o link sai no log do `MockMailDriver`
   (`docker compose logs api | grep "e-mail simulado"`) e também fica em
   `MailOutbox` (Prisma Studio). Abra o link
   (`http://localhost:3002/aceitar-convite?token=...`) numa aba anônima:
   e-mail travado, define senha, entra direto logado como `BARBER` novo.
7. **RBAC cruzado (403 real, não só nav escondido)**: logado como Carlos
   (`BARBER`), tente `GET http://localhost:3333/api/v1/clients` com o
   Bearer do Carlos — 403 `FORBIDDEN`, mesmo com a URL digitada direto.
8. **Testes**: `make test` (80 unit + 78 e2e, inalterados) e
   `make test-isolation` (36 — os 25 de antes + os 11 desta fase, incluindo
   os dois casos de papel do critério de aceite).
