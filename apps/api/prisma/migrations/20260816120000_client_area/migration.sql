-- ─────────────────────────────────────────────────────────────────────────────
-- Fase 05 — Área do cliente
--
-- Escrita à mão pelo mesmo motivo das anteriores (o diff do Prisma segue
-- funcionando normalmente aqui — nada mexe em coluna gerada desta vez —, mas o
-- projeto mantém o padrão de revisar e comentar cada migration à mão).
--
-- O que entra:
--   · `Client.consentVersion`/`notifyWhatsapp`/`notifyEmail` — consentimento
--     LGPD versionado e preferências de notificação por canal, separados
--     (regra 6 do SPEC e a seção "Notificações" da `MinhaConta`, que o
--     protótipo já mantém distinta de "Segurança");
--   · `Review.appointmentId` — liga a nota por estrelas ao atendimento
--     específico que a originou, para o histórico saber o que já foi avaliado;
--   · `OtpPurpose.CLIENT_PHONE_CHANGE` — troca de telefone em "Meus dados"
--     reusa o desafio de 6 dígitos do registro, com um propósito próprio.
-- ─────────────────────────────────────────────────────────────────────────────


-- AlterEnum
ALTER TYPE "OtpPurpose" ADD VALUE 'CLIENT_PHONE_CHANGE';


-- ──────────────────────────────────────────────────────────────────── Client ─

ALTER TABLE "Client"
  ADD COLUMN "consentVersion" TEXT,
  ADD COLUMN "notifyWhatsapp" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notifyEmail"    BOOLEAN NOT NULL DEFAULT false;


-- ──────────────────────────────────────────────────────────────────── Review ─

ALTER TABLE "Review" ADD COLUMN "appointmentId" TEXT;

CREATE UNIQUE INDEX "Review_appointmentId_key" ON "Review"("appointmentId");

ALTER TABLE "Review" ADD CONSTRAINT "Review_appointmentId_fkey"
  FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
