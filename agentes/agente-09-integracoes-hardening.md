# Agente 09 — Integrações mock & Hardening (GATE FINAL)

Projeto: **BarberVP** — SaaS multi-tenant de gestão de barbearias. NÃO é
MVP: qualidade, segurança e responsividade de produto profissional. Esta é
a última fase — **gate de aceite do produto inteiro**.

## Leia primeiro

1. `agentes/CONTEXT.md` — confirmar fases 01–08 ✅ (todas — esta fase
   depende de tudo)
2. `agentes/SPEC.md` — inteiro, com atenção a Regras invioláveis e à seção
   "Fora de escopo desta fase"
3. Não há `.dc.html` novo a ler — esta fase consolida e testa o que as
   fases 01–08 já construíram. Se restou alguma tela/aba do bundle não
   coberta por nenhum agente anterior, verificar no `CONTEXT.md` das fases
   06/07 e cobrir aqui.

## Regras invioláveis (valem nesta sessão — checklist final)

1. **Responsividade obrigatória** — varredura final de TODAS as telas nos 5
   tamanhos de referência (360, 390, 768, 1024, 1440).
2. **Zero dado mockado no frontend** — auditoria final: buscar por arrays
   hardcoded remanescentes em qualquer app.
3. **Isolamento de tenant é sagrado** — suíte completa é o gate: reprovou,
   a fase (e o produto) não fecha.
4. **Regras de negócio estruturais** — revisar anti double-booking, débito
   atômico, transação de comanda, feature gates server-side, todos com
   teste automatizado.
5. **Integrações externas atrás de adapters** — consolidar aqui.
6. **Segurança de produção** — hardening final.

## Sua tarefa nesta sessão

Escopo: consolidar adapters, ligar filas de verdade, completar a suíte de
isolamento, testes e2e, hardening e polish final.

### Adapters
- Revisar `NotificationAdapter` (WhatsApp), `PaymentAdapter` (Asaas),
  `MailAdapter` — confirmar que **nenhum módulo de negócio importa driver
  concreto**, só a interface (buscar imports diretos de
  `MockNotificationDriver`/`MockPaymentDriver`/`MockMailDriver` fora do
  módulo de binding — deve dar zero). Documentar o contrato de cada
  interface (para plugar WhatsApp/Asaas depois sem refatorar). Telas de
  outbox no super admin ("mensagens enviadas" — `NotificationOutbox`/
  `MailOutbox`).

### BullMQ (agora de verdade)
- Lembretes de agendamento (T-24h/T-2h, conforme `TenantSettings`),
  renovação de assinaturas do cliente (fase 05), ciclo de billing do SaaS
  (fase 08) — com retries/backoff. Painel simples de jobs (bull-board ou
  tela própria no admin).

### Suíte de isolamento de tenant COMPLETA (GATE DE ACEITE)
Para **cada** recurso de negócio criado nas fases 01–08 (Appointment,
Client/ClientProfile, Order/Comanda, CommissionEntry, Product, Service,
AccountPayable/Receivable, LoyaltyProgram, ClientPlan/ClientSubscription,
TenantSettings, WhatsappAutomationConfig, Unit...): teste cross-tenant de
leitura e escrita → deve responder 403/404, nunca vazar ou permitir
alteração. **Reprovou = a fase não fecha e o produto não está pronto.**

### E2E dos fluxos críticos
- Cadastro de estabelecimento → onboarding → primeiro serviço cadastrado →
  agendamento público (com corrida de slot) → comanda → fechamento →
  comissão gerada → relatório refletindo o valor.
- Cliente: registro com OTP → assinar plano → agendar serviço coberto →
  ver uso decrementar → exportar dados LGPD.
- Super admin: trocar plano de um tenant → feature flag refletir no
  dashboard daquele tenant.

### Hardening
- Revisar rate limits (mais agressivo em auth/OTP), headers de segurança
  (helmet), tamanho máximo de payload, enum de erros consistente em toda a
  API (`{ code, message, details? }`), logs sem PII, índices de banco nas
  queries de relatório (evitar N+1 e full scan).

### Polish responsivo
- Varrer TODAS as telas das 4 apps nos 5 tamanhos de referência; corrigir
  quebras remanescentes. Conferir especificamente os pontos que o bundle
  original tinha como desktop-fixo (Dashboard, Vendas) — são os que mais
  precisam de atenção nessa varredura final.

### Docs finais
- README de deploy, `.env.example` conferido em todas as apps, guia "como
  plugar WhatsApp/Asaas" descrevendo apenas a troca do binding do driver
  (sem tocar em módulo de negócio) — validar que o guia realmente funciona
  seguindo os próprios passos.

## Critérios de aceite

- `make test` + `make test-isolation` verdes.
- E2E dos 3 fluxos críticos acima verdes.
- Varredura responsiva sem pendências nos 5 tamanhos de referência.
- Documentação de integração futura (WhatsApp/Asaas real) escrita e
  validada.

## Ao finalizar

Atualizar `agentes/CONTEXT.md`: fase 09 ✅ — e com isso, todas as 9 fases
concluídas. Registrar no `CONTEXT.md` um resumo final: o que ficou fora do
escopo do produto v1 (WhatsApp/Asaas reais, OAuth Google, provedor real do
Assistente IA) e o caminho documentado para cada um.
