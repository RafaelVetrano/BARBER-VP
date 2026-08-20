-- Fase 09 (hardening) — índices que faltavam nas consultas de relatório.
--
-- Escrita à mão, como todas as outras: o auto-diff do Prisma não sobrevive à
-- coluna gerada `Appointment.timeRange` (ver CONTEXT.md, fase 01).
--
-- `CONCURRENTLY` fica de fora de propósito: ele não roda dentro de uma
-- transação, e o `migrate deploy` envolve cada migration numa. Nas tabelas de
-- uma barbearia o lock é de milissegundos; se um dia a base justificar, o
-- índice se cria à mão fora do migrate.

-- Relatório avançado: `WHERE tenantId = ? AND status = 'CLOSED' AND closedAt
-- ENTRE ? E ?` aparece em TRÊS das quatro queries (faturamento por barbeiro,
-- por serviço e por dia). O índice existente `(tenantId, status)` obriga a ler
-- todas as comandas fechadas do tenant desde sempre para depois filtrar por
-- data — full scan disfarçado assim que o histórico cresce.
CREATE INDEX IF NOT EXISTS "Order_tenantId_status_closedAt_idx"
  ON "Order" ("tenantId", "status", "closedAt");

-- Faturamento por serviço: junta `OrderItem` por `orderId` e filtra por
-- `kind = 'SERVICE'`. O índice atual é só `(tenantId, orderId)`, então o
-- filtro de tipo e o agrupamento por serviço saem em memória.
CREATE INDEX IF NOT EXISTS "OrderItem_tenantId_kind_serviceId_idx"
  ON "OrderItem" ("tenantId", "kind", "serviceId");

-- Extrato de comissões do mês (`GET /commissions/period`): o índice existente
-- começa por `barberId`, o que serve à consulta de UM barbeiro mas não à do
-- período inteiro, que varre o mês do tenant.
CREATE INDEX IF NOT EXISTS "CommissionEntry_tenantId_referenceMonth_idx"
  ON "CommissionEntry" ("tenantId", "referenceMonth");

-- (Contas a pagar/receber já tinham `(tenantId, status, dueDate)` desde a
-- fase 07 — conferido no banco, nada a fazer aqui.)

-- Dreno do outbox (fase 09): o worker pergunta a cada minuto por
-- `status = 'PENDING' AND attempts < 5 AND scheduledFor <= now()`. Já existe
-- `(status, scheduledFor)`; o `attempts` entra para o índice cobrir o filtro
-- inteiro e a varredura não tocar a tabela.
CREATE INDEX IF NOT EXISTS "NotificationOutbox_status_attempts_scheduledFor_idx"
  ON "NotificationOutbox" ("status", "attempts", "scheduledFor");
