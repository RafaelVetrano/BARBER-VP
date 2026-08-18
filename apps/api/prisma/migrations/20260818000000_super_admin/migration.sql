-- ─────────────────────────────────────────────────────────────────────────────
-- Fase 08 — Super Admin
--
-- Escrita à mão a partir de `prisma migrate diff` (mesmo motivo das
-- anteriores: o diff bruto tenta mexer na coluna GERADA `Appointment.timeRange`).
--
-- Quase todo o modelo de dados desta fase já existia desde a fase 01/07
-- (`SaasPlan`, `Tenant.status`, `TenantSubscription`, `SaasInvoice` com
-- status PAID/PENDING/FAILED) — só falta o contador de cobranças recusadas
-- seguidas, base da suspensão automática por inadimplência.
-- ─────────────────────────────────────────────────────────────────────────────

-- AlterTable
ALTER TABLE "TenantSubscription" ADD COLUMN     "failedAttempts" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SaasInvoice" ADD COLUMN     "externalId" TEXT;
