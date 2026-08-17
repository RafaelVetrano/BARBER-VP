# Templates dos 9 agentes do BarberVP

Cada fase abaixo é o template de um `agente-NN-nome.md`. Preencher os
`[colchetes]` com dados REAIS lidos do bundle. Manter a ordem — as
dependências são reais.

## Estrutura comum de todo agente

```
# Agente NN — [Nome da fase]

Projeto: **BarberVP** — SaaS multi-tenant de gestão de barbearias.
NÃO é MVP: qualidade, segurança e responsividade de produto profissional.

## Leia primeiro
1. `CONTEXT.md` — estado atual (confirmar fases [deps] como ✅)
2. `SPEC.md` — [seções relevantes]
3. [apenas os .dc.html desta fase]

## Regras invioláveis (valem nesta sessão)
[colar as 6 regras do README: responsividade, zero mock no front, isolamento
de tenant, regras estruturais, adapters, segurança]

## Sua tarefa nesta sessão
[Escopo claro: o que entra, o que NÃO entra (e em qual agente entra).]
[Tarefas imperativas organizadas por backend / frontend / testes.]

## Critérios de aceite
[Verificações objetivas, incluindo o checklist de responsividade quando
houver frontend.]

## Ao finalizar
Atualizar `CONTEXT.md`: fase NN ✅, endpoints criados, decisões, dívidas.
```

---

## Agente 01 — Fundação

Escopo: infraestrutura que todas as fases usam. Nada de feature de produto.
NÃO entra: nenhuma tela, nenhum endpoint de negócio além de /health.

Tarefas:
- **Monorepo**: pnpm + Turborepo com `apps/api`, `apps/site`, `apps/booking`,
  `apps/dashboard`, `apps/admin`, `packages/ui`, `packages/types`,
  `packages/config`. `.gitignore`, `.env.example` completo, `Makefile`
  (up/down/logs/migrate/seed/reset/test/test-isolation), README raiz.
- **Docker Compose dev**: postgres:16 (healthcheck), redis, api, 4 webs;
  `docker-compose.prod.yml` + Dockerfiles multi-stage.
- **NestJS skeleton**: config module com validação de env, pino logger,
  ValidationPipe global (whitelist + forbidNonWhitelisted), helmet, CORS por
  origem, throttler, filtro global de exceções, interceptor de requestId,
  Swagger, `GET /health` (checa db + redis).
- **TenantGuard + decorators**: extração de tenant (JWT ou slug em rotas
  públicas), `@CurrentTenant()`, `@Roles()`. Ainda sem auth real (stub que a
  fase 03 completa) — mas a ESTRUTURA de isolamento nasce aqui.
- **Prisma**: schema COMPLETO conforme `SPEC.md`/`data-model` (ler os
  .dc.html para campos/enums reais), migrations, migration SQL manual com
  `btree_gist` + EXCLUDE anti double-booking, `seed.ts` com os dados REAIS
  ([barbeiros], [serviços com duração/preço], planos da tela Vendas, planos
  de AssinaturaCliente, 2 tenants — um para testes de isolamento).
- **Esqueleto da suíte de isolamento**: helper de teste que cria 2 tenants e
  afirma que consultas de um nunca retornam dados do outro (rodará vazia
  agora; toda fase adiciona casos).
- **Frontends**: as 4 apps Next.js 14 bootadas com preset Tailwind de
  `packages/config` (tokens reais), fonte Sora+Inter, página placeholder,
  axios client + TanStack Query provider em `packages/ui` ou lib comum.

Aceite: `make up` sobe limpo; `/health` 200; seed popula; as 4 apps rendem
placeholder com o tema escuro correto; `make test-isolation` roda (verde, vazio).

---

## Agente 02 — Design system (`packages/ui`)

Escopo: portar o design system dos `.dc.html` para componentes React
compartilhados, responsivos, tipados. NÃO entra: páginas reais.

Ler: [Dashboard.dc.html e AgendamentoWizard.dc.html — os mais ricos em
componentes] + estilos globais de todos.

Tarefas:
- **Tokens**: cores reais (`#0F1115`, `#12151A`, `#181B21`, `#1F232B`,
  `#2A2F38`, `#D4A84C`, `#3FB68B`, `#E05B5B`, `#E8A13C`, `#5B8DE0`,
  `#F2F3F5`, `#9AA1AC`, `#5B616B`), fontes Sora/Inter, radii, sombras,
  `@keyframes` reais extraídos ([listar]) — tudo no preset Tailwind.
- **Ícones**: portar os SVGs do protótipo como componentes (NÃO lucide).
- **Primitives**: [listar os reais: Button, Input, Select, Modal/Drawer
  (portal, scroll lock, bottom-sheet < md), Card, Badge/StatusPill, Tabs
  (roláveis no mobile), Table→CardList responsivo, Toast, EmptyState,
  Skeleton, Avatar, DatePicker/TimeChips, StatCard...]. Tipagem completa,
  estados hover/focus/disabled/loading.
- **Padrões responsivos**: componente `ResponsiveTable` (tabela ≥ md, cards
  < md) e `AppShell` do dashboard (sidebar drawer/fixa) já nesta fase.
- **Storybook ou página /playground** em uma das apps para inspeção visual.

Aceite: playground renderiza todos os primitives em 360/768/1440 sem quebra;
zero cor/fonte fora dos tokens.

---

## Agente 03 — Auth & Tenancy

Escopo: toda autenticação e o onboarding do tenant.
NÃO entra: telas de negócio (booking, dashboard).

Ler: `BarberVP Login Estabelecimento.dc.html`, `BarberVP Cadastro
Estabelecimento.dc.html`, `BarberVP Configurar Barbearia.dc.html`,
`ClienteAuth.dc.html`.

Tarefas backend:
- Registro de estabelecimento: cria User + Tenant (TRIAL) + Membership OWNER
  em transação; slug único gerado/validado.
- Login estabelecimento: JWT access 15min + refresh httpOnly com rotação e
  revogação (tabela de sessões); logout; troca de senha; recuperação via
  MailOutbox mock.
- Auth cliente: OTP 6 dígitos por telefone (NotificationOutbox mock), rate
  limit agressivo, expiração 5min, máx. tentativas; sessão do cliente
  separada da de estabelecimento (audiences distintas no JWT).
- RBAC completo: guards `@Roles()` funcionais; TenantGuard resolve tenant do
  token; membership múltiplo (user em N tenants → seletor de contexto).
- Onboarding (Configurar Barbearia): endpoints de TenantSettings, horários,
  serviços iniciais — conforme os passos REAIS da tela.
- AuditLog em: login, troca de senha, criação de tenant, alterações de settings.
- Casos de isolamento: token do tenant A em rota do tenant B → 403.

Tarefas frontend:
- `apps/site`: telas de Login e Cadastro Estabelecimento pixel-faithful e
  responsivas; fluxo pós-cadastro redireciona ao onboarding no dashboard.
- `apps/dashboard`: wizard Configurar Barbearia [passos reais da tela].
- `apps/booking`: ClienteAuth (login OTP) [estados reais da tela: entrada de
  telefone, código, reenvio com cooldown].
- Middleware/guards de rota nas apps; refresh automático no axios.

Aceite: fluxos completos funcionando contra a API; isolamento testado;
responsividade checklist.

---

## Agente 04 — Booking público

Escopo: página pública da barbearia + wizard de agendamento de ponta a ponta.
NÃO entra: MinhaConta/Assinatura (agente 05).

Ler: `Agendamento Publico.dc.html`, `AgendamentoWizard.dc.html`.

Tarefas backend:
- Rota pública por slug: dados da barbearia, serviços ativos, barbeiros e
  seus serviços, branding (TenantSettings).
- **Motor de disponibilidade**: slots a partir de WorkSchedule + exceções +
  agendamentos existentes + duração do serviço + intervalo de slot do tenant;
  timezone do tenant; nunca oferecer slot passado.
- Criação de agendamento: cliente autenticado OU guest via OTP (verifica →
  cria/associa Client). Corrida de slot tratada: EXCLUDE constraint dispara →
  responder 409 com mensagem amigável; teste automatizado de corrida
  (2 requests simultâneos, só 1 vence).
- Cancelamento/remarcação pelo cliente conforme política do tenant.
- Enfileirar confirmação + lembrete via NotificationAdapter (mock).

Tarefas frontend (`apps/booking`, mobile-first):
- Página pública `/{slug}` [seções reais da tela].
- Wizard [passos reais: serviço → barbeiro (ou "sem preferência") → data/hora
  → identificação/OTP → confirmação], um passo por tela no mobile, botão fixo
  no rodapé, grade de horários em chips responsivos.
- Estados: carregando (skeleton), sem horários, erro 409 (slot perdido →
  voltar à grade atualizada), sucesso [conforme tela].
- SEO: metadata dinâmica por barbearia.

Aceite: agendar de ponta a ponta no mobile 360px; teste de corrida verde;
isolamento (slug A não vê dados de B).

---

## Agente 05 — Área do cliente

Escopo: MinhaConta + assinaturas/fidelidade do cliente + LGPD.
NÃO entra: gestão desses planos pela barbearia (agente 07).

Ler: `MinhaConta.dc.html`, `AssinaturaCliente.dc.html`.

Tarefas backend:
- Perfil do cliente (global) + perfil por barbearia; histórico e próximos
  agendamentos; cancelar/remarcar.
- Assinatura do cliente: listar planos do tenant, assinar (PaymentAdapter
  mock — cobrança simulada), status, **débito de uso atômico** ao concluir
  agendamento coberto, renovação de ciclo via job BullMQ mock.
- LGPD: consentimento versionado, exportação dos dados (JSON), solicitação
  de exclusão (anonimização preservando integridade financeira). Separar
  claramente LGPD de preferências de notificação [como a tela faz].
- Preferências de notificação por canal.

Tarefas frontend (`apps/booking`):
- MinhaConta [abas/seções reais da tela], AssinaturaCliente [planos, estado
  ativo, usos restantes conforme tela]. Responsivo mobile-first.

Aceite: assinar plano mock, agendar consumindo uso, ver saldo decrementar;
exportação LGPD baixa JSON; checklist responsivo.

---

## Agente 06 — Dashboard I (operação)

Escopo: shell do dashboard + Agenda, Clientes, Serviços, Produtos, Equipe +
visão do funcionário. NÃO entra: Comandas/Financeiro/Relatórios (agente 07).

Ler: `Dashboard.dc.html` (abas desta fase), `DashboardFuncionario.dc.html`,
`CadastroFuncionario.dc.html`.

Tarefas backend:
- CRUDs com paginação/busca/filtros: Clients (perfil por tenant), Services,
  Products (com estoque), Barbers + WorkSchedule + exceções.
- Convite de funcionário [fluxo real de CadastroFuncionario]: e-mail mock com
  token, aceite cria Membership BARBER.
- Agenda interna: visão por dia/semana/barbeiro; criar/mover/cancelar
  agendamento pelo staff (mesmo motor de disponibilidade do agente 04);
  walk-in (sem cliente cadastrado).
- Permissões: BARBER só vê a própria agenda/dados [conforme
  DashboardFuncionario]; testes de isolamento + de papel.

Tarefas frontend (`apps/dashboard`):
- AppShell com sidebar [itens reais], topbar, seletor de tenant se múltiplo.
- Módulos desta fase pixel-faithful e responsivos (tabelas→cards, agenda
  dia-único no mobile). Reusar nomes de handlers/estados do protótipo.
- DashboardFuncionario como visão condicionada por papel [conforme tela].

Aceite: operação diária completa sem tocar no banco; papel BARBER limitado;
checklist responsivo em todos os módulos.

---

## Agente 07 — Dashboard II (financeiro)

Escopo: Comandas (POS), Comissões, Financeiro, Relatórios, gestão de
Assinaturas/Fidelidade, Configurações. NÃO entra: super admin.

Ler: `Dashboard.dc.html` (abas restantes).

Tarefas backend:
- **Comanda**: abrir (com/sem agendamento), itens serviço/produto, descontos
  [se a tela tiver], **fechamento em transação única**: valida pagamentos =
  total, baixa estoque, gera CommissionEntry por regra, marca Appointment
  DONE, debita SubscriptionUsage se pagamento por assinatura. Reabertura só
  MANAGER+ com auditoria.
- Comissões: regras por barbeiro/serviço; extrato por período; fechamento.
- Caixa [se presente na tela]: abertura/fechamento, sangria, reforço.
- Financeiro/Relatórios: faturamento por período/barbeiro/serviço, ticket
  médio, ocupação, no-show — endpoints agregados eficientes (SQL, não N+1).
- Gestão de planos do cliente e fidelidade [conforme abas reais].
- Configurações do tenant [conforme tela]; **feature flags do plano SaaS
  aplicadas server-side** (ex.: relatórios avançados só em plano X → 403 no
  endpoint, upsell discreto no dashboard, NUNCA exposto ao cliente final).

Tarefas frontend: módulos restantes pixel-faithful e responsivos; POS com
layout duas-colunas ≥ lg e bottom-sheet no mobile; gráficos responsivos.

Aceite: ciclo completo agendamento → comanda → fechamento → comissão →
relatório batendo valores; transação do fechamento coberta por teste;
checklist responsivo.

---

## Agente 08 — Super Admin

Escopo: `apps/admin` completo. Sem tela no bundle — seguir o design system.
NÃO entra: gateway real.

Tarefas backend:
- Papel SUPER_ADMIN (fora de tenants); rotas `/admin/*` com guard próprio.
- CRUD de SaasPlan (preço, limites, feature flags Json).
- Tenants: listar/buscar, detalhes (uso, métricas), suspender/reativar,
  trocar plano, impersonar OWNER (com auditoria pesada e banner visual).
- Billing das barbearias via PaymentAdapter mock: ciclo de cobrança
  simulado (job BullMQ), aprovar/recusar cobrança manualmente para testar
  fluxos de inadimplência → SUSPENDED.
- Métricas da plataforma: MRR mock, tenants ativos, churn.

Tarefas frontend (`apps/admin`): shell igual ao dashboard, módulos acima,
responsivo.

Aceite: criar plano, trocar plano de tenant e ver feature flag refletir no
dashboard do tenant (403 + upsell); suspensão bloqueia login do tenant.

---

## Agente 09 — Integrações mock & Hardening (GATE FINAL)

Escopo: consolidar adapters, filas, testes e polish final.

Tarefas:
- **Adapters**: revisar `NotificationAdapter`/`PaymentAdapter`/`MailAdapter`
  — nenhum módulo importa driver concreto; documentar contrato de cada
  interface (para plugar WhatsApp/Asaas depois sem refatorar); telas de
  outbox no super admin (ver "mensagens enviadas").
- **BullMQ**: lembretes de agendamento (T-24h/T-2h conforme settings),
  renovação de assinaturas, ciclo de billing; retries/backoff; painel
  simples de jobs no admin ou bull-board.
- **Suíte de isolamento de tenant COMPLETA** (gate de aceite): para cada
  recurso de negócio, teste cross-tenant (leitura e escrita) → 403/404.
  Reprovou = a fase não fecha.
- E2E dos fluxos críticos: cadastro estabelecimento → onboarding → serviço →
  agendamento público → comanda → fechamento → relatório.
- Hardening: revisar rate limits, headers, tamanho de payload, enum de erros
  consistente, logs sem PII, índices de banco nas queries dos relatórios.
- Polish responsivo: varrer TODAS as telas nos 5 tamanhos; corrigir quebras.
- Docs finais: README de deploy, `.env.example` conferido, guia "como plugar
  WhatsApp/Asaas" descrevendo só a troca de driver.

Aceite: `make test` + `make test-isolation` verdes; e2e verde; varredura
responsiva sem pendências; documentação de integração futura escrita.
