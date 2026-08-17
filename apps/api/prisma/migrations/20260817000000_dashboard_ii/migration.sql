-- ─────────────────────────────────────────────────────────────────────────────
-- Fase 07 — Dashboard II (financeiro)
--
-- Escrita à mão a partir de `prisma migrate diff` (mesmo motivo das
-- anteriores: o diff bruto tenta mexer na coluna GERADA `Appointment.timeRange`,
-- que o Prisma não enxerga e acha que mudou — essa linha foi removida daqui).
--
-- Quase todo o modelo de dados desta fase (Order/OrderItem/Payment,
-- CommissionRule/Tier/Entry, Vale, CashRegister/Movement, BankAccount,
-- AccountPayable/Receivable, LoyaltyProgram/Points/Raffle, Unit,
-- WhatsappAutomationConfig) JÁ EXISTIA desde a migration inicial da fase 01 —
-- esta migration só acrescenta o que faltava:
--   · `SaasInvoice`       — histórico de faturas do plano SaaS (Configurações
--     → Plano), no mesmo padrão de aprovação mock na hora da fase 05;
--   · `TenantPhoto`       — galeria de "Minha Página" (URL simples, mesma
--     convenção de `TenantSettings.logoUrl`/`coverUrl` — sem upload real);
--   · `AiChatMessage`     — histórico do Assistente IA ("Navalha"), também a
--     base da contagem de mensagens/mês por plano;
--   · `TenantSettings.showPhotos`/`showBusinessHours` — os 2 toggles reais de
--     "Minha Página" que não existiam ainda (`showServices`/`showReviews` já
--     serviam desde a fase 04; `showTeam`/`showAbout` continuam existindo só
--     para a vitrine pública, sem editor nesta tela).
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "AiMessageRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "SaasInvoiceStatus" AS ENUM ('PAID', 'PENDING', 'FAILED');

-- AlterTable
ALTER TABLE "TenantSettings" ADD COLUMN     "showBusinessHours" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showPhotos" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "bloquearFaltasAtivo" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "BankAccount" ADD COLUMN     "acceptedMethods" "PaymentMethod"[],
ADD COLUMN     "type" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "guestName" TEXT;

-- CreateTable
CREATE TABLE "SaasInvoice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "SaasInvoiceStatus" NOT NULL DEFAULT 'PAID',
    "issuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaasInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantPhoto" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiChatMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "AiMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SaasInvoice_tenantId_issuedAt_idx" ON "SaasInvoice"("tenantId", "issuedAt");

-- CreateIndex
CREATE INDEX "TenantPhoto_tenantId_sortOrder_idx" ON "TenantPhoto"("tenantId", "sortOrder");

-- CreateIndex
CREATE INDEX "AiChatMessage_tenantId_userId_createdAt_idx" ON "AiChatMessage"("tenantId", "userId", "createdAt");

-- AddForeignKey
ALTER TABLE "SaasInvoice" ADD CONSTRAINT "SaasInvoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaasInvoice" ADD CONSTRAINT "SaasInvoice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "TenantSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantPhoto" ADD CONSTRAINT "TenantPhoto_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiChatMessage" ADD CONSTRAINT "AiChatMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiChatMessage" ADD CONSTRAINT "AiChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
