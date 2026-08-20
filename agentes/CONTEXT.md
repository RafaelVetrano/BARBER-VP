# BarberVP — CONTEXT (memória entre sessões)

Atualizado por último: 2026-08-20 — fase 11 (Consolidação) concluída: as 4
apps Next.js viraram UMA (`apps/web`), separadas por route group e roteadas por
host no middleware. Resultado: **1 frontend + 1 backend**. Nenhuma mudança de
comportamento — a suíte inteira ficou idêntica à baseline (81 unit · 133 e2e ·
106 isolamento).

## Status das fases

| # | Fase | Status |
|---|---|---|
| 01 | Fundação | ✅ |
| 02 | Design system | ✅ |
| 03 | Auth & Tenancy | ✅ |
| 04 | Booking público | ✅ |
| 05 | Área do cliente | ✅ |
| 06 | Dashboard I | ✅ |
| 07 | Dashboard II | ✅ |
| 08 | Super Admin | ✅ |
| 09 | Integrações & Hardening (GATE) | ✅ |
| 10 | Landing de vendas | ✅ |
| 11 | Consolidação (4 apps → 1 frontend) | ✅ |

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

### Planos públicos (`/api/v1/public/saas-plans`) — fase 10

`@Public()` **e** `@TenantOptional()` — é a única rota de `/public` que não fala
de uma barbearia, e sim do produto. Sem `@TenantOptional()` o `TenantGuard`
global devolveria 403 `TENANT_REQUIRED`.

**Ordem de registro importa**: `PublicPlansModule` entra ANTES do
`BookingModule` no `AppModule`. `PublicBookingController` é
`@Controller('public/:slug')` com `@Get()` na raiz, então `/public/saas-plans`
casaria com ele como `slug = "saas-plans"`. Express casa na ordem de registro.

| Método | Rota | Rate limit | Observações |
|---|---|---|---|
| GET | `/public/saas-plans` | global | Planos ativos por preço asc. Resposta igual para todos e sem dado de sessão: `cache-control: public, max-age=300, stale-while-revalidate=1800`. `id` é o `code` do plano (não o cuid) — é ele que vai no `/cadastro?plano=`. |

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

### Comandas / POS (`/api/v1/orders`) — fase 07

`@Roles('OWNER','MANAGER','BARBER')` — `BARBER` só vê/mexe nas próprias
comandas (`StaffScopeService`, mesmo recorte da agenda interna). Sem gate de
feature — comandas são o core do produto, liberado em todo plano.

| Método | Rota | Observações |
|---|---|---|
| GET | `/orders/catalog` | Serviços/produtos/barbeiros ativos para o balcão. |
| GET | `/orders` | Lista abertas/fechadas — `status`/`search`/`barberId`, paginado. |
| GET \| POST | `/orders/:id` \| `/orders` | Detalhe; abrir (cliente cadastrado, walk-in `{name,phone}`, ou vinculado a um `appointmentId`). |
| POST \| PATCH \| DELETE | `/orders/:id/items(/:itemId)` | Adiciona/atualiza quantidade/remove item. Serviço com cliente coberto por assinatura ativa entra a R$0 automaticamente (`quantity` 1 apenas). |
| PATCH | `/orders/:id/discount` | Desconto percentual (basis points) ou fixo (centavos). |
| PATCH | `/orders/:id/loyalty` | Liga/desliga o resgate de pontos (aplica `valorDesconto` de uma vez, se o saldo cobrir `pontosParaDesconto`). |
| POST | `/orders/:id/close` | **Fechamento em transação única** — ver "Decisões técnicas". |
| POST | `/orders/:id/reopen` | Só `OWNER`/`MANAGER` (`@Roles` no método, não na classe), sempre `AuditLog`. |

### Financeiro (`/api/v1/finance`) — fase 07

`@Roles('OWNER','MANAGER')`. Caixa é liberado em todo plano; o resto atrás de
`contasPagarReceber` (Profissional+).

| Método | Rota | Observações |
|---|---|---|
| GET \| POST | `/finance/cash-register` \| `/cash-register/open` \| `/cash-register/close` | Abrir com saldo inicial, fechar com valor conferido (`differenceCents` = contado − esperado). |
| GET \| POST | `/finance/payables` \| `/receivables` | Categoria travada em `ACCOUNT_PAYABLE_CATEGORIES`/`ACCOUNT_RECEIVABLE_CATEGORIES` (`@barbervp/types`). |
| PATCH | `/finance/payables/:id/pay` \| `/receivables/:id/receive` | Marca pago/recebido individualmente. |
| GET \| POST \| PATCH | `/finance/bank-accounts(/:id)` | Nome, tipo (texto livre), formas de pagamento aceitas (`PaymentMethod[]`), saldo. |
| GET | `/finance/cash-flow` | Mensal agregado (`?months=`, default 6) — Pagamentos + recebíveis (entrada) vs. contas pagas (saída). |

### Comissões (`/api/v1/commissions`) — fase 07

`@Roles('OWNER','MANAGER','BARBER')` atrás de `comissoes` (Profissional+) —
gate no CONTROLLER inteiro, então Essencial toma 403 mesmo sendo `BARBER`
pedindo o próprio extrato. `BARBER` só vê a si mesmo.

| Método | Rota | Observações |
|---|---|---|
| GET \| POST \| PATCH | `/commissions/rules(/:id)` | `FIXED` (%) ou `TIERED` (faixas); `barberIds` substitui o vínculo `Barber.commissionRuleId`. |
| GET | `/commissions/period?month=YYYY-MM` | Extrato — lê os `CommissionEntry` já gravados no fechamento da comanda. |
| POST | `/commissions/period/close` | Recalcula a taxa definitiva pelo faturamento TOTAL do mês, trava (`status: PAID`) e quita os vales do período. |
| GET \| POST | `/commissions/vales` | Atrás de `vales` (Profissional+) — vale entra automaticamente no desconto do próximo fechamento de período. |

### Fidelidade (`/api/v1/loyalty`) — fase 07

`@Roles('OWNER','MANAGER')`. Pontos/sorteios atrás de `fidelidadePontos`/
`fidelidadeSorteios` (Profissional+); planos de assinatura administrados pela
barbearia atrás de `fidelidadeAssinaturas` (Avançado).

| Método | Rota | Observações |
|---|---|---|
| GET \| PATCH | `/loyalty/program` | `gastoPorPonto`/`pontosParaDesconto`/`valorDesconto`/`expiracaoMeses`. |
| GET | `/loyalty/clients` | Saldo por cliente (top 200 por saldo). |
| GET \| POST | `/loyalty/raffles` | Criar dispara aviso de WhatsApp (mock) para clientes com histórico de pontos. |
| POST | `/loyalty/raffles/:id/draw` | Sorteio ponderado pelo nº de cupons (`LoyaltyRaffleEntry.entries`). |
| GET \| POST \| PATCH | `/loyalty/plans(/:id)` \| `/plans/:id/archive` | CRUD do `ClientPlan` vendido pela barbearia — o MESMO modelo que a fase 05 já usa do lado do cliente. |
| GET | `/loyalty/subscribers` | Assinantes com uso do ciclo (`SubscriptionUsage`) e status. |

### WhatsApp (`/api/v1/whatsapp-config`) — fase 07

`@Roles('OWNER','MANAGER')`. Lembrete/confirmação/cancelamento liberados em
todo plano; aniversário/reativação/avaliação exigem `whatsappCompleto`
(Profissional+) — checado por EVENTO, não no controller inteiro (ligar um
evento avançado sem o plano é que toma 403; ler a lista sempre funciona, com
os avançados sempre `enabled:false` se o plano não cobre).

| Método | Rota | Observações |
|---|---|---|
| GET | `/whatsapp-config` | Os 6 eventos, com `requiresFullFeature` para o front pintar o cadeado certo. |
| PATCH | `/whatsapp-config/:event` | Liga/desliga, edita template/`offsetMinutes`. |

### Assistente IA (`/api/v1/assistant`) — fase 07

`@Roles('OWNER','MANAGER')`. Sem gate de feature — o limite mensal por plano
(`AI_MESSAGE_LIMIT_BY_TIER`: Essencial 50, Profissional 200, Avançado
ilimitado) já regula o uso, contado por `AiChatMessage` do mês corrente.

| Método | Rota | Observações |
|---|---|---|
| GET | `/assistant/messages` | Histórico (até 100 últimas) + uso do mês. |
| POST | `/assistant/messages` | 403 `AI_MESSAGE_LIMIT_REACHED` ao estourar o limite do plano. |

### Relatórios (`/api/v1/reports`) — fase 07

`@Roles('OWNER','MANAGER')`. `summary` liberado em todo plano; `advanced`
atrás de `relatoriosAvancados` (Profissional+) — rota DISTINTA de propósito,
pro 403 do critério de aceite ter onde acontecer.

| Método | Rota | Observações |
|---|---|---|
| GET | `/reports/summary` | Faturamento, ticket médio, distribuição por forma de pagamento — `?from=&to=` (`YYYY-MM-DD`, default 30 dias). |
| GET | `/reports/advanced` | Por barbeiro/serviço/dia (raw SQL agregado, sem N+1), ocupação, no-show, taxa de retorno por faixa de dias sem visita. |

### Configurações e Minha Página (`/api/v1/settings`, `/api/v1/my-page`) — fase 07

`@Roles('OWNER','MANAGER')`. Unidades atrás de `multiUnidades`, calculadora
atrás de `calculadoraPreco` (Avançado); o resto liberado em todo plano.
`/my-page` não tem gate — branding público não está em `FEATURE_KEYS`.

| Método | Rota | Observações |
|---|---|---|
| GET \| PATCH | `/settings/barbershop` | Nome/CNPJ/endereço/telefone/fuso + `TenantBusinessHour` (não repropaga pra `WorkSchedule` dos barbeiros — ver decisão). |
| GET \| POST \| PATCH | `/settings/units(/:id)` | `Unit` — a primeira criada vira `isDefault`. |
| GET \| POST | `/settings/plan` \| `/plan/change` | Plano atual + faturas (`SaasInvoice`) + troca (recusa downgrade se `maxBarbers` não comportar os barbeiros ativos). |
| GET \| PATCH | `/settings/preferences` | `bloquearFaltasAtivo`/`bloquearFaltasQtd`/`antecedenciaMinima`/`cancelamentoHoras`. |
| POST | `/settings/price-calculator` | Puro cálculo, sem persistência. |
| GET \| PATCH | `/my-page` | Slug (valida com `SlugService`, mesma trava de reservados do onboarding), sobre, Instagram, endereço, toggles. |
| POST \| DELETE | `/my-page/photos(/:id)` | Galeria — URL simples, mesma convenção de `logoUrl`/`coverUrl` (sem upload real). |

### Super Admin (`/api/v1/admin`) — fase 08

`@Roles('SUPER_ADMIN')` + `@TenantOptional()` em todo controller — nenhuma
rota daqui pertence a um tenant, `RolesGuard` deixa passar pelo bypass
`isSuperAdmin` mesmo sem `Membership` nenhum.

| Método | Rota | Observações |
|---|---|---|
| GET \| POST | `/admin/plans` | Lista/cria `SaasPlan`; `POST` rejeita `features` com chave fora de `FEATURE_KEYS` (400). |
| PATCH | `/admin/plans/:id` \| `/:id/archive` | Edita; arquivar não afeta tenants já assinantes. |
| GET | `/admin/tenants` | Busca/paginação + uso agregado (barbeiros, agendamentos do mês) via 2 `groupBy`, sem N+1. |
| GET | `/admin/tenants/:id` | Detalhe com `Membership[]`, plano, métricas. |
| PATCH | `/admin/tenants/:id/suspend` \| `/reactivate` | Suspender bloqueia login de TODOS os `Membership` do tenant na hora (ver decisões). |
| PATCH | `/admin/tenants/:id/plan` | Troca manual de plano — reflete no `FeatureGuard` na PRÓXIMA requisição, sem precisar de novo login. |
| POST | `/admin/tenants/:id/impersonate` | Sessão real de OWNER (sem cookie de refresh), `AuditLog` pesado. 409 se o tenant está suspenso. |
| GET | `/admin/billing/invoices` | Lista `SaasInvoice` paginado. |
| POST | `/admin/billing/run-cycle` | Gera fatura `PENDING` pra cada tenant com `currentPeriodEnd` vencido (gateway mock). |
| POST | `/admin/billing/invoices/:id/approve` \| `/reject` | Aprovar avança o mock em DOIS passos (`CONFIRMED`→`RECEIVED`); recusar soma `failedAttempts` e suspende automaticamente ao atingir `BILLING_MAX_FAILED_ATTEMPTS` (env, padrão 3). |
| GET | `/admin/metrics` | MRR, tenants por plano, novos tenants do mês, churn do mês. |

### Filas e mensagens (`/api/v1/admin`) — fase 09

Mesmas regras do resto do super admin (`SUPER_ADMIN` + `@TenantOptional()`).

| Método | Rota | Observações |
|---|---|---|
| GET | `/admin/queues` | Resumo das 4 filas: contagens por estado e próximo disparo de cada cron. |
| GET | `/admin/queues/:name` | Últimos jobs da fila (padrão 20, teto 100) com o resumo que o processor devolveu. |
| POST | `/admin/queues/:name/run` | Dispara o job agora, fora do cron. `attempts: 1` — rodada manual não fica repetindo sozinha. |
| POST | `/admin/queues/:name/jobs/:jobId/retry` | Reenfileira um job que falhou depois de esgotar as tentativas. 404 se o job não existe. |
| GET | `/admin/outbox` | "Mensagens enviadas" — `NotificationOutbox` + `MailOutbox` unidos, filtro por `kind`/`status`/`tenantId`. Destinatário sai MASCARADO. |

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

## O que a fase 07 entregou

- **Quase todo o modelo de dados desta fase já existia desde a migration
  inicial da fase 01** (`Order`/`OrderItem`/`Payment`, `CommissionRule`/
  `Tier`/`Entry`, `Vale`, `CashRegister`/`CashMovement`, `BankAccount`,
  `AccountPayable`/`Receivable`, `LoyaltyProgram`/`Points`/`Raffle`, `Unit`,
  `WhatsappAutomationConfig`) — o trabalho real desta fase foi escrever a
  CAMADA DE API por cima do que já estava modelado e semeado, não desenhar
  schema novo. `migration 20260817000000_dashboard_ii` (escrita à mão, mesmo
  motivo de sempre) só acrescentou o que faltava: `SaasInvoice` (histórico de
  faturas do plano SaaS), `TenantPhoto` (galeria de "Minha Página"),
  `AiChatMessage` (histórico + contagem de uso do Assistente IA),
  `TenantSettings.showPhotos`/`showBusinessHours`/`bloquearFaltasAtivo`,
  `BankAccount.type`/`acceptedMethods`, `Order.guestName` (walk-in sem
  agendamento).
- **`FeatureGuard` + `@RequireFeature()`** (`common/guards/feature.guard.ts`,
  `common/decorators/require-feature.decorator.ts`) — gate de plano SaaS
  agora é UM guard global (`APP_GUARD`, depois de `TenantGuard`/`RolesGuard`),
  não checagem ad hoc por serviço. Lê `SaasPlan.features` do tenant ativo e
  devolve 403 `FEATURE_NOT_IN_PLAN`; `SUPER_ADMIN` atravessa.
- **Módulos novos** (`apps/api/src/`):
  - `pos/` (`OrdersService`) — Comandas. Abrir (cliente cadastrado, walk-in,
    ou vinculado a um `Appointment`), itens de serviço/produto, desconto
    (percentual/fixo), resgate de pontos, **fechamento em transação única**
    (ver decisões abaixo), reabertura só `MANAGER+` auditada.
  - `commissions/` (`CommissionsService` + `CommissionCalcService`) — regras
    `FIXED`/`TIERED`, extrato por período, "fechar período", vales.
    `CommissionCalcService` é exportado do módulo porque o fechamento de
    comanda precisa gravar `CommissionEntry` DENTRO da própria transação —
    não dá pra chamar endpoint HTTP de dentro de outra transação.
  - `finance/` — caixa (abrir/fechar com conferência), contas a pagar/
    receber, contas bancárias, fluxo de caixa mensal agregado.
  - `loyalty/` — programa de pontos, saldo por cliente, sorteios (criar +
    sortear, ponderado por cupom), planos de assinatura administrados pela
    barbearia (reusa `ClientPlan`/`ClientSubscription`/`SubscriptionUsage` da
    fase 01/05, só adiciona a escrita do lado da barbearia).
  - `whatsapp-config/` — CRUD do `WhatsappAutomationConfig`.
  - `assistant/` — chat do "Navalha" atrás de `AI_ASSISTANT_ADAPTER` (mock,
    mesmo padrão de `NotificationAdapter`/`PaymentAdapter`; novo driver mock +
    binding em `AdaptersModule` + `AI_ASSISTANT_DRIVER` no `envSchema`).
  - `reports/` — `summary` (todo plano) + `advanced` (`relatoriosAvancados`,
    rota DISTINTA de propósito) com SQL agregado (`$queryRaw` com `JOIN`/
    `GROUP BY`, sem N+1) para faturamento por barbeiro/serviço/dia, ocupação,
    no-show e taxa de retorno.
  - `settings/` (`SettingsService` + `MyPageService`) — barbearia, unidades
    (`multiUnidades`), plano + troca + faturas, preferências, calculadora de
    preço (`calculadoraPreco`), Minha Página + galeria de fotos.
- **`packages/types`**: `pos.ts`, `finance.ts` (+ `ACCOUNT_PAYABLE_CATEGORIES`/
  `ACCOUNT_RECEIVABLE_CATEGORIES` — as categorias REAIS do bundle, não as que
  a fase 01 tinha inventado no seed, ver decisão), `commissions.ts`,
  `loyalty.ts`, `whatsapp-config.ts`, `reports.ts`, `settings.ts`,
  `assistant.ts` (+ `AI_MESSAGE_LIMIT_BY_TIER`).
- **`seed-data.ts`/`seed.ts`**: `CATEGORIAS_PAGAR`/`CATEGORIAS_RECEBER` e as
  linhas de `ACCOUNTS_PAYABLE`/`ACCOUNTS_RECEIVABLE`/`BANK_ACCOUNTS` agora são
  as REAIS de `CONTAS_PAGAR_DATA`/`CONTAS_RECEBER_DATA`/
  `CONTAS_BANCARIAS_DATA` do `Dashboard.dc.html` (regra 2 nomeia
  `CONTAS_PAGAR_DATA` explicitamente — as datas do bundle viram deslocamento
  relativo ao dia do seed, pra nunca "nascerem vencidas"). `SaasInvoice`
  seedado (4 faturas pagas retroativas). `CommissionEntry` do seed agora linka
  `orderItemId` (o extrato mostra o nome do serviço, não mais "—") e usa o mês
  de competência real do fechamento.
- **Testes novos**: `test/dashboard-ii.e2e-spec.ts` (fechamento "tudo ou
  nada" — pagamento que não bate não fecha nada; ciclo completo comanda →
  fechamento → baixa de estoque → `CommissionEntry` → pontos de fidelidade →
  "fechar período" → `/reports/summary`, com os valores conferidos um a um;
  reabertura só `MANAGER+`, auditada) e
  `test/isolation/dashboard-ii.isolation-spec.ts` (16 casos — os 403 de
  feature flag do critério de aceite, um tenant Essencial e um Profissional
  de verdade, mais isolamento de tenant em `/orders`). Total do projeto: 80
  unit (1 é probabilístico — colisão rara de `bookingCode` em 2000 sorteios,
  ver dívidas) + 81 e2e + 52 isolamento, todos verdes na última rodada.
- **Dependência nova**: nenhuma (o Assistente IA usa só o padrão de
  adapter já existente).

### Front-end (9 telas, `apps/dashboard`)

- **`lib/api/`**: um arquivo de hooks TanStack Query por domínio —
  `pos.ts`, `finance.ts`, `commissions.ts`, `loyalty.ts`, `whatsapp.ts`,
  `assistant.ts`, `reports.ts`, `settings.ts`, `my-page.ts` — mesmo padrão
  de `catalog.ts`/`agenda.ts`/`clients.ts` da fase 06 (query key por
  domínio, `invalidateQueries` no `onSuccess` da mutation).
- **Comandas (POS)** (`app/comandas/`, `components/pos/`): lista Abertas/
  Fechadas → abrir comanda (cliente cadastrado ou walk-in, mesmo padrão do
  "Novo agendamento") → `PosWorkspace` com catálogo + comanda em
  `lg:grid-cols-[1fr_380px]`. `ComandaContent`/`ComandaFooter` são
  DELIBERADAMENTE dois componentes separados: o rodapé (subtotal/desconto/
  total/"Fechar comanda") nunca fica dentro da área que rola — no desktop é
  um bloco `shrink-0` fixo no `Card`, no mobile é o `footer` do `Modal`
  (que já é bottom-sheet nativo abaixo de 768px). É o "subtotal sempre
  visível" do critério de aceite, verificado pela ESTRUTURA do layout
  (`overflow-y-auto` só no conteúdo, nunca envolvendo o rodapé), não por
  captura de tela — ver dívida sobre verificação visual.
- **Financeiro** (`app/financeiro/`, `components/finance/`): 6 sub-abas
  (Caixa/Contas a pagar/Contas a receber/Vales/Contas bancárias/Fluxo de
  caixa) num `Tabs` só. `CashFlowChart` é SVG puro (sem lib de gráfico,
  legenda abaixo, `overflow-x-auto` no container — regra 1).
- **Comissões** (`app/comissoes/`): seletor de mês, cards expansíveis por
  barbeiro com extrato, `RuleModal` (FIXED/TIERED com editor de faixas),
  "Fechar período" com `confirm()` (é uma ação que trava o cálculo — vale a
  fricção de uma confirmação nativa em vez de um modal próprio, dado o
  tempo da sessão).
- **Fidelidade** (`app/fidelidade/`): Pontos/Sorteios/Assinaturas.
  Assinaturas usa `FeatureLocked` (Avançado).
- **WhatsApp**: card por automação, `Switch` + template editável;
  automações avançadas mostram cadeado e abrem `UpgradeModal` se o toggle
  vier 403.
- **Assistente IA**: chat simples com contador "X/limite mensagens este
  mês", input desabilitado ao bater o limite.
- **Relatórios**: `summary` sempre visível (StatCards + barra de forma de
  pagamento); `advanced` atrás de `FeatureLocked`.
- **Configurações** (`app/configuracoes/`): 5 sub-abas — Barbearia (dados +
  horário de funcionamento editável), Unidades (`FeatureLocked`,
  Avançado), Plano (cards comparativos + trocar + faturas), Preferências,
  **Calculadora de preço** (`FeatureLocked`, Avançado). A calculadora mora
  aqui e NÃO em Serviços & Produtos — ver decisão técnica.
- **Minha Página**: link público + copiar, slug editável, sobre, 4 toggles
  reais (serviços/avaliações/fotos/horário), galeria de fotos (URL simples,
  sem upload).
- **`components/feature-locked.tsx` + `components/upgrade-modal.tsx`**: o
  padrão `openUpgradeModal` do protótipo, novo nesta fase (nenhuma tela
  anterior precisava) — ver decisão técnica sobre como ele detecta o gate.
- **`lib/nav.ts`**: as 9 rotas desta fase viraram `ready: true` — as 13
  rotas de fases 06+07 do dashboard estão todas clicáveis, só falta o
  Super Admin (fase 08, app separado).
- **Verificação**: `tsc --noEmit` e `eslint` limpos em TODO `apps/dashboard`
  (não só os arquivos novos), as 9 rotas responderam 200 sem erro no log do
  `next dev`. **Sem captura de tela** — mesmo padrão de verificação da fase
  06 (ver dívida "verificação visual" abaixo).

## O que a fase 08 entregou

- **Sem `.dc.html` de referência nesta fase** — fidelidade foi ao design
  SYSTEM (`packages/ui`: `AppShell`, `Drawer`, `ResponsiveTable`, `Card`,
  `StatCard`, `Badge`, `Tabs`), não a um layout de protótipo específico. As 4
  telas (`/tenants`, `/planos`, `/billing`, `/metricas`) seguem a mesma
  gramática visual das telas de `apps/dashboard`.
- **Schema**: `TenantSubscription.failedAttempts Int @default(0)` (contador
  de recusa de cobrança pro auto-suspend) e `SaasInvoice.externalId
  String?` (referência ao `PAYMENT_ADAPTER` mock). Migration à mão
  `20260818000000_super_admin`, mesmo motivo de sempre (auto-diff quebra a
  coluna gerada `Appointment.timeRange`).
- **`packages/types/src/admin.ts`** (novo): todos os contratos do super
  admin — `AdminPlanItem`, `AdminTenantListItem`/`Detail`, `ImpersonateResultDto`,
  `AdminInvoiceItem`, `AdminMetricsResponse`, etc.
- **`TENANT_SUSPENDED`** — código de erro novo (`packages/types/src/errors.ts`)
  e `ApiException.tenantSuspended()`. Enforçado em TRÊS pontos, porque
  suspender precisa bloquear tanto quem ainda não tem token quanto quem já
  tem um válido: `EstablishmentAuthService.pickTenant()` (login novo, com ou
  sem `tenantId` explícito), `.switchContext()` (troca de contexto de quem já
  está logado em outra barbearia do mesmo usuário) e `TenantGuard.resolveTenant()`
  (token JÁ emitido antes da suspensão — backstop pra sessão não sobreviver
  até expirar sozinha).
- **Módulo novo** (`apps/api/src/admin/`): `plans/`, `tenants/`, `billing/`,
  `metrics/` — cada um com seu `.service.ts`/`.controller.ts`, registrados em
  `admin.module.ts` (importa `AuthModule` só por causa de
  `EstablishmentAuthService`, reusado pela impersonação).
- **Impersonação reusa `EstablishmentAuthService.issueSessionForUser()`** —
  o MESMO método que a fase 06 já usa pra logar o convite de funcionário
  aceito direto. Devolve `{ session, refreshToken, refreshExpiresAt }`; a
  impersonação expõe só `session` (que carrega o `accessToken` de vida
  curta) e DESCARTA `refreshToken` deliberadamente — sessão de impersonação
  nunca deveria sobreviver a um refresh, só ao tempo do token.
- **Hand-off entre origens** (`apps/admin` :3003 → `apps/dashboard` :3002,
  sem cookie compartilhado): query string pro que não é sensível
  (`?tenant=&slug=`) + FRAGMENTO da URL (`#token=`) pro `accessToken` — nunca
  vai pra log de servidor nem `Referer`. `apps/dashboard/app/impersonar/page.tsx`
  lê o fragmento no client, chama `/auth/me` com um `createApiClient()`
  AVULSO (não o client do provider — evitar corrida com o refresh silencioso
  que o `EstablishmentAuthProvider` já dispara ao montar) e só então `adopt()`
  a sessão.
- **Banner de impersonação é estado de UI, não semântica do JWT** — o token
  emitido é IDÊNTICO ao de um login normal de OWNER (deliberado: nenhuma
  rota do dashboard precisa saber que está impersonando). O "estou
  impersonando" mora só em `sessionStorage` (`apps/dashboard/lib/
  impersonation.ts`), lido por `components/impersonation-banner.tsx` — barra
  fixa com "Sair da impersonação" (desloga + redireciona pro admin).
- **`AuditService`**: 9 ações novas (`ADMIN_PLAN_UPSERTED/ARCHIVED`,
  `ADMIN_TENANT_SUSPENDED/REACTIVATED/PLAN_CHANGED/IMPERSONATED`,
  `ADMIN_BILLING_CYCLE_RUN/INVOICE_APPROVED/REJECTED`). Impersonar grava
  `targetOwnerUserId`/`targetOwnerName` no `metadata`.
- **`site` (`apps/site`) ganha o desvio de login**: `login-form.tsx`, depois
  do `adopt(session)`, checa `session.user.isSuperAdmin` e redireciona pra
  `NEXT_PUBLIC_ADMIN_URL` — super admin nunca vê o painel de uma barbearia
  pelo fluxo de login normal.
- **Front-end** (`apps/admin`, novo app Next.js): `admin-guard.tsx` (checa
  `isSuperAdmin`, não reusa `RequireEstablishmentAuth` do dashboard porque a
  regra é outra), `admin-shell.tsx` (nav Tenants/Planos/Billing/Métricas),
  `lib/api/{plans,tenants,billing,metrics}.ts` (TanStack Query, mesmo padrão
  de `apps/dashboard`), `tenant-detail-drawer.tsx` (suspender/reativar/trocar
  plano/impersonar num só `Drawer`), `plan-modal.tsx` (checkbox por
  `FEATURE_KEYS`, tier, `maxBarbers`/ilimitado). `/` redireciona pra
  `/tenants` — sem visão geral própria.
- **Testes novos**: `test/admin.e2e-spec.ts` (8 casos — acesso só
  `SUPER_ADMIN`, troca de plano refletindo em `FeatureGuard` na hora,
  suspender bloqueia login de TODOS os `Membership`, impersonar gera
  identidade real de OWNER sem cookie + `AuditLog`, não impersona tenant
  suspenso, CRUD de plano rejeita feature desconhecida, recusar cobrança 3x
  suspende automaticamente, aprovar reseta `failedAttempts` e avança o
  período). Total do projeto: 80 unit + 91 e2e + 52 isolamento, todos verdes.
- **Verificação ao vivo desta fase** (além dos testes automatizados): com
  `db`+`redis`+`api`+`admin`+`dashboard` de pé, confirmado por `curl` —
  login super admin, as 4 rotas do admin respondendo 200, troca de plano
  derrubando `GET /commissions/rules` de 200 pra 403 na hora (e voltando ao
  restaurar o plano), suspender tenant derrubando login do OWNER com
  `TENANT_SUSPENDED` (403) e reativar devolvendo o acesso, impersonar
  devolvendo token que resolve em `/auth/me` como o OWNER de verdade. Banco
  reseedado ao final.

## O que a fase 11 entregou

Refactor **estrutural e mecânico**: nada de comportamento mudou. As 4 apps
Next.js (`site`, `booking`, `dashboard`, `admin`) viraram uma só, `apps/web`,
com `apps/api` intacto. De 5 processos Node em dev para 2.

### A nova árvore

```
apps/web/
  middleware.ts                roteamento por host + cabeçalhos por superfície
  app/
    layout.tsx                 raiz mínima: <html>/<body>, fontes, globals.css
    providers.tsx              EstablishmentProviders · ClientProviders
    robots.ts                  um robots.txt, decidido pelo HOST
    (marketing)/               ← de apps/site            INDEXADO
      page.tsx                 /            landing de vendas (ISR 1h)
      (auth)/                  /entrar · /cadastro · /recuperar-senha
    (booking)/                 ← de apps/booking         INDEXADO
      [slug]/                  /{slug}      página pública da barbearia
      agendar/                 /agendar     raiz explicativa do booking
    (dashboard)/app/           ← de apps/dashboard       noindex
      page.tsx  agenda/  clientes/  comandas/  comissoes/  financeiro/
      fidelidade/  relatorios/  whatsapp/  assistente-ia/  configuracoes/
      minha-pagina/  equipe/  servicos-produtos/  configurar/
      selecionar-barbearia/  aceitar-convite/  impersonar/  playground/
    (admin)/admin/             ← de apps/admin           noindex
      page.tsx  tenants/  planos/  billing/  metricas/  filas/  mensagens/
  components/{marketing,booking,dashboard,admin}/    namespaced por superfície
  lib/{marketing,booking,dashboard,admin}/           idem
  lib/urls.ts                  o ÚNICO módulo compartilhado entre superfícies
```

`components/` e `lib/` foram namespaced por superfície porque `dashboard` e
`admin` tinham, os dois, um `lib/api/` — juntá-los sem prefixo colidiria em 6
arquivos. Os imports relativos frágeis (`../../components/x`) viraram alias
`@/` em toda a árvore.

### Mapa host → prefixo

| Host (produção) | Prefixo | Superfície |
|---|---|---|
| `barbervp.com` | `/` | marketing (landing + auth) |
| `agendar.barbervp.com` | `/agendar` e `/{slug}` | booking público |
| `app.barbervp.com` | `/app` | painel da barbearia |
| `admin.barbervp.com` | `/admin` | super admin |

O middleware lê `HOST_SITE`/`HOST_BOOKING`/`HOST_APP`/`HOST_ADMIN`. **Sem essas
variáveis o app roda em "prefixo direto"** — que é exatamente o modo de
desenvolvimento: `localhost:3000/`, `/agendar`, `/{slug}`, `/app/*`, `/admin/*`.
Verificado que o Next lê essas variáveis em RUNTIME no middleware (o build foi
feito sem elas e o roteamento funcionou ao subir com elas), então o
`docker-compose.prod.yml` pode passá-las por ambiente sem rebuild.

A reescrita de host tolera as duas formas de URL: `app.barbervp.com/agenda`
(URL antiga, de quando o painel tinha domínio só seu) e
`app.barbervp.com/app/agenda` (a que os links internos usam) resolvem para a
mesma rota — o `startsWith` do prefixo evita virar `/app/app/agenda`.

### Guarda do super admin (obrigatória)

`/admin/*` só responde no host do admin; em qualquer outro host o middleware
devolve **404 seco**, antes de qualquer render. Isso compensa a perda da
separação física em quatro deploys. A defesa REAL continua sendo o RBAC
`SUPER_ADMIN` server-side, que não foi tocado. Só vale com `HOST_*` definidos —
em dev o admin abre por `localhost:3000/admin`.

Verificado ao vivo com `curl -H "Host: ..."`:

| Host | `/admin/tenants` |
|---|---|
| `admin.barbervp.com` | 200 |
| `app.barbervp.com` | **404** |
| `barbervp.com` | **404** |
| `agendar.barbervp.com` | **404** |

### Providers, tema e SEO

- **Um `QueryClientProvider` por route group**, não global. A landing continua
  sem TanStack Query e sem `EstablishmentAuthProvider`: 89 kB de first-load
  contra 181 kB das telas de auth do mesmo grupo. O grupo `(auth)` aninhado
  dentro de `(marketing)` preserva exatamente o arranjo da fase 10.
- **Duas audiências, dois providers**: `EstablishmentProviders` (marketing/auth,
  painel, admin) e `ClientProviders` (booking). Como antes, o dono pode estar
  logado no painel numa aba e agendando como cliente noutra.
- **Tema**: o layout raiz declara `colorScheme: 'dark'`; a landing sobrescreve o
  `viewport` na própria rota e o `body:has(#bvp-landing)` do `globals.css`
  continua pintando o fundo claro. Fontes no raiz (Sora + Inter 400–900) — o
  navegador só baixa a face que a página renderiza, então a landing não paga
  pelo Sora que não usa.
- **`robots.txt` é decidido pelo host**: `Disallow: /` nos hosts do painel e do
  admin (como era em `apps/dashboard` e `apps/admin`), allow + disallow dos
  prefixos internos nos hosts públicos.
- **Canonical do booking virou absoluto** quando `NEXT_PUBLIC_BOOKING_URL` está
  definida. É a única mitigação de SEO que o merge exigiu: a rota `/{slug}`
  agora responde em qualquer host, e sem isso a página da barbearia poderia ser
  indexada também sob o domínio de marketing. Sem a variável (dev), volta a ser
  relativa — igual a antes.

### `lib/urls.ts` — de origens para caminhos

Antes cada app tinha o seu `urls.ts` com as origens das outras três, e navegar
entre superfícies era `window.location.assign('http://localhost:3002')`. Agora é
um módulo só, e por padrão os destinos são **caminhos relativos** (`/app`,
`/admin`, `/entrar`, `/agendar`): funciona em `localhost:3000` sem configurar
nada, e o visitante fica no host em que já estava. Definir os
`NEXT_PUBLIC_*_URL` faz os links apontarem para o host de produção correto.
`SITE_ORIGIN` e `BOOKING_ORIGIN` ficam separados porque `metadataBase` e o
JSON-LD exigem URL absoluta.

### Guardas de sessão

Migrados como estavam, não reinventados: `DashboardGuard` (login, seletor de
barbearia quando há mais de um `Membership`, wizard de onboarding pendente) e
`AdminGuard` (`user.isSuperAdmin`). O único ajuste foi manter a ida ao login
como navegação DURA — antes ela era dura por acidente (o login estava noutra
origem, e o `navigate` do guard fazia `window.location` para qualquer URL
absoluta); agora é dura por escolha explícita, para não mudar o ciclo de vida
do provider de sessão.

Ao verificar isso, descobriu-se que o caminho do anônimo já estava quebrado
ANTES da fase 11, por um deadlock no interceptor de refresh de `packages/ui` —
ver dívidas da fase 11. Não foi corrigido aqui: `packages/ui` está intacto, e
consertar isso é mudança de lógica, que esta fase não podia fazer.

### Infra

- `turbo.json`, `Makefile`, `docker-compose.yml`, `docker-compose.prod.yml`,
  `Dockerfile.dev`, `.env`/`.env.example` e o CI: onde havia 4 alvos de web,
  passou a haver 1. `pnpm turbo run lint typecheck` foi de 17 para **11/11**;
  `build`, de 6 para **3/3**.
- **Build isolado garantido por CI**: dois passos novos rodam
  `pnpm --filter @barbervp/web... build` e `pnpm --filter @barbervp/api... build`
  separadamente. Vercel e Railway buildam UM pacote cada — se o build de um
  passar a exigir o outro, o deploy quebra em silêncio, e agora o CI pega.
  `make build-web` / `make build-api` rodam o mesmo contrato na mão.
- `scripts/responsive-sweep.mjs` continua organizado por superfície (é assim que
  se lê o resultado), mas as quatro apontam para a porta 3000 com os prefixos
  novos.
- `docker-compose.yml` da raiz **continua existindo** para desenvolvimento
  local, como o agente 11 pede. Railway não o usa.
- Dependência órfã removida: `zustand` estava nas 4 apps e não era importada em
  lugar nenhum. Nenhuma colisão de chave de storage entre superfícies
  (`bvp:guest` do booking, `bvp_impersonation` do painel, `bvp-palette` da
  landing são todas distintas), então nada precisou ser prefixado.

### Deploy alvo (configuração é do agente 12)

- **Frontend `apps/web` → Vercel.** Next 14 roda sem ajuste. Definir `HOST_*` e
  os `NEXT_PUBLIC_*_URL` nas variáveis do projeto, e apontar os quatro domínios
  para o MESMO projeto.
- **Backend `apps/api` + Postgres + Redis → Railway, plano Hobby.**
- O `docker-compose.yml` da raiz segue sendo o ambiente local. Não remover.

## O que a fase 10 entregou

- **A landing de vendas** (`apps/site/app/page.tsx`) — última tela do bundle
  pendente, que era um `PlaceholderScreen` de 14 linhas desde a fase 01. Dez
  seções na ordem do protótipo: nav sticky, hero com mock de dashboard, 4
  stats, 7 funcionalidades, 4 passos, planos, 3 depoimentos, FAQ, CTA final e
  rodapé. Server Component com **ISR de 1h**; só nav (drawer mobile + scroll
  suave) e FAQ (accordion) são ilhas client.
- **`GET /public/saas-plans`** — preço e bullets saem do banco, nunca do
  frontend. Mudar o preço no super admin aparece na landing na revalidação
  seguinte, sem deploy.
- **Coluna `SaasPlan.marketing`** (`PlanMarketing`: `baseLabel` + bullets),
  migration `20260818140000_saas_plan_marketing`, semeada com os textos exatos
  do protótipo para os três planos.
- **SEO**: `metadataBase` + canonical absoluto, OG/Twitter, e JSON-LD
  `SoftwareApplication` (com as ofertas dos 3 planos) + `FAQPage` com as 6
  perguntas — tudo da mesma fonte que a tela renderiza.
- **Varredura responsiva verde** nos 5 tamanhos (`node
  scripts/responsive-sweep.mjs --app=site`), incluindo as três telas de auth,
  que não regrediram.

## O que a fase 09 entregou

- **Filas BullMQ de verdade** (`apps/api/src/queue/`) — fecha as dívidas
  "BullMQ continua desligado" das fases 04, 05 e 08. Quatro filas, uma por
  natureza de trabalho, para que uma renovação travada não segure o lembrete
  de ninguém: `outbox` (varre a cada 60s), `subscriptions` (03h),
  `billing` (04h) e `maintenance` (05h), todas com `attempts: 3` e backoff
  exponencial a partir de 30s. `QueueSchedulerService` registra os cron no
  boot com `jobId` fixo por fila e **remove os agendamentos anteriores antes**
  — mudar a hora no env não deixa o cron velho vivo ao lado do novo.
- **Painel de jobs próprio** (`/admin/queues` + tela `/filas`), não
  bull-board: o bull-board traria um Express paralelo com autenticação própria,
  fora do `JwtAuthGuard`/`RolesGuard` que protegem todo o resto — um segundo
  portão para manter seguro em troca de uma tabela que o design system já sabe
  desenhar. O painel mostra o RESUMO que cada processor devolve (quantas
  mensagens saíram, quantas assinaturas renovaram), não só verde/vermelho.
- **`dispatchDue()` entrou nos contratos** de `NotificationAdapter` e
  `MailAdapter`. É o que permite o job entregar o lembrete agendado sem
  conhecer driver concreto: um provedor com agendamento nativo já entregou e
  devolve zeros; o driver mock varre o próprio outbox. A entrega reivindica
  cada linha (`updateMany` no `attempts` antes de entregar), então dois
  workers na mesma rodada não enviam a mesma mensagem duas vezes.
- **Faxina de dados** (`MaintenanceService`) — dívida da fase 03. Retenções
  deliberadamente diferentes: OTP 7 dias, sessão 30, outbox 30, `AuditLog`
  365 (registro de conformidade, não dado operacional).
- **Tela "Mensagens enviadas"** (`/mensagens`) — a trilha dos dois outboxes,
  com destinatário mascarado: quem opera a plataforma precisa saber que a
  mensagem saiu e com que corpo, não ler o telefone do cliente de outra
  empresa.
- **Suíte de isolamento COMPLETA (o gate): 52 → 106 casos.** O arquivo novo
  `full-coverage.isolation-spec.ts` (54 casos) varre a MATRIZ — para cada
  recurso de negócio das fases 01–08, uma leitura e uma escrita cruzadas com o
  token do tenant errado. O fixture passou a criar um registro de CADA recurso
  nos dois tenants, e os dois nascem no plano Avançado de propósito: sem isso,
  metade dos endpoints responderia 403 por feature gate e um 403 de plano seria
  confundido com um 403 de isolamento — o teste passaria sem provar nada.
- **E2E dos 3 fluxos críticos** (`critical-flows.e2e-spec.ts`, 17 casos):
  cadastro → onboarding → 1º serviço → agendamento público com corrida de slot
  → comanda → fechamento → comissão (valor conferido: 40% da regra criada) →
  relatório; cliente com OTP → assinatura → agendamento coberto → uso
  decrementa → exportação LGPD; super admin troca o plano e o gate do tenant
  muda com o MESMO token, sem novo login.
- **Hardening**: rate limit contado no **Redis** (dívida da fase 03 — em
  memória, N réplicas davam a cada uma o seu teto), com
  `throttle-redis.e2e-spec.ts` provando que duas instâncias compartilham o
  contador; teto de payload explícito de 256kb; violação de CHECK deixou de
  virar 500; corpo grande demais era **500 e agora é 413**; 4 índices novos
  nas consultas de relatório.
- **Varredura responsiva AUTOMATIZADA** (`scripts/responsive-sweep.mjs`,
  `make responsive`) — fecha a dívida "sem teste de frontend" arrastada desde
  a fase 02. Abre cada tela num Chrome de verdade e mede rolagem horizontal,
  alvo de toque e erro de console nos 5 tamanhos. **Achou 8 defeitos reais**
  de alvo de toque (`IconButton`/`Button` pequenos, título do card da
  `ResponsiveTable`, olho da senha, links isolados das telas de auth, rótulo
  de checkbox), todos corrigidos mantendo a densidade do protótipo no desktop
  (`h-11 md:h-10`). As 4 apps passam limpas.
- **CI** (`.github/workflows/ci.yml`) — dívida da fase 01. Dois jobs:
  estático (lint + typecheck + build) e testes com Postgres e Redis de
  serviço, com a suíte de isolamento por último, explicitamente como gate.

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

### Fase 11 — decisões técnicas

- **`apps/web` nasceu de `git mv apps/dashboard apps/web`.** É a app mais
  complexa (config, providers, guarda de sessão, 18 rotas), então herdar dela
  custou menos do que montar do zero — e as 4 apps tinham `next.config.mjs`,
  `tailwind.config.ts`, `tsconfig.json`, `postcss.config.mjs` e `.eslintrc.json`
  BYTE-A-BYTE idênticos, o que tornou a unificação de config trivial. O único
  arquivo de config que divergia era o `globals.css` do `site` (o bloco da
  landing clara), acrescentado ao do `web`.
- **O painel ficou em `/app/*` e o admin em `/admin/*`, inclusive nos hosts
  próprios.** A alternativa era o painel responder em `/agenda` no host dele e
  em `/app/agenda` em dev — dois formatos de link para o mesmo botão, que é
  como se quebra navegação em produção sem ninguém perceber em dev. Com um
  formato só, `router.push('/app/agenda')` vale em todo lugar; a URL antiga
  (`app.barbervp.com/agenda`) continua funcionando pela reescrita do middleware.
- **A raiz do booking virou `/agendar`.** `(marketing)/page.tsx` e a antiga
  `(booking)/page.tsx` resolviam as duas para `/` — colisão que o Next recusa a
  buildar. Em vez de descartar a tela explicativa ("cada barbearia tem o próprio
  link"), ela ganhou caminho próprio, e o middleware manda `agendar.barbervp.com/`
  para lá. `/{slug}` não precisou de nada: é dinâmica e não colide com `/`.
- **Navegação entre superfícies passou a ser relativa por padrão.** Manter URL
  absoluta obrigatória significaria que esquecer uma variável de ambiente em
  produção mandaria o usuário para `localhost:3002`. Relativo é o fallback que
  não pode dar errado: no pior caso o visitante fica no host em que já estava,
  e a rota existe lá também.
- **`window.location.assign` foi preservado onde já existia**, em vez de virar
  `router.push` agora que é a mesma origem. Trocar por navegação soft mudaria o
  ciclo de vida do provider de auth — exatamente o tipo de "melhoria" que a
  regra número 1 desta fase proíbe.
- **Os 4 `CORS_ORIGIN_*` da API continuam existindo**, apontando todos para a
  mesma origem em dev. A API valida os quatro por Zod (`env.schema.ts`) e o
  refactor não podia tocar em `apps/api` — colapsá-los seria mudança de
  contrato do backend por conveniência do frontend.
- **A guarda de host do admin devolve `404` puro, não a página de erro do
  app.** Uma guarda de segurança que responde com HTML estilizado ainda conta
  para quem sonda quais rotas existem; 404 seco antes do render não conta.

### Fase 10 — decisões técnicas

- **A landing é a única superfície CLARA do produto — de propósito.** O
  protótipo expunha 4 paletas por prop de editor, com a escolha em
  `localStorage('bvp-palette')`. Isso é ferramenta de exploração de design, não
  feature: em produção só a **"Light SaaS"** (o default) entra, como tokens
  fixos em `components/landing/palette.ts`, sem seletor e sem storage. Quem lê
  a landing é um dono decidindo se compra; quem usa o painel escuro já é
  cliente e passa horas na tela. Consequência prática: a landing **não usa os
  componentes de `packages/ui`** — eles carregam os tokens escuros e ficariam
  ilegíveis sobre `#FAFAFA`.
- **`body:has(#bvp-landing)` em `globals.css`** para o fundo claro. O `body`
  global é escuro e continua assim para `/entrar`, `/cadastro` e
  `/recuperar-senha`, que dividem o mesmo layout raiz. O wrapper da landing já
  pinta o próprio fundo, mas o `body` aparece no overscroll do iOS/macOS — uma
  faixa preta piscando no topo de uma página branca. Navegador sem `:has()`
  perde só essa faixa; não vale um script de hidratação.
- **`SaasPlan.marketing` é coluna própria, não chave dentro de `features`.**
  O agente da fase pedia os textos no `features Json`, mas
  `AdminPlansService.upsert` valida chave a chave contra `FEATURE_KEYS` e
  **reconstrói** o Json — o texto de marketing seria apagado no primeiro
  salvamento de plano no super admin. `features` é permissão, `marketing` é
  conteúdo: mudam por motivos diferentes, em telas diferentes.
- **Duas respostas do FAQ são montadas a partir da API** (`buildFaqs`). O
  protótipo cita "Essencial (R$ 49), Profissional (R$ 89) e Avançado (R$ 139)"
  e "atende até 2 barbeiros e o Profissional até 4" — texto fixo ali era
  repetir dado de negócio no frontend, e a landing mostraria um preço no card e
  outro no FAQ no dia em que alguém mexesse no admin. Com os planos semeados o
  texto sai palavra por palavra igual ao protótipo. Foi por isso que
  `maxBarbers` entrou no DTO público.
- **`fetchSaasPlans` devolve `[]` em vez de estourar** quando a API não
  responde. A página é 90% conteúdo estático; derrubar hero, features,
  depoimentos e FAQ porque a API piscou seria trocar uma seção degradada por
  zero visitantes. A seção de planos mostra o próprio aviso e manda para o
  cadastro, que não depende de escolher plano antes.
- **Link "Ver o marketplace" do rodapé removido** — a tela não existe e não
  está em nenhuma fase. O rodapé ficou © 2026 BarberVP + Entrar / Planos /
  Dúvidas.

### Fase 09 — decisões técnicas

- **O `next build` das 4 apps foi DESBLOQUEADO — e a causa não era nenhuma das
  hipóteses anteriores.** A dívida da fase 06 dizia que o build falhava em
  TODAS as rotas de todas as apps com `Cannot read properties of null (reading
  'useContext')`, e três hipóteses já tinham sido descartadas com evidência.
  A causa real, encontrada nesta fase, é **`useSearchParams()` sem limite de
  `<Suspense>`** em `apps/dashboard`: `/configuracoes` (a aba inicial vem de
  `?tab=`) e `/impersonar`. O hook tira a rota da renderização estática e o
  Next 14 aborta o prerender. Corrigido embrulhando as duas em `<Suspense>`
  com fallback equivalente. `site`, `booking` e `admin` buildavam depois de
  limpar o cache — o erro `useContext` que aparecia antes vinha de artefato
  velho, não do código. **`pnpm turbo run build` roda 6/6 verde.**
- **O EACCES do `pnpm build` da API era cache incremental dessincronizado, não
  permissão.** Sintoma enganoso: `mkdir dist/... EACCES` mesmo com o diretório
  pertencendo ao usuário. Duas mudanças desta fase se combinaram para expor o
  problema: o container passou a rodar como uid 1000 e `apps/api/dist` deixou
  de ser volume anônimo, então host e container passaram a COMPARTILHAR `dist`
  pelo bind mount — mas cada um tem o seu `node_modules`, e o
  `tsconfig.tsbuildinfo` morava lá. Um build de um lado deixava o outro
  achando que a saída estava atualizada. Resolvido movendo o
  `tsBuildInfoFile` para DENTRO de `dist`, junto do que ele descreve. O motivo
  original de tirá-lo dali (o container escrevia como root) deixou de existir.
- **Container de desenvolvimento roda como `node` (uid 1000)** — fecha a
  dívida da fase 02. O usuário `node` da imagem oficial tem exatamente o uid
  do dono do checkout, então nada que o container escreve pelo bind mount
  nasce root-owned. `apps/api/dist` deixou de precisar ser volume anônimo e
  `pnpm clean` voltou a funcionar do host.
- **`QueueModule` é dinâmico (`register()`), não estático.** Um `@Processor`
  vira `Worker` no instante em que é registrado como provider, então a decisão
  de ligar ou não os workers precisa ser tomada na MONTAGEM do módulo —
  `@Module({})` estático não consegue consultar o env. O `register()` usa o
  MESMO `validateEnv` do resto do boot, não um `process.env` cru.
- **`THROTTLE_STORAGE` existe por dois motivos legítimos, não só pelo teste.**
  Produção precisa de `redis` (com N réplicas, contagem em memória multiplica
  o teto real por N). `memory` serve a uma instância única sem Redis e à
  suíte, onde um contador compartilhado entre os arquivos de spec derrubaria
  por 429 logins que os testes precisam fazer. O caminho Redis tem cobertura
  própria em `throttle-redis.e2e-spec.ts`, que sobe DUAS aplicações e prova
  que o teto gasto numa vale na outra.
- **`MALFORMED_JSON` foi criado e removido no mesmo dia.** O plano era dar
  código próprio ao JSON quebrado, mas ele chega ao filtro já embrulhado em
  `BadRequestException`, sem o `type` do body-parser que o distinguiria de uma
  validação de DTO. Emitir um código que nunca sai seria pior que não tê-lo:
  ficou 400 `BAD_REQUEST`, que é a resposta correta de qualquer forma. O
  `PAYLOAD_TOO_LARGE` ficou, porque esse o filtro reconhece de fato — e era um
  bug real (500 em vez de 413).
- **A varredura responsiva navega UMA vez por rota e redimensiona.**
  Recarregar a cada tamanho fazia 30 navegações em segundos por app; o provider
  de auth dispara um `/auth/refresh` por montagem e a rajada estourava o rate
  limit — a varredura passava a medir a tela de erro do Next em vez do layout.
  Redimensionar também é mais fiel: o que se quer verificar é o reflow por
  breakpoint, e o layout é CSS (Tailwind `md:`/`lg:`), não JavaScript de
  largura.
- **A régua de alvo de toque tem duas exceções, ambas corretas.** Caixa de
  seleção e rádio são medidos pelo `<label>` (é ele que recebe o toque), e link
  no meio de uma frase é dispensado pela exceção "inline" das WCAG 2.5.8 — um
  `<a>` dentro de "aceito os termos de uso" não tem como crescer sem quebrar o
  parágrafo. Sem essas duas exceções a varredura reprovaria padrões corretos.
- **`/playground` entra na varredura só pelo layout.** É a galeria de
  componentes da fase 02, não uma tela de produto: ela renderiza os primitives
  isolados e em estados de demonstração (inclusive tamanhos pequenos de
  propósito), então a régua de alvo de toque não se aplica ali.
- **O teste intermitente do código de reserva foi corrigido na raiz.** Ele
  exigia ZERO colisão em 2 mil sorteios de um espaço de 30^5; pelo paradoxo do
  aniversário isso é falso em ~8% das execuções. Não era "flaky", era uma
  asserção errada para a propriedade que se queria medir. Agora afirma o que a
  entropia permite (no máximo 2 colisões, o que por acaso é < 0,001%) e ganhou
  um par que confere que os 30 caracteres do alfabeto realmente aparecem — a
  regressão que importa (alfabeto encolhido ou sorteio enviesado) passaria
  despercebida pelo teste de colisão sozinho.

### Fase 08 — decisões técnicas

- **Por que impersonar reusa `issueSessionForUser` em vez de emitir um JWT
  "de impersonação" com um claim extra**: manter o token semanticamente
  idêntico ao de um login normal significa ZERO código condicional em
  qualquer rota do dashboard pra tratar "sessão impersonada" — todo o guard
  chain, todo `@CurrentTenant()`, todo `FeatureGuard` funcionam sem saber que
  a sessão nasceu de um clique no admin. O preço dessa simplicidade é que a
  UI de aviso (banner) precisa de um canal PARALELO (`sessionStorage`) — ver
  acima.
- **Por que NÃO setar o refresh cookie na impersonação**: `apps/admin` e
  `apps/dashboard` rodam em origens/portas diferentes, mas se algum dia
  compartilharem domínio (subdomínio comum em produção), um cookie de
  refresh de impersonação correria o risco de colidir ou sobrescrever a
  sessão própria do super admin no navegador dele. Sessão de impersonação
  morre com o `accessToken` (900s) — suficiente pra inspecionar o painel,
  curto o bastante pra não precisar de revogação explícita.
- **Por que a troca de plano não exige logout/login pra refletir**: o
  `FeatureGuard` lê `SaasPlan.features` do tenant ATIVO a cada requisição
  (nunca do JWT) — plano é dado de tenant, não claim de token. O critério de
  aceite "muda na hora" já vinha de graça da arquitetura da fase 07
  (`FeatureGuard`/`@RequireFeature()`), esta fase só precisava expor o
  `PATCH` que troca `Tenant.planId`.
- **Aprovar fatura precisa de DOIS `simulateTransition`, não um**: o
  `MockPaymentDriver.ALLOWED_TRANSITIONS` (já existente desde a fase 05, com
  comentário próprio antecipando "aprovação/recusa disparada manualmente
  pelo super admin") só permite `PENDING→CONFIRMED→RECEIVED`, nunca
  `PENDING→RECEIVED` direto. `approveInvoice()` respeita o contrato do
  driver em vez de o driver ser afrouxado pra fase 08 — a máquina de estado
  do mock continua representando um gateway real de verdade.
- **Auto-suspend por falha de cobrança é por `TenantSubscription.
  failedAttempts`, não por `Tenant.updatedAt` nem por contagem ad-hoc de
  faturas `FAILED`**: contador dedicado, incrementado a cada `reject`,
  resetado a cada `approve` — direto, sem depender de reconstituir histórico
  a cada checagem. Limite em env (`BILLING_MAX_FAILED_ATTEMPTS`, padrão 3),
  não hardcoded.
- **Sem visão geral própria em `apps/admin`** — `/` redireciona pra
  `/tenants` porque é ali que o super admin passa a maior parte do tempo
  (suporte/operação), e `/metricas` já cobre o que uma "home" mostraria.

### Fase 07 — decisões técnicas

- **Fechamento de comanda — o que entra na MESMA `prisma.$transaction`, nesta
  ordem**: (1) `recompute()` de novo (a comanda pode ter mudado entre a
  última leitura do front e o clique em "Finalizar"); (2) para cada item
  coberto por assinatura, `SubscriptionCoverageService.debit(tx, usageId)` —
  se a quota esgotou nesse meio-tempo, o item é recobrado ao preço cheio ALI,
  antes de qualquer outra coisa; (3) recalcula subtotal/desconto/fidelidade/
  total com os preços já corrigidos; (4) **valida que a soma dos pagamentos
  bate EXATAMENTE com o total** — não bate, `400` e nada foi escrito; (5)
  baixa estoque dos produtos; (6) grava `CommissionEntry` por item de serviço
  com barbeiro atribuído; (7) grava os `Payment`; (8) se algum pagamento é
  `CASH` e há caixa aberto, lança `CashMovement`; (9) marca o `Appointment`
  vinculado como `DONE`; (10) credita pontos de fidelidade e grava o resgate,
  se houve; (11) atualiza `ClientProfile.lastVisitAt`/`visitCount`/
  `totalSpentCents`; (12) fecha o `Order`. Qualquer exceção em qualquer passo
  desfaz tudo — é o "tudo ou nada" do critério de aceite, coberto por teste
  (`dashboard-ii.e2e-spec.ts`).
- **Fórmula final de pontos de fidelidade**: `Math.round(subtotalCents /
  gastoPorPonto)` — o `Math.round(subtotal)` cru do protótipo (que tratava
  R$1 = 1 ponto) foi ajustado pela config real `LoyaltyProgram.gastoPorPonto`
  (padrão 100 centavos = 1 ponto), exatamente como o SPEC já mandava. Resgate
  é BINÁRIO por comanda (`useLoyalty` liga/desliga), não uma quantidade livre
  de pontos — aplica o bloco inteiro de `valorDesconto` de uma vez quando o
  saldo cobre `pontosParaDesconto`, no mesmo modelo do toggle único que o
  protótipo mostra.
- **Comissão sobre SERVIÇO, nunca sobre produto** — decisão herdada do
  comentário já existente no seed da fase 01 ("comissão sobre o serviço,
  produto não gera comissão nesta regra"); mantida por consistência, e porque
  nem o SPEC nem o enunciado desta fase pedem comissão sobre a venda de
  produto.
- **Faixa (`TIERED`) é PROVISÓRIA a cada comanda, DEFINITIVA só no fechar
  período**: cada `CommissionEntry` nasce com a taxa calculada pelo
  faturamento ACUMULADO do barbeiro no mês até aquele item (mês a mês,
  comanda a comanda). "Fechar período" (`POST /commissions/period/close`)
  recalcula TODAS as entradas do mês com o faturamento FINAL e trava
  (`status: PAID`) — é o "fechar período trava o cálculo" do enunciado, sem
  precisar saber o faturamento do mês inteiro antes da primeira comanda
  fechar. Os vales não quitados do mês são marcados `settledAt` no mesmo
  fechamento — a dedução automática que o enunciado pede.
- **`OVERDUE` de conta a pagar/receber é calculado na LEITURA, nunca
  guardado.** `AccountPayable`/`Receivable.status` só vira `PAID`/`RECEIVED`
  por ação explícita; o serviço deriva `OVERDUE` comparando `dueDate` com
  `now()` na hora de montar a resposta. Guardar o status exigiria um job
  batendo a cada meia-noite (fila que só existe na fase 09) só pra manter uma
  coluna sincronizada com uma comparação de data — sem necessidade.
- **Categorias reais do seed, não as inventadas da fase 01.** O
  `seed-data.ts` original tinha `ACCOUNTS_PAYABLE`/`RECEIVABLE` com
  categorias como "Ocupação"/"Utilidades"/"Convênio", que não existem no
  bundle. `CATEGORIAS_PAGAR`/`CATEGORIAS_RECEBER` (`Dashboard.dc.html`) viraram
  `ACCOUNT_PAYABLE_CATEGORIES`/`ACCOUNT_RECEIVABLE_CATEGORIES` em
  `@barbervp/types` (fonte única, usada tanto na validação do DTO quanto no
  seed), e as 10+8 linhas de `CONTAS_PAGAR_DATA`/`CONTAS_RECEBER_DATA` do
  bundle substituíram as 4+2 inventadas. Decisão do usuário, tomada
  explicitamente no início desta sessão.
- **`Order.guestName` novo** — o walk-in "abrir comanda sem agendamento" do
  enunciado não tinha onde guardar o nome de quem não é cliente cadastrado
  (`Order` só tinha `clientId`, diferente de `Appointment`, que já carrega
  `guestName`/`guestPhone` desde a fase 04). Campo novo, mesmo padrão.
- **`bloquearFaltasAtivo` novo, separado de `bloquearFaltasQtd`** — o
  protótipo modela como dois controles independentes na tela de Preferências
  (liga/desliga + o número), e o schema da fase 01 só tinha o número. Sem o
  toggle, "desligar o bloqueio" teria que ser simulado com um número
  artificialmente alto, o que poluiria o campo que também aparece como texto
  ("após N faltas"). O bloqueio real do booking público
  (`appointments.service.ts`) passou a checar os dois.
- **`BankAccount.type`/`acceptedMethods` novos** — o enunciado pede
  explicitamente "formas de pagamento aceitas" por conta bancária, campo que
  não existia. `type` é texto livre (o protótipo mostra "Pix / Transferência
  / Cartão" ou "Caixa físico", não um enum fechado); `acceptedMethods` é
  `PaymentMethod[]`.
- **`PaymentMethod.SUBSCRIPTION`/`LOYALTY` não aparecem no split de
  pagamento da comanda.** O protótipo só mostra Pix/Dinheiro/Débito/Crédito
  (+ "Dividir") no fechamento — cobertura por assinatura e resgate de pontos
  são DESCONTOS que reduzem o total a dividir entre esses 4 métodos, não um
  "método" próprio. Os dois valores do enum continuam existindo no schema
  para outros contextos (ex.: o `Payment` da assinatura do cliente, fase 05),
  só não são usados aqui.
- **`CommissionCalcService` é exportado de `CommissionsModule`** e importado
  por `PosModule` — mesmo motivo de `SubscriptionCoverageService` na fase 04:
  o fechamento de comanda precisa gravar `CommissionEntry` DENTRO da mesma
  transação Prisma, e isso só é possível chamando o serviço diretamente, não
  batendo num endpoint HTTP separado.
- **`FeatureGuard` é o quarto `APP_GUARD` global**, depois de `RolesGuard` —
  antes desta fase, o único precedente (`ClientSubscriptionService.
  featureEnabled`) checava a feature manualmente dentro do serviço. Um guard
  global elimina esse padrão ad hoc: qualquer endpoint futuro só precisa de
  `@RequireFeature('chave')`, sem repetir a consulta ao `SaasPlan`.
- **"Relatórios avançados" é rota DISTINTA (`/reports/advanced`), não um
  campo condicional dentro de `/reports/summary`.** O critério de aceite pede
  literalmente um 403 num "endpoint de relatórios avançados" — só existe
  onde 403 acontecer se for uma rota própria. `summary` (faturamento, ticket
  médio, distribuição por forma de pagamento) fica liberado em todo plano;
  `advanced` (por barbeiro/serviço/dia, ocupação, no-show, retorno) exige
  `relatoriosAvancados`.
- **Ocupação é aproximada, não geometricamente exata.** `minutos agendados
  (DONE/CONFIRMED) ÷ (barbeiros ativos × média diária de minutos de
  expediente × dias do período)` — não cruza escala individual por barbeiro
  nem folgas/exceções (isso pertence ao motor de disponibilidade da fase 04,
  caro demais para rodar por período inteiro num relatório). Suficiente para
  o indicador do dashboard; documentado aqui para não ser lido como
  precisão de agenda.
- **`Unit`/multi-unidade e `TenantPhoto`/Minha Página não têm upload real de
  arquivo** — mesma dívida herdada de `logoUrl`/`coverUrl` desde a fase 01/03
  (campo é uma URL string; não há pipeline de upload no projeto ainda).
  `Minha Página` NÃO é gate de plano: o overlay "disponível no plano
  Avançado" que aparece no protótipo (`minhaPaginaLocked`) é código morto lá
  mesmo — hardcoded `false`, nunca liga — e `minhaPagina`/branding público
  não está na tabela oficial de `FEATURE_KEYS` do SPEC. Todo tenant edita a
  própria página pública, em qualquer plano.
- **Assistente IA sem chave real** — `AiAssistantAdapter`/
  `MockAiAssistantDriver` seguem o mesmo padrão de `NotificationAdapter`/
  `PaymentAdapter` (driver mock injetado por símbolo, trocar por LLM real é
  1 binding em `AdaptersModule` + 1 variável de ambiente
  `AI_ASSISTANT_DRIVER`), exatamente como o enunciado pediu. O limite mensal
  por plano é real (conta `AiChatMessage` do mês corrente), só a
  "inteligência" da resposta é mock.
- **`FeatureLocked`/`UpgradeModal` detectam o gate pela RESPOSTA REAL da
  API (403 `FEATURE_NOT_IN_PLAN`), não por um mapa de features calculado no
  cliente.** O dashboard não tem hoje nenhum jeito de saber o plano/features
  do tenant sem perguntar (o `EstablishmentAuthState` não carrega isso) — dá
  pra buscar via `GET /settings/plan`, mas isso adicionaria uma chamada
  extra em toda tela só para decidir se mostra ou esconde algo que o
  PRÓPRIO endpoint de dados já vai dizer com o mesmo 403 de qualquer jeito.
  `isFeatureGateError(query.error)` (novo em `lib/feature-error.ts`, lê
  `ApiError.code`) troca o conteúdo normal da seção por `FeatureLocked`
  sem round-trip a mais. Único ponto cego: um `Switch` que já está LIGADO
  mostra estado errado até o usuário tentar mexer (o `GET /whatsapp-config`
  já resolve isso devolvendo `requiresFullFeature` explícito por evento,
  mas o padrão genérico não teria essa saída sem o endpoint cooperar).
- **Calculadora de preço mora em Configurações, não em Serviços & Produtos**
  — decisão consciente contra o que o protótipo desenha (`spTabCalculadora`
  é a 3ª aba de `ServicosProdutos.dc.html`, não de `Configurações`). Mexer
  na tela de Serviços & Produtos (fase 06, já ✅) para acrescentar uma aba
  arriscaria a fase anterior por um ganho de fidelidade visual que o
  enunciado desta fase não pediu explicitamente (o texto da tarefa lista a
  calculadora dentro do bullet de Configurações). Se a fidelidade exata ao
  protótipo importar mais que o isolamento de mudança entre fases, mover é
  trabalho de front-end puro — o endpoint (`POST /settings/price-
  calculator`) não muda de lugar.
- **`ComandaContent`/`ComandaFooter` são dois componentes, não um.** A
  primeira tentativa colocava tudo (itens + totais + botão "Fechar") dentro
  do `ComandaPanel` único — só que o `children` do `Modal` de `packages/ui`
  já é `overflow-y-auto` por padrão (é o corpo que rola), e o `footer` é a
  ÚNICA área garantidamente fixa. Um painel só, incluindo o botão de fechar,
  ficaria escondido atrás do teclado/scroll numa comanda com muitos itens —
  exatamente o oposto do "subtotal sempre visível" do critério de aceite.
  Resolvido separando conteúdo (rola) de rodapé (fixo) e passando o rodapé
  pelo prop `footer` do `Modal` no mobile / um bloco `shrink-0` manual no
  `Card` do desktop.
- **Split de pagamento da comanda não usa `PaymentMethod.SUBSCRIPTION`/
  `LOYALTY` no front** (documentado no backend também) — o `CloseOrderModal`
  só mostra Pix/Dinheiro/Débito/Crédito, exatamente os botões do protótipo;
  cobertura por assinatura e resgate de pontos aparecem como REDUÇÃO do
  total a dividir, não como mais um método na lista.
- **Nenhuma captura de tela — verificação por `tsc`/`eslint`/`curl` +
  leitura da estrutura de classes responsivas**, mesmo padrão que a fase 06
  já tinha adotado (ver dívida "sem teste de frontend automatizado" de
  lá). Não há Playwright/Storybook configurado no projeto ainda; instalar
  isso é decisão maior que cabe à fase 09 (hardening) ou a uma fase de
  qualidade dedicada, não a um agente de feature.

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

### Dívidas novas da fase 11

Nenhuma delas foi CAUSADA por este refactor. Foram encontradas ao verificar a
app consolidada e existem em `main` do mesmo jeito — `packages/ui` e
`apps/api` estão byte-a-byte idênticos (`git diff main -- apps/api packages/`),
e nas telas só mudou o caminho do import. Estão aqui porque foi esta sessão que
as viu. A primeira é a mais séria.

- **Deadlock no interceptor de refresh: visitante ANÔNIMO em `/app` ou
  `/admin` fica preso no skeleton "Carregando sua sessão…" para sempre, em vez
  de ser mandado para `/entrar`.** Encontrado ao verificar os guardas desta
  fase; o código é de `packages/ui`, byte-a-byte idêntico ao de `main`.

  Mecanismo, em `packages/ui/src/lib/api-client.ts:120-131`: o bootstrap do
  `EstablishmentAuthProvider` chama `establishmentApi.refresh(client)`, que faz
  `POST /auth/refresh` **pelo mesmo cliente axios que tem o interceptor**. Sem
  cookie válido isso dá 401; o interceptor então marca `_retried`, define
  `refreshInFlight = options.refreshTokens()` e faz `await refreshInFlight`.
  Só que `refreshTokens` é o MESMO `refresh` — ele dispara outro
  `POST /auth/refresh`, toma outro 401, cai no interceptor de novo e, como
  `refreshInFlight` já está preenchido, faz `await refreshInFlight` na promise
  que só pode resolver quando ele próprio terminar. Ninguém rejeita, o `catch`
  do provider nunca roda, `clearSession()` nunca é chamado e `status` fica em
  `'loading'` — que é justamente o estado em que os guardas mostram skeleton e
  não redirecionam. Assinatura no navegador: exatamente 2 `401 /auth/refresh`
  por montagem (4 com o StrictMode ligado) e depois silêncio absoluto.

  Não afeta quem TEM sessão (o refresh resolve no primeiro 401 do access
  token), nem o logout (`window.location.assign` explícito, testado
  funcionando), nem o RBAC — é só o caminho do anônimo.

  Correção sugerida (uma linha de decisão, não refactor): fazer o
  `establishmentApi.refresh`/`clientApi.refresh` usarem um axios CRU, sem
  interceptor, ou pular o interceptor quando `config.url` já é a própria rota
  de refresh. Precisa de teste cobrindo "anônimo em rota protegida vai para o
  login" — hoje nada reprova isso.
- **`DashboardGuard` foi mantido com navegação DURA para o login**
  (`window.location.assign`), e não `router.replace`, mesmo agora que login e
  painel são a mesma origem. Era o comportamento anterior (o login morava em
  `apps/site`, outra origem) e trocá-lo mudaria o ciclo de vida do provider de
  sessão. Se a dívida acima for corrigida, é aí que dá para reavaliar.
- **`Tabs` de `packages/ui` reprova o alvo de toque de 44px.**
  `packages/ui/src/components/tabs.tsx:117` usa `h-9` (36px), abaixo do mínimo
  WCAG que a própria `scripts/responsive-sweep.mjs` cobra. Aparece em
  `/app/servicos-produtos`, `/app/equipe`, `/app/comandas`, `/app/fidelidade` e
  `/admin/mensagens` a 360 e 390px. **Só é detectável quando os dados já
  carregaram** — com skeleton na tela as abas nem existem, e é por isso que a
  varredura da fase 09 passou. Correção: `h-9` → `h-11` (ou `min-h-11`) naquela
  linha, e reconferir o espaçamento das telas afetadas. Também há `input`s de
  24px de altura em `/app/fidelidade` e `/app/whatsapp` (toggles) e um de 40px
  em `/app/comissoes`.
- **`notFound()` de `/{slug}` responde 200, não 404.** Slug inexistente
  renderiza a tela "Barbearia não encontrada" certa, mas com status 200 — um
  *soft 404* que o robô de busca pode indexar. O caminho de código é o mesmo de
  `main` (página, `not-found.tsx` e formato do middleware idênticos), e o 404 do
  Next funciona normalmente em rota sem match (`/app/rota-inexistente` → 404),
  então é específico do `notFound()` desta rota dinâmica no Next 14.2.16.
- **`make seed` deixa o onboarding PENDENTE** (`TenantSettings.onboardingDoneAt`
  fica `null` nos dois tenants). Consequência: logo após um seed limpo, entrar
  no painel cai em `/app/configurar`, e não no dashboard — o que contradiz os
  roteiros de verificação das fases 06 e 07 deste arquivo. Para conferir o
  painel é preciso completar o wizard, ou:
  `UPDATE "TenantSettings" s SET "onboardingDoneAt"=now(), "onboardingStep"=6
  FROM "Tenant" t WHERE t.id=s."tenantId" AND t.slug='barbearia-central';`
- **`onboarding.service.ts:443` monta o link público como
  `{base}/agendar/{slug}`, que não existe** — a página da barbearia é
  `{base}/{slug}`, como `my-page.service.ts:35` faz certo. O link mostrado no
  fim do wizard de configuração leva a um 404. É bug de `apps/api`, anterior a
  esta fase e fora do escopo do refactor; a correção é remover `/agendar/` da
  interpolação (uma linha) e ajustar
  `components/dashboard/onboarding/onboarding-wizard.tsx:195`, que faz o
  caminho inverso (`replace(/\/agendar\/.*$/, '')`).
- **Título da landing duplica a marca**: sai
  "BarberVP — Sistema de gestão para barbearias · BarberVP", porque o `title`
  absoluto da rota ainda recebe o `template: '%s · BarberVP'` do layout.
  Herdado da fase 10 (o `apps/site` fazia igual). Correção: usar
  `title: { absolute: '...' }` na landing.
- **A mesma rota `/{slug}` responde em TODOS os hosts.** Mitigado por canonical
  absoluto (ver acima), não bloqueado: `barbervp.com/barbearia-central` ainda
  renderiza a página da barbearia. Se isso incomodar, o lugar de resolver é o
  middleware — mesma forma da guarda do admin, restringindo `/{slug}` ao host
  do booking. Não foi feito porque exigiria uma allowlist das rotas de
  marketing, frágil para rota nova.
- **`/agendar` e as rotas de marketing são slugs reservados na prática.** Uma
  barbearia com slug `entrar`, `cadastro`, `agendar` ou `recuperar-senha` nunca
  abriria: no Next a rota estática ganha da dinâmica. Antes eram domínios
  separados e isso não existia. Vale uma validação de slug no cadastro do
  tenant (`apps/api`), com a lista de reservados vindo daqui.
- **Nenhum teste automatizado do middleware.** A guarda de host e as reescritas
  foram verificadas ao vivo com `curl -H "Host: ..."` (resultado na seção da
  fase 11), mas não há teste que reprove no CI se alguém quebrar a guarda do
  admin. É o candidato mais óbvio a teste de frontend, agora que existe uma app
  só para configurar.

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
  investigação antes da fase 09 (hardening/deploy).

  **Atualização (revisão da fase 07): três hipóteses DESCARTADAS com
  evidência** — não repetir estas buscas:
  1. *Duas cópias de React* (era a suspeita principal registrada aqui):
     **falso**. `ls /app/node_modules/.pnpm/react@*` devolve UMA única
     `react@18.3.1`, e `readlink -f node_modules/react` a partir de
     `apps/dashboard`, de `packages/ui` e da raiz aponta todos para o MESMO
     caminho real.
  2. *Componente de `packages/ui` usando hook sem `'use client'`*:
     **falso**. Varredura de todo arquivo com `useState|useEffect|
     useContext|useRef|useMemo|createContext` — todos têm a diretiva.
  3. *Artefato velho de `next dev` reaproveitado pelo `next build`*
     (o stack trace mistura `app-page.runtime.prod.js` e
     `...dev.js`, o que sugeria isso): **falso**. Com o dev parado e o
     conteúdo de `.next` apagado, o build falha igual.

  **Corrigido de fato nesta revisão** (não resolve o build, mas era um bug
  real e silencioso): `outputFileTracingRoot` estava na RAIZ do
  `next.config.mjs` das 4 apps. No Next 14 essa chave vive sob
  `experimental` (só virou top-level no Next 15) — o Next avisava
  "Unrecognized key(s) in object: 'outputFileTracingRoot'" a cada boot e
  IGNORAVA a configuração, o que por si só quebraria o tracing do
  standalone no monorepo mesmo depois de o erro de prerender ser resolvido.
  Movido para `experimental` nas 4 apps; o aviso sumiu e o `next dev`
  segue normal.

  Próximos candidatos a investigar: `next/font/google` no `layout.tsx` (o
  prerender busca a fonte pela rede — sem saída de internet no build, o
  erro pode aparecer disfarçado), ou algum export do barrel
  `packages/ui/src/index.ts` (que NÃO tem `'use client'`) sendo arrastado
  para o grafo de servidor.
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

### Revisão da fase 07 — bugs encontrados e corrigidos

Revisão linha a linha feita ao fim da fase (sessão separada, modelo maior).
Cinco defeitos reais, todos corrigidos e cobertos por teste onde fazia
sentido:

1. **`POST /orders/:id/reopen` não desfazia NADA** — era o mais grave.
   Reabrir só virava `status: OPEN`, e como `close()` só exige `OPEN`, fechar
   de novo aplicava tudo pela segunda vez: estoque baixado 2×,
   `CommissionEntry` e `Payment` duplicados, pontos de fidelidade creditados
   2×, `visitCount`/`totalSpentCents` somados 2×, quota de assinatura
   consumida 2×. Dinheiro e estoque errados a partir de um botão que a UI
   oferece normalmente. Agora `reopen` roda em transação única e é o par
   simétrico de `close()`: devolve estoque, devolve a quota de assinatura,
   apaga comissões e pagamentos, apaga a movimentação de caixa, estorna as
   linhas de `LoyaltyPoints` daquela comanda, desfaz o efeito no
   `ClientProfile` e volta o `Appointment` de `DONE` para `CONFIRMED`.
   **Trava nova**: comanda cujo período de comissão já foi fechado
   (`CommissionEntry.status = PAID`) não pode mais ser reaberta — a comissão
   virou obrigação com o barbeiro e não pode sumir. Coberto por
   `dashboard-ii.e2e-spec.ts` → "reabrir estorna o fechamento; fechar de
   novo não duplica nada".
2. **Estoque insuficiente virava 500 sem explicação.** `addItem` lia
   `product.stock` e não usava; o fechamento fazia `decrement` cru e só a
   CHECK `product_stock_non_negative` (fase 01) segurava — mas violação de
   CHECK não tem `case` no `AllExceptionsFilter`, então caía no 500
   genérico. Agora: `addItem` recusa com 400 explicativo, e o fechamento
   baixa estoque com `UPDATE ... WHERE stock >= quantity` conferindo as
   linhas afetadas (pega o caso de outra comanda ter levado a última unidade
   no meio do caminho). Coberto por teste.
3. **Financeiro e Comissões faziam bloqueio silencioso.** As duas telas
   ignoravam o 403 `FEATURE_NOT_IN_PLAN`: um tenant Essencial via "Nenhuma
   conta a pagar" e "Nenhuma comissão neste período" — mentira, e exatamente
   o que o enunciado proíbe ("upsell discreto, não bloqueio silencioso").
   Agora as duas usam `FeatureLocked` como Fidelidade e Relatórios já
   faziam, os botões de criar somem quando bloqueado, e as queries com gate
   ganharam `retry: false` (403 não é falha transitória).
4. **"Período fechado" com lógica invertida.** `CommissionsService.period`
   marcava o mês como fechado se QUALQUER barbeiro estivesse fechado
   (`anyClosed = anyClosed || closed`). Com dois barbeiros, fechar um sumia
   com o botão "Fechar período" e travava o outro em `PENDING` para sempre.
   Agora é `allClosed`.
5. **Estado obsoleto ao trocar de comanda no POS.** `ComandaContent` guarda
   o desconto digitado em estado local e não remontava ao trocar de comanda
   — carregava o valor da anterior. Resolvido com `key={order.id}`.

Também: `MyPageService.update` passou a gravar o slug já normalizado que a
checagem de disponibilidade aprovou, em vez de normalizar de novo (mesma
função determinística, mas fecha a porta para divergência).

Total após a revisão: 80 unit + **83 e2e** (2 casos novos) + 52 isolamento,
todos verdes.

### Dívidas novas da fase 07

- **N+1 em `GET /commissions/period`**: o extrato roda 3 queries por
  barbeiro (lançamentos, produtos, vales) dentro de um `for`. Com o volume
  de uma barbearia (4–10 barbeiros) são ~30 queries rápidas, sem impacto
  perceptível — e o "não N+1" do enunciado era requisito explícito só dos
  Relatórios (que usam `$queryRaw` com `GROUP BY`, e estão corretos). Vale
  reescrever como `groupBy` único se o número de barbeiros crescer.
- **`revenueByBarber` do relatório avançado usa `INNER JOIN Barber`**, então
  comanda sem barbeiro definido (walk-in no balcão) fica de fora do
  detalhamento — a soma por barbeiro pode não bater com o faturamento total
  do resumo. Igualmente, o faturamento é atribuído pelo `Order.barberId`
  (barbeiro "principal" da comanda), não rateado por item: comanda com
  serviços de dois barbeiros conta inteira para um só.
- **Resgate de pontos não é protegido contra concorrência.** Duas comandas
  abertas do MESMO cliente, ambas com `useLoyalty`, fechando ao mesmo
  tempo, podem resgatar o mesmo saldo duas vezes (o saldo é a soma do
  ledger, sem `SELECT ... FOR UPDATE` nem constraint de não-negativo).
  Diferente da quota de assinatura, que TEM débito atômico e CHECK. Caso de
  borda improvável no balcão (o mesmo cliente com duas comandas abertas
  simultâneas), mas é uma inconsistência real de tratamento.
- **Nenhuma verificação VISUAL de responsividade — só estrutural.** O
  "checklist de responsividade, atenção especial ao POS" foi conferido lendo
  as classes Tailwind (`hidden lg:flex`/`lg:hidden`, `grid lg:grid-cols-
  [1fr_380px]`, o `footer` do `Modal` fora da área `overflow-y-auto`) e
  confiando no comportamento já testado do `Modal`/`Drawer` (bottom-sheet
  nativo < 768px, fase 02) — não em captura de tela em 360/768/1440px nem
  interação real de usuário. Não há Playwright/Storybook no projeto ainda
  (mesma dívida da fase 06). Se algo escapou da leitura de código, só
  aparece testando ao vivo (`docker compose up dashboard` — sozinho, sem a
  stack inteira, para não estourar RAM numa máquina mais modesta).
- **`FeatureLocked` de uma seção só aparece DEPOIS da tentativa de
  requisição falhar** (é reativo ao 403 real, não a um estado pré-calculado
  — ver decisão técnica) — a primeira renderização de uma tela gated sempre
  mostra o `Skeleton` de carregamento por uma fração de segundo antes do
  cadeado, mesmo sabendo de antemão (pelo menos para quem já viu a tela)
  que vai ser bloqueada. Cosmético, não bloqueia nada.
- **Sem marcar `NO_SHOW` pela Comandas.** O fechamento de comanda marca o
  `Appointment` vinculado como `DONE` (regra do enunciado), mas não existe
  NENHUM caminho — nem na Agenda (fase 06), nem em Comandas (fase 07) — para
  marcar um agendamento como `NO_SHOW`. Consequência: `ClientProfile.
  noShowCount` (a base do bloqueio de agendamento online desde a fase 04)
  continua sem nenhuma escrita real no produto, só no seed. Resolver: um
  endpoint `PATCH /staff-agenda/:id/no-show` (ou equivalente em Comandas)
  que incrementa `noShowCount` e marca o `Appointment`.
- **Split de pagamento não valida método duplicado nem quantidade de
  parcelas** — `CloseOrderDto.payments` aceita, por exemplo, dois lançamentos
  `PIX` separados (soma continua validada, então não é bug financeiro, só
  falta de UX — o front deveria consolidar/alertar).
- **Calculadora de preço (`POST /settings/price-calculator`) é STATELESS,
  não lê o catálogo real.** O enunciado pede "escopo simples nesta fase" —
  a fórmula (`custo + rateio de fixos, dividido por 1 − margem − comissão`)
  não persiste nada nem sugere aplicar o preço calculado direto num
  `Service`. Se o produto quiser "aplicar preço sugerido" no catálogo, é
  fase futura.
- **Sorteio "aviso via WhatsApp" notifica só quem já tem histórico de
  pontos** (`LoyaltyPoints` do tenant, até 100 destinatários) — o enunciado
  não define "elegibilidade" com precisão; clientes sem NENHUM ponto ainda
  (primeira visita) não são avisados. Ajustar quando houver critério de
  produto mais específico (ex.: todos os clientes com `notifyWhatsapp:
  true`, sem exigir histórico).
- **`AiChatMessage`/Assistente IA sem paginação de histórico** — `GET /
  assistant/messages` sempre devolve as últimas 100 mensagens inteiras, sem
  cursor. Suficiente para o volume de um chat de suporte interno; revisar se
  o uso real acumular milhares de mensagens por usuário.
- **Teste unitário pré-existente flaky, não é regressão desta fase**:
  `booking.spec.ts` → "não repete em 2 mil sorteios" ocasionalmente falha por
  colisão genuína de `generateBookingCode()` (paradoxo do aniversário com
  alfabeto pequeno) — reproduzido isolado e também passou limpo na
  re-execução. Prioridade baixa (a fase 04 já mitiga colisão real com retry
  na escrita), mas caso vire ruído recorrente no CI, aumentar a amostra do
  alfabeto ou reduzir o `n` do teste para descolar da margem exata do
  paradoxo do aniversário.

### Dívidas RESOLVIDAS na fase 09

Riscadas onde apareceram, resumidas aqui:

- ~~**Sem CI**~~ (fase 01) — `.github/workflows/ci.yml`, com a suíte de
  isolamento como gate explícito.
- ~~**Suíte de isolamento roda só o arnês**~~ (fase 01) — 106 casos, matriz
  completa por recurso.
- ~~**`apps/api/dist` root-owned bloqueia o build local**~~ (fase 02) —
  container roda como uid 1000.
- ~~**`packages/ui` sem teste automatizado / sem ferramenta de frontend**~~
  (fases 02/04/05/06/07) — `scripts/responsive-sweep.mjs` + `make responsive`,
  Chrome de verdade nos 5 tamanhos.
- ~~**`OtpCode`/`AuthSession` expiradas nunca são limpas**~~ (fase 03) — job
  `maintenance`.
- ~~**Rate limit por IP em memória**~~ (fase 03) — storage Redis.
- ~~**BullMQ desligado: lembretes existem mas ninguém envia**~~ (fase 04) —
  fila `outbox`, verificada ao vivo entregando um lembrete vencido.
- ~~**Renovação de assinatura sem quem a agende**~~ (fase 05) — fila
  `subscriptions` chamando o `runOnce()` que já existia.
- ~~**Ciclo de billing sem quem o dispare**~~ (fase 08) — fila `billing`;
  `runCycle()` aceita rodar sem ator e grava `trigger: 'schedule'` no
  `AuditLog`.
- ~~**`next build` de produção falha nas 4 apps**~~ (fases 06/08) — era
  `useSearchParams()` sem `<Suspense>` em duas telas do dashboard. `make build`
  roda 6/6.
- ~~**Violação de CHECK vira 500**~~ (fase 07) — 409 com o contrato de erro.

### Dívidas novas da fase 09

- **A varredura responsiva precisa de `--delay` e das apps já no ar.** Ela
  simula um padrão de acesso que nenhum usuário produz (dezenas de telas em
  segundos) e, sem folga entre as rotas, estoura o rate limit da API e passa a
  medir a tela de erro do Next. O padrão (2,5s) serve para `site`, `booking` e
  `admin`; o `dashboard` precisa de `--delay=6000` porque cada tela dispara
  várias consultas. Automatizar isso no CI exigiria subir as 4 apps e afrouxar
  o throttle — não foi feito, a varredura é um alvo de `make`, rodado à mão.
- **A varredura cobre as telas, não os fluxos dentro delas.** Ela abre cada
  rota e mede o layout renderizado; modal aberto, drawer, wizard no passo 3 e
  tabela com muitas linhas não são exercitados. Um transbordamento que só
  aparece com o `Modal` aberto passaria. Cobrir isso é Playwright com
  interação, uma decisão de ferramenta maior que esta fase.
- **Só as telas públicas de `site` e `booking` entram na varredura.** As
  telas atrás de login dessas duas apps (a conta do cliente, o wizard de
  agendamento) exigiriam uma sessão de CLIENTE, que é outro fluxo de auth; as
  do dashboard e do admin são varridas logadas. As telas de cliente usam os
  MESMOS primitives já exercitados, mas a afirmação "todas as telas" tem essa
  ressalva.
- **`AdminOutboxService` une as duas tabelas em memória.** Busca `skip + take`
  de cada lado, junta, ordena e corta. Correto e barato para o volume de uma
  página, mas é O(skip) — numa página muito profunda carregaria bem mais linhas
  do que devolve. Trocar por `UNION ALL` em `$queryRaw` se o volume pedir.
- **Uma réplica de worker é o suficiente, e isso não é imposto.** Os quatro
  jobs são agendamentos repetíveis; duas réplicas com
  `QUEUE_WORKERS_ENABLED=true` dividem o mesmo trabalho sem duplicar efeito (o
  dreno reivindica cada linha antes de entregar), mas é desperdício. Está
  documentado em `docs/DEPLOY.md`, não travado por código.
- **Impersonação continua sem kill-switch** (dívida da fase 08, não resolvida
  aqui) — segue sem endpoint que revogue a sessão antes dos 900s.
- **O disco da máquina de desenvolvimento estava 100% cheio** durante esta
  sessão (2,1 GB livres de 233 GB), com ~19 GB só de cache de build do Docker.
  Foi limpo (`docker builder prune -af`), mas **não é a causa** de nenhum dos
  bugs desta fase — foi investigado e descartado. Vale registrar porque a
  anomalia do banco vazio da fase 08 segue sem causa raiz, e disco cheio
  continua sendo uma hipótese não testada para ela.

### Dívidas novas da fase 08

- **Anomalia intermitente do ambiente de dev, NÃO raiz-causada**: em algum
  momento desta fase o banco perdeu TODAS as linhas de `Tenant`/`User`/
  `Order` (tabelas vazias, sem erro visível). Investigado e descartado como
  causa: o boot normal de `docker compose up -d api` (testado explicitamente
  — rebaselinar 7 migrations, confirmar contagem, reiniciar `api` normal,
  confirmar contagem igual), o mount do volume `barbervp-db-data` (conferido
  correto), e o entrypoint do `Dockerfile.dev` (sem lógica de reset). Outros
  volumes Docker órfãos de projetos antigos foram encontrados na máquina mas
  não são o volume montado por este compose. Contornado operacionalmente
  (reseed + verificação imediata) todas as vezes que aconteceu; se voltar a
  acontecer, vale medir se há relação com o host ficar sem RAM/trocar pra
  swap (a mesma sessão que viu isso também viu o VSCode fechar por RAM) —
  hipótese não testada.
- **`next build` de produção continua falhando** nas 4 apps (dívida herdada
  da fase 06, não desta fase) — `outputFileTracingRoot` foi corrigido para
  dentro de `experimental` (era ignorado silenciosamente fora dali, bug real
  que esta fase consertou), mas isso NÃO resolveu a falha de prerender; três
  outras hipóteses já descartadas com evidência (ver dívida da fase 06). Sem
  causa raiz identificada ainda — `next dev` funciona normalmente em todas as
  4 apps, então não bloqueia verificação nem uso, só `next build`/deploy.
- **Impersonação não é revogável antes dos 900s.** Não existe "encerrar
  sessão de impersonação à força" do lado do super admin — só o próprio
  fluxo (banner → "Sair da impersonação") ou o token expirar sozinho. Pra um
  MVP com sessão curta e sem refresh já é baixo risco, mas se o produto
  precisar de um kill-switch (ex.: revogar em massa por incidente), falta um
  endpoint que invalide `AuthSession.id` da sessão de impersonação
  especificamente.
- **Sem paginação em `/admin/tenants` além do básico já existente** — a
  fase reusa o padrão de paginação das fases anteriores (`page`/`perPage`),
  suficiente pro volume de tenants de um MVP; se a base de tenants crescer
  muito, os 2 `groupBy` de uso agregado (barbeiros/agendamentos do mês)
  passam a rodar sobre a base inteira antes de paginar — vale revisar se
  virar centenas de tenants.
- **Teste ao vivo do login redirect do `site` (`isSuperAdmin` →
  `NEXT_PUBLIC_ADMIN_URL`) foi só por leitura de código + `tsc`/`eslint`
  limpos, não pelo navegador** — mudança de 3 linhas, baixo risco, mas sem
  verificação em runtime nesta sessão (RAM não permitiu manter `site` +
  `admin` + `dashboard` de pé ao mesmo tempo). Conferir na próxima sessão que
  mexer em `apps/site`.

## Deploy alvo (fase 11 anotou, fase 12 configura)

| Peça | Onde | Observação |
|---|---|---|
| `apps/web` | **Vercel** | Next 14 roda sem ajuste. Os quatro domínios apontam para o MESMO projeto; `HOST_*` e `NEXT_PUBLIC_*_URL` nas variáveis do projeto. |
| `apps/api` + Postgres + Redis | **Railway**, plano Hobby | `QUEUE_WORKERS_ENABLED=false` na réplica web e `true` no worker, se separar. |
| `docker-compose.yml` da raiz | continua existindo | É o ambiente de desenvolvimento local. Railway não o usa. **Não remover.** |

Vercel e Railway buildam UM pacote cada, não o monorepo — `make build-web` e
`make build-api` rodam esse contrato, e o CI o verifica em dois passos
dedicados.

## Fechamento do produto v1 — o que ficou fora e por onde entra

As 9 fases estão concluídas. O que segue NÃO é dívida acidental: é escopo
declarado fora do v1 no `SPEC.md`, com o caminho de entrada documentado.

| Fora do v1 | Estado hoje | Caminho documentado |
|---|---|---|
| **WhatsApp oficial** | `MockNotificationDriver` completo: grava em `NotificationOutbox`, entrega os agendados pela fila, aparece na tela "Mensagens" | `docs/INTEGRACOES.md` — 3 passos (driver ao lado do mock, enum do env, `case` na factory). **Validado seguindo os próprios passos nesta fase**: um driver de sondagem foi escrito, plugado e conferido no log de boot, sem tocar em módulo de negócio nenhum. |
| **Asaas** | `MockPaymentDriver` simula o ciclo inteiro (criar, confirmar, receber, estornar) com aprovação/recusa manual pelo super admin | `docs/INTEGRACOES.md` — mesmos 3 passos, **mais** um controller de webhook (`POST /webhooks/asaas`) que chame os MESMOS serviços que a tela de billing chama. `simulateTransition` deve responder 501 no driver real. Acréscimo, não refatoração. |
| **Google OAuth do cliente** | Botão existe em `ClienteAuth` e responde "Em breve" — não finge autenticar | Mesmo padrão de adapter. É a única funcionalidade desenhada no protótipo que não ficou funcional. |
| **Provedor real do Assistente IA** | `MockAiAssistantDriver` responde por regras; histórico persiste em `AiChatMessage` | `AI_ASSISTANT_ADAPTER`, mesma factory de `adapters.module.ts`. |
| **Upload de logo e capa** | Campo de URL digitada (`TenantSettings.logoUrl`/`coverUrl`) | Precisa de storage (S3/R2) ANTES do seletor de arquivo. O schema não muda; quando o domínio das imagens passar a ser conhecido, o `next/image` entra junto (hoje é `<img>` cru por causa da allowlist de domínio). |
| **Multi-unidade de fato** | O modelo `Unit` existe, tem CRUD e isolamento testado; o motor de grade ainda ignora `unitId` | Filtro por unidade em `AvailabilityService` — o campo já existe em `Appointment` e `Barber`. |

### Números finais

| Suíte | Casos |
|---|---|
| Unitários | 81 |
| E2E | 133 |
| Isolamento de tenant (gate) | 106 |
| **Total** | **320** |

`pnpm turbo run lint typecheck` 11/11 · `pnpm turbo run build` 3/3.

> O total de e2e estava anotado como 129 desde a fase 09: os 4 casos de
> `public-plans.e2e-spec.ts` (fase 10) nunca entraram na conta. São os mesmos
> 133 antes e depois da fase 11 — `apps/api` está byte-a-byte idêntico ao que
> era, conferido por `git diff main -- apps/api`.
>
> A varredura responsiva NÃO está mais "sem pendências": a fase 11 encontrou 12
> alvos de toque abaixo de 44px que a varredura da fase 09 não viu porque mediu
> telas em skeleton. Detalhe nas dívidas da fase 11.

## Como retomar

Abrir sessão nova do Claude Code → colar o conteúdo do próximo
`agentes/agente-NN-*.md` pendente (na ordem da tabela acima). Se uma sessão
estourar o contexto no meio de uma fase, abrir sessão nova, colar o MESMO
agente e acrescentar "continue de onde o CONTEXT.md indica".

Para subir o ambiente: `make env && make install && make up && make seed`
(ou `make reset` para zerar tudo). Detalhe no `README.md` da raiz.

**Desde a fase 11 são só 2 processos**: `api` (:3333) e `web` (:3000). Com a
restrição de RAM da máquina (7.5 GB), `docker compose up -d db redis api` +
`docker compose up -d web` já é a stack inteira — não existe mais a escolha de
"qual das 4 apps subir".

### Como conferir a fase 11 rodando

A stack toda cabe agora: `docker compose up -d db redis api web` (2 processos
Node em vez de 5).

1. **As quatro superfícies, uma porta** — `http://localhost:3000`:

   | URL | O que abre |
   |---|---|
   | `/` | landing de vendas, paleta clara, preços vindos da API |
   | `/agendar` | raiz explicativa do booking |
   | `/barbearia-central` | página pública da barbearia |
   | `/entrar` · `/cadastro` · `/recuperar-senha` | auth do estabelecimento |
   | `/app` | painel (redireciona para `/app/configurar` se o onboarding
     estiver pendente — ver dívidas) |
   | `/admin` | super admin, que redireciona para `/admin/tenants` |

2. **Login pela tela**, `dono@barbeariacentral.com.br` / `BarberVP@2026` → cai
   em `/app`. Com `admin@barbervp.com.br` → cai em `/admin/tenants`. Com
   `carlos@barbeariacentral.com.br` (BARBER) → `/app` com nav restrito
   (Dashboard · Agenda · Comandas · Comissões · Fidelidade) e `/app/agenda`
   mostrando SÓ a coluna do Carlos. Clicar pelo nav leva a `/app/agenda`,
   `/app/comandas`, `/app/financeiro`… — as três coisas foram conferidas no
   navegador nesta sessão.

   **Não confunda com bug de rota**: abrir `/app` ou `/admin` SEM sessão fica no
   skeleton "Carregando sua sessão…" para sempre, em vez de ir para `/entrar`.
   É o deadlock do interceptor de refresh descrito nas dívidas desta fase —
   anterior ao refactor, em `packages/ui`. Faça login primeiro.

3. **Roteamento por host** (o que produção faz). Sobe com as variáveis e testa
   sem DNS nenhum:

   ```bash
   HOST_SITE=barbervp.com HOST_BOOKING=agendar.barbervp.com \
   HOST_APP=app.barbervp.com HOST_ADMIN=admin.barbervp.com \
     pnpm --filter @barbervp/web start

   curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: admin.barbervp.com' \
     http://localhost:3000/admin/tenants        # 200
   curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: app.barbervp.com' \
     http://localhost:3000/admin/tenants        # 404 — a guarda do super admin
   curl -s -H 'Host: agendar.barbervp.com' http://localhost:3000/ \
     | grep -o '<title>[^<]*'                   # "Agendamento online"
   curl -s -H 'Host: app.barbervp.com' http://localhost:3000/agenda \
     | grep -o '<title>[^<]*'                   # painel — URL antiga ainda vale
   curl -s -H 'Host: admin.barbervp.com' http://localhost:3000/robots.txt
                                                # Disallow: /
   ```

4. **Cabeçalhos por superfície** (o que os 4 middlewares antigos faziam):
   `/entrar` → `cache-control: no-store` + `referrer-policy: no-referrer`;
   `/app/*` e `/admin/*` → `x-robots-tag: noindex, nofollow, noarchive` +
   `x-frame-options: DENY`; landing e booking → sem `noindex`.

5. **Build isolado — é o contrato do deploy**, e o CI roda os dois:

   ```bash
   make build-web   # pnpm --filter @barbervp/web... build   (Vercel)
   make build-api   # pnpm --filter @barbervp/api... build   (Railway)
   ```

6. **Testes**: `make test` (81 unit), `make test-e2e` (133),
   `make test-isolation` (106). Todos verdes nesta sessão, iguais à baseline.

7. **Varredura responsiva**: `node scripts/responsive-sweep.mjs --app=site` (e
   `booking`, `dashboard`, `admin`). Rodar UMA superfície por vez — a varredura
   completa esgotou recursos do Chrome nesta máquina no meio do `dashboard`.
   Site (20/20) e booking (10/10) passam; `dashboard` e `admin` reprovam nos
   alvos de toque das abas — dívida pré-existente, ver fase 11.

8. **`make seed` de novo ao terminar** se tiver mexido no `onboardingDoneAt`
   para conferir o painel.

> **Atenção às seções abaixo (fases 03 a 08).** Elas foram escritas quando o
> frontend eram 4 apps em 4 portas. As URLs `localhost:3000/3001/3002/3003`
> viraram uma só, `localhost:3000`, com prefixo — traduza assim ao seguir
> qualquer roteiro antigo:
>
> | Antes | Agora |
> |---|---|
> | `:3000/` · `:3000/entrar` · `:3000/cadastro` | `:3000/` · `:3000/entrar` · `:3000/cadastro` |
> | `:3001/{slug}` | `:3000/{slug}` |
> | `:3001/` | `:3000/agendar` |
> | `:3002/` · `:3002/agenda` · `:3002/configurar` | `:3000/app` · `:3000/app/agenda` · `:3000/app/configurar` |
> | `:3003/` · `:3003/tenants` | `:3000/admin` · `:3000/admin/tenants` |
>
> Tudo o mais nesses roteiros (contas do seed, `psql`, endpoints da API) segue
> valendo — `apps/api` não mudou na fase 11.

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

### Como conferir a fase 07 rodando

**Cuidado com RAM**: a stack completa (`make up`, 4 apps Next.js + api + db +
redis) já derrubou o VSCode numa máquina com 7.5GB de RAM. Prefira
`docker compose up -d db redis api` (só o backend) para os passos 1–2 abaixo,
e suba `dashboard` separadamente só se for olhar a UI (`docker compose up -d
dashboard`, sozinho — não precisa de `site`/`booking`/`admin` para ver o
painel). `docker compose stop` entre uma coisa e outra.

1. **Login + ciclo completo** (só precisa de `db`+`redis`+`api`):
   ```bash
   TOKEN=$(curl -s -X POST http://localhost:3333/api/v1/auth/login \
     -H 'Content-Type: application/json' \
     -d '{"email":"dono@barbeariacentral.com.br","password":"BarberVP@2026"}' \
     | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).accessToken))")
   curl -s http://localhost:3333/api/v1/orders/catalog -H "Authorization: Bearer $TOKEN"
   ```
   Abrir comanda (`POST /orders`), adicionar item (`POST /orders/:id/items`),
   fechar com pagamento que NÃO bate (`400`) e depois com o valor certo
   (`201`, `status: CLOSED`) — confirma no Prisma Studio que `CommissionEntry`
   nasceu, `Product.stock` baixou e `LoyaltyPoints` creditou.
2. **Feature flags por plano** (o tenant demo é Avançado; baixar o tier na
   marra pra conferir o 403):
   ```bash
   docker exec barbervp-db psql -U barbervp -d barbervp -c \
     "UPDATE \"Tenant\" SET \"planId\"=(SELECT id FROM \"SaasPlan\" WHERE code='essencial') WHERE slug='barbearia-central';"
   curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3333/api/v1/finance/payables -H "Authorization: Bearer $TOKEN"
   # 403 — depois, restaurar:
   docker exec barbervp-db psql -U barbervp -d barbervp -c \
     "UPDATE \"Tenant\" SET \"planId\"=(SELECT id FROM \"SaasPlan\" WHERE code='avancado') WHERE slug='barbearia-central';"
   ```
3. **Swagger**: `http://localhost:3333/api/docs` — todos os endpoints desta
   fase já documentados (`@ApiOperation`), inclusive os gates de feature.
4. **Testes**: `make test` (80 unit — 1 é probabilístico, ver dívidas),
   `pnpm --filter @barbervp/api test:e2e` (81), `make test-isolation` (52).
   Todos verdes na última rodada desta sessão.
5. **`make seed` de novo ao terminar** — os testes/smoke rodam contra o
   banco de dev; reseedar deixa os dados como o próximo agente espera
   encontrar.
6. **Front-end** (suba só `dashboard`, sem as outras 3 apps): login em
   `http://localhost:3002` com `dono@barbeariacentral.com.br` /
   `BarberVP@2026` — as 9 rotas desta fase estão no nav (Comandas,
   Financeiro, Comissões, Fidelidade, WhatsApp, Assistente IA, Relatórios,
   Configurações, Minha Página). No POS (`/comandas`), abra uma comanda e
   redimensione a janela abaixo de 1024px: a coluna da comanda vira uma
   barra fixa embaixo com o subtotal, que abre como bottom-sheet.
7. **`docker compose stop` ao terminar** — não deixar a stack de pé sem
   necessidade.

### Como conferir a fase 08 rodando

**Mesmo cuidado com RAM da fase 07**: suba só o que for usar
(`docker compose up -d db redis api` pro backend; `admin`/`dashboard` juntos
só se for testar a impersonação de ponta a ponta) e `docker compose stop`
entre uma coisa e outra.

1. **Login super admin** (só precisa de `db`+`redis`+`api`):
   ```bash
   TOKEN=$(curl -s -X POST http://localhost:3333/api/v1/auth/login \
     -H 'Content-Type: application/json' \
     -d '{"email":"admin@barbervp.com.br","password":"BarberVP@2026"}' \
     | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).accessToken))")
   curl -s http://localhost:3333/api/v1/admin/tenants -H "Authorization: Bearer $TOKEN"
   curl -s http://localhost:3333/api/v1/admin/metrics -H "Authorization: Bearer $TOKEN"
   ```
2. **Plano muda gate na hora** (sem novo login): troque o plano do tenant
   demo pra `essencial` via `PATCH /admin/tenants/:id/plan` — `GET
   /commissions/rules` do dono vira 403 `FEATURE_NOT_IN_PLAN` imediatamente;
   volte pra `avancado` e o 403 some sem o dono precisar relogar.
3. **Suspender bloqueia login**: `PATCH /admin/tenants/:id/suspend` — login
   do dono (`POST /auth/login`) passa a responder 403 `TENANT_SUSPENDED`.
   `PATCH .../reactivate` devolve o acesso. **Restaure o tenant demo pro
   status `ACTIVE` e plano `avancado` ao terminar** (ou rode `make seed`).
4. **Impersonar**: `POST /admin/tenants/:id/impersonate` devolve um
   `accessToken` que resolve em `GET /auth/me` como o OWNER de verdade (não
   como o super admin) — confira `AuditLog` (`ADMIN_TENANT_IMPERSONATED`)
   gravado com `targetOwnerUserId`.
5. **Front-end completo** (suba `admin` + `dashboard` juntos):
   `http://localhost:3003` (login super admin) → `/tenants` → clique num
   tenant → drawer com suspender/reativar/trocar plano/"Impersonar dono" —
   o botão redireciona pro `dashboard` já logado como o OWNER, com a barra
   de aviso de impersonação fixa no topo e "Sair da impersonação" voltando
   pro admin. `/planos` (criar/editar plano, checkbox de feature) e
   `/billing` ("Rodar ciclo de cobrança" → aprovar/recusar fatura pendente)
   também navegáveis.
6. **Testes**: `make test` (80 unit), `pnpm --filter @barbervp/api test:e2e`
   (91), `make test-isolation` (52). Todos verdes na última rodada desta
   sessão.
7. **`make seed` de novo ao terminar** — a verificação ao vivo desta fase
   mexe em status/plano de tenant real; reseedar garante que o próximo
   agente encontra `Barbearia Central` como `ACTIVE`/`avancado`.
8. **`docker compose stop` ao terminar** — não deixar a stack de pé sem
   necessidade.
