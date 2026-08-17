-- ─────────────────────────────────────────────────────────────────────────────
-- Fase 03 — Auth & Tenancy
--
-- Acrescenta a infraestrutura de autenticação real: sessões de refresh
-- rotativas (`AuthSession`), códigos OTP do cliente (`OtpCode`), recuperação de
-- senha do estabelecimento (`PasswordResetToken`), o vínculo `Client.userId`
-- (mesma pessoa como cliente e como dono) e os campos de endereço/progresso que
-- o wizard de onboarding escreve em `TenantSettings`.
--
-- Como a migration inicial, esta é escrita à mão a partir de `prisma migrate
-- diff`: o diff bruto tenta um `ALTER COLUMN "timeRange" DROP DEFAULT` na
-- `Appointment` (o Prisma não enxerga a coluna GERADA e acha que ela mudou),
-- que o Postgres recusa. A linha foi removida; as CHECK constraints abaixo são
-- adição manual.
-- ─────────────────────────────────────────────────────────────────────────────


-- CreateEnum
CREATE TYPE "TokenAudience" AS ENUM ('ESTABLISHMENT', 'CLIENT');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('CLIENT_SIGNUP', 'CLIENT_PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "OtpChannel" AS ENUM ('WHATSAPP', 'SMS', 'EMAIL', 'CALL');


ALTER TABLE "Client" ADD COLUMN     "emailVerifiedAt" TIMESTAMPTZ(3),
ADD COLUMN     "lastLoginAt" TIMESTAMPTZ(3),
ADD COLUMN     "userId" TEXT;

ALTER TABLE "TenantSettings" ADD COLUMN     "addressCity" TEXT,
ADD COLUMN     "addressComplement" TEXT,
ADD COLUMN     "addressNeighborhood" TEXT,
ADD COLUMN     "addressNumber" TEXT,
ADD COLUMN     "addressState" TEXT,
ADD COLUMN     "addressStreet" TEXT,
ADD COLUMN     "addressZip" TEXT,
ADD COLUMN     "onboardingDoneAt" TIMESTAMPTZ(3),
ADD COLUMN     "onboardingStep" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "clientId" TEXT,
    "audience" "TokenAudience" NOT NULL,
    "tenantId" TEXT,
    "refreshHash" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "revokedReason" TEXT,
    "replacedById" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "lastUsedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpCode" (
    "id" TEXT NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "channel" "OtpChannel" NOT NULL,
    "destination" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "clientId" TEXT,
    "payload" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "resendCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "exchangeHash" TEXT,
    "exchangeExpiresAt" TIMESTAMPTZ(3),
    "lastSentAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "ip" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_replacedById_key" ON "AuthSession"("replacedById");

-- CreateIndex
CREATE INDEX "AuthSession_userId_revokedAt_idx" ON "AuthSession"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "AuthSession_clientId_revokedAt_idx" ON "AuthSession"("clientId", "revokedAt");

-- CreateIndex
CREATE INDEX "AuthSession_familyId_idx" ON "AuthSession"("familyId");

-- CreateIndex
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");

-- CreateIndex
CREATE INDEX "OtpCode_destination_purpose_createdAt_idx" ON "OtpCode"("destination", "purpose", "createdAt");

-- CreateIndex
CREATE INDEX "OtpCode_expiresAt_idx" ON "OtpCode"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_consumedAt_idx" ON "PasswordResetToken"("userId", "consumedAt");

-- CreateIndex
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Client_email_key" ON "Client"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Client_userId_key" ON "Client"("userId");

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_replacedById_fkey" FOREIGN KEY ("replacedById") REFERENCES "AuthSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtpCode" ADD CONSTRAINT "OtpCode_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- O outbox de notificação passa a aceitar mensagens da plataforma (OTP de
-- cadastro do cliente), fora de qualquer barbearia — simétrico ao `MailOutbox`.
ALTER TABLE "NotificationOutbox" DROP CONSTRAINT "NotificationOutbox_tenantId_fkey";
ALTER TABLE "NotificationOutbox" ALTER COLUMN "tenantId" DROP NOT NULL;
ALTER TABLE "NotificationOutbox" ADD CONSTRAINT "NotificationOutbox_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Constraints estruturais escritas à mão ──────────────────────────────────

-- Uma sessão pertence a um login de estabelecimento OU a um cliente, nunca aos
-- dois e nunca a nenhum — e o `audience` tem de casar com o dono.
ALTER TABLE "AuthSession" ADD CONSTRAINT "auth_session_subject" CHECK (
  ("userId" IS NOT NULL AND "clientId" IS NULL AND "audience" = 'ESTABLISHMENT')
  OR
  ("clientId" IS NOT NULL AND "userId" IS NULL AND "audience" = 'CLIENT')
);

-- Tentativas de OTP nunca ultrapassam o teto da própria linha.
ALTER TABLE "OtpCode" ADD CONSTRAINT "otp_attempts_within_max" CHECK (
  "attempts" >= 0 AND "attempts" <= "maxAttempts"
);

-- O wizard tem 6 passos; 0 = ainda não começou.
ALTER TABLE "TenantSettings" ADD CONSTRAINT "onboarding_step_bounds" CHECK (
  "onboardingStep" >= 0 AND "onboardingStep" <= 6
);
