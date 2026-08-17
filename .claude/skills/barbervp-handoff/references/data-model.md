# Modelo de dados — base do schema Prisma

Base conceitual. O agente 01 escreve o schema completo lendo os `.dc.html`
(campos e enums reais). Nomes em inglês no schema; UI em pt-BR.

## Princípios

1. **`tenantId` obrigatório** em todo modelo de negócio (exceto os globais
   marcados abaixo). Índice composto `(tenantId, ...)` nas consultas quentes.
2. **Cliente é global, perfil é por barbearia**: `Client` (global, telefone
   como identidade, OTP) ↔ `ClientProfile` (por tenant: notas, tags,
   preferências, consentimento LGPD).
3. **Soft delete** (`deletedAt`) em entidades com histórico financeiro.
4. **Money = Int em centavos**. Nunca float.
5. **Datas em UTC**; timezone da barbearia em `Tenant.timezone`.

## Modelos principais

**Globais (sem tenantId):**
- `Tenant` — slug, nome, timezone, status (TRIAL/ACTIVE/SUSPENDED/CANCELED), planId
- `SaasPlan` — planos do SaaS; `features Json` (feature flags) e limites (nº barbeiros, etc.)
- `TenantSubscription` — assinatura da barbearia no SaaS (ciclo, status, mock Asaas)
- `User` — login de estabelecimento (email único global) + `Membership`
  (userId, tenantId, role OWNER/MANAGER/BARBER) — um user pode estar em N tenants
- `Client` — telefone (identidade), nome, email?, verificação OTP
- `AuditLog` — quem, o quê, quando, tenant, payload resumido
- `NotificationOutbox` / `MailOutbox` — mensagens "enviadas" pelos drivers mock

**Por tenant:**
- `Barber` — vínculo a Membership; bio, foto, ativo
- `Service` — nome, durationMin, priceCents, categoria, ativo
  (seed com os reais do wizard: Corte Masculino 45min, Barba 30min,
  Corte + Barba 70min, Corte Infantil 30min, Sobrancelha, Pigmentação, Relaxamento)
- `BarberService` — quais serviços cada barbeiro executa (e preço override opcional)
- `WorkSchedule` / `ScheduleException` — jornada semanal + folgas/bloqueios
- `Appointment` — clientId, barberId, serviços, start/end (`tstzrange` para o
  EXCLUDE), status (SCHEDULED/CONFIRMED/DONE/NO_SHOW/CANCELED), origem
  (PUBLIC/DASHBOARD), canal de criação, `subscriptionUsageId?`
- `ClientPlan` — planos de assinatura/fidelidade que a barbearia vende ao
  cliente (ex.: X cortes/mês); `ClientSubscription` + `SubscriptionUsage`
  (débito atômico por agendamento concluído)
- `LoyaltyProgram` / `LoyaltyPoints` — fidelidade por pontos, se presente no Dashboard
- `Product` — estoque simples, preço, custo
- `Order` (Comanda) — status OPEN/CLOSED/CANCELED; `OrderItem`
  (SERVICE/PRODUCT, referência, qty, unitPriceCents, barberId p/ comissão);
  `Payment` (método CASH/PIX/CARD/SUBSCRIPTION, valorCents) — fechamento em
  **uma transação**: valida soma, baixa estoque, gera comissões, marca
  appointment DONE, debita assinatura se aplicável
- `CommissionRule` (por barbeiro/serviço, % ou fixo) + `CommissionEntry`
  (gerada no fechamento da comanda)
- `CashRegister` / `CashMovement` — abertura/fechamento de caixa, sangria,
  reforço (se presente no Dashboard — confirmar ao ler)
- `TenantSettings` — horários, políticas de cancelamento, intervalos de slot,
  branding da página pública

## Constraints críticas (migration SQL manual junto ao Prisma)

```sql
-- extensão para EXCLUDE com igualdade
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- anti double-booking por barbeiro (ignora cancelados)
ALTER TABLE "Appointment" ADD CONSTRAINT no_double_booking
EXCLUDE USING gist (
  "barberId" WITH =,
  "timeRange" WITH &&
) WHERE (status NOT IN ('CANCELED', 'NO_SHOW'));
```

- Débito de assinatura: `UPDATE ... SET used = used + 1 WHERE id = $1 AND used < quota RETURNING *` — se 0 linhas, recusar.
- Fechamento de comanda: `prisma.$transaction` com isolamento serializable ou locks explícitos.

## Seed (dados REAIS do bundle)

- 1 tenant demo (ex.: slug `barbearia-vp`) + 1 tenant secundário (para testes
  de isolamento)
- Barbeiros: Carlos Silva, Bruno Costa, Diego Alves, Rafael Souza, Maria Fernanda
- Serviços: os 7 do wizard com durações/preços reais dos `.dc.html`
- Planos SaaS: extrair da tela Vendas
- Planos de cliente: extrair de AssinaturaCliente
- Clientes, agendamentos e comandas de exemplo coerentes entre si
