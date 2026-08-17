-- ─────────────────────────────────────────────────────────────────────────────
-- Fase 06 — Dashboard I (operação)
--
-- Escrita à mão a partir de `prisma migrate diff` (mesmo motivo das anteriores:
-- o diff bruto tenta mexer na coluna GERADA `Appointment.timeRange`, que o
-- Prisma não enxerga e acha que mudou — essa linha foi removida daqui).
--
-- O que entra:
--   · `ClientProfile.favoriteBarberId` — "barbeiro favorito" da tela Clientes;
--   · `StaffInvite`                    — convite de funcionário
--     (`CadastroFuncionario.dc.html`): e-mail, serviços pré-marcados e dias de
--     trabalho pré-definidos, token opaco com hash HMAC (mesmo padrão do
--     `PasswordResetToken`), ciclo PENDING → ACCEPTED/EXPIRED/REVOKED.
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "StaffInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- AlterTable
ALTER TABLE "ClientProfile" ADD COLUMN     "favoriteBarberId" TEXT;

-- CreateTable
CREATE TABLE "StaffInvite" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "name" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'BARBER',
    "serviceIds" TEXT[],
    "workDays" INTEGER[],
    "tokenHash" TEXT NOT NULL,
    "status" "StaffInviteStatus" NOT NULL DEFAULT 'PENDING',
    "invitedByUserId" TEXT NOT NULL,
    "barberId" TEXT,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StaffInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StaffInvite_tokenHash_key" ON "StaffInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "StaffInvite_tenantId_status_idx" ON "StaffInvite"("tenantId", "status");

-- CreateIndex
CREATE INDEX "StaffInvite_email_idx" ON "StaffInvite"("email");

-- AddForeignKey
ALTER TABLE "ClientProfile" ADD CONSTRAINT "ClientProfile_favoriteBarberId_fkey" FOREIGN KEY ("favoriteBarberId") REFERENCES "Barber"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffInvite" ADD CONSTRAINT "StaffInvite_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffInvite" ADD CONSTRAINT "StaffInvite_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffInvite" ADD CONSTRAINT "StaffInvite_barberId_fkey" FOREIGN KEY ("barberId") REFERENCES "Barber"("id") ON DELETE SET NULL ON UPDATE CASCADE;
