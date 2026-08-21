-- Fase 13 (auditoria do Dashboard) — meta de faturamento e o índice do KPI de
-- clientes novos.
--
-- Escrita à mão, como todas as outras: o auto-diff do Prisma não sobrevive à
-- coluna gerada `Appointment.timeRange` (ver CONTEXT.md, fase 01).

-- A linha tracejada do gráfico "Faturamento — últimos 30 dias" vinha cravada
-- no protótipo ("Meta: R$ 28.000/mês"). Meta é dado da barbearia, não do
-- desenho: nasce aqui, nula por padrão, e o gráfico só desenha a linha quando
-- ela existe.
ALTER TABLE "TenantSettings" ADD COLUMN IF NOT EXISTS "monthlyGoalCents" INTEGER;

-- "Novos clientes (mês)" agrupa `firstVisitAt` por mês dentro do tenant, e a
-- sparkline faz isso para 8 meses de uma vez. O índice existente é
-- `(tenantId, lastVisitAt)` — serve à faixa de inatividade dos alertas, não a
-- esta.
CREATE INDEX IF NOT EXISTS "ClientProfile_tenantId_firstVisitAt_idx"
  ON "ClientProfile" ("tenantId", "firstVisitAt");
