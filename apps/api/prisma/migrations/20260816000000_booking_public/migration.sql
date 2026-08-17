-- ─────────────────────────────────────────────────────────────────────────────
-- Fase 04 — Booking público
--
-- Escrita à mão a partir de `prisma migrate diff`, pelo mesmo motivo das duas
-- anteriores: o diff bruto tenta mexer na coluna GERADA `Appointment.timeRange`
-- (o Prisma não a enxerga e acha que mudou), e o Postgres recusa. As CHECK
-- constraints e o backfill no fim também são adição manual.
--
-- O que entra:
--   · `ServiceComboPart`   — o combo "Corte + Barba" deixa de ser regra de tela
--                            (`COMBO_ID`/`PAIR_IDS` do protótipo) e vira catálogo;
--   · `AppointmentService` — a seleção múltipla do wizard, mantendo UM intervalo
--                            por atendimento (é o que a EXCLUDE precisa guardar);
--   · `Appointment.bookingCode` — o "AG-4821" que o cliente sem conta usa para
--                            cancelar e remarcar;
--   · `Review`             — as avaliações da página pública (regra 2: array do
--                            `.dc.html` vira seed, e seed precisa de tabela);
--   · granularidade de slot e lembretes em `TenantSettings`;
--   · `NotificationOutbox.scheduledFor` — o lembrete nasce agendado e PENDING;
--     a fila BullMQ da fase 09 é quem drena.
-- ─────────────────────────────────────────────────────────────────────────────


-- AlterEnum
-- Agendamento de visitante que caiu numa regra de risco precisa confirmar por
-- código; o agendamento fica em `OtpCode.payload` até lá.
ALTER TYPE "OtpPurpose" ADD VALUE 'GUEST_BOOKING';


-- ─────────────────────────────────────────────────────── TenantSettings ─────

ALTER TABLE "TenantSettings"
  ADD COLUMN "slotIntervalMin" INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN "lembrete1Horas"  INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN "lembrete2Horas"  INTEGER NOT NULL DEFAULT 2;

-- Slot de 0 min geraria horários infinitos; acima de 4h não é grade, é lista.
ALTER TABLE "TenantSettings" ADD CONSTRAINT tenant_settings_slot_interval_bounds
CHECK ("slotIntervalMin" BETWEEN 5 AND 240);

-- Lembrete negativo dispararia DEPOIS do atendimento. 0 = desligado.
ALTER TABLE "TenantSettings" ADD CONSTRAINT tenant_settings_reminder_bounds
CHECK ("lembrete1Horas" >= 0 AND "lembrete2Horas" >= 0);


-- ───────────────────────────────────────────────────── NotificationOutbox ───

ALTER TABLE "NotificationOutbox" ADD COLUMN "scheduledFor" TIMESTAMPTZ(3);

CREATE INDEX "NotificationOutbox_status_scheduledFor_idx"
  ON "NotificationOutbox"("status", "scheduledFor");


-- ────────────────────────────────────────────────────── ServiceComboPart ────

CREATE TABLE "ServiceComboPart" (
    "tenantId" TEXT NOT NULL,
    "comboServiceId" TEXT NOT NULL,
    "partServiceId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceComboPart_pkey" PRIMARY KEY ("comboServiceId","partServiceId")
);

CREATE INDEX "ServiceComboPart_tenantId_idx" ON "ServiceComboPart"("tenantId");
CREATE INDEX "ServiceComboPart_partServiceId_idx" ON "ServiceComboPart"("partServiceId");

ALTER TABLE "ServiceComboPart" ADD CONSTRAINT "ServiceComboPart_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceComboPart" ADD CONSTRAINT "ServiceComboPart_comboServiceId_fkey"
  FOREIGN KEY ("comboServiceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceComboPart" ADD CONSTRAINT "ServiceComboPart_partServiceId_fkey"
  FOREIGN KEY ("partServiceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Um combo feito de si mesmo entraria em laço na resolução da seleção.
ALTER TABLE "ServiceComboPart" ADD CONSTRAINT service_combo_part_not_self
CHECK ("comboServiceId" <> "partServiceId");

ALTER TABLE "ServiceComboPart" ADD CONSTRAINT service_combo_part_quantity_positive
CHECK ("quantity" > 0);


-- ──────────────────────────────────────────────────────────── Appointment ───

-- Nasce anulável para o backfill preencher as linhas do seed; vira NOT NULL
-- logo abaixo.
ALTER TABLE "Appointment" ADD COLUMN "bookingCode" TEXT;


CREATE TABLE "AppointmentService" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "priceCents" INTEGER NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "subscriptionUsageId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppointmentService_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AppointmentService_appointmentId_serviceId_key"
  ON "AppointmentService"("appointmentId", "serviceId");
CREATE INDEX "AppointmentService_tenantId_serviceId_idx"
  ON "AppointmentService"("tenantId", "serviceId");

ALTER TABLE "AppointmentService" ADD CONSTRAINT "AppointmentService_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppointmentService" ADD CONSTRAINT "AppointmentService_appointmentId_fkey"
  FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppointmentService" ADD CONSTRAINT "AppointmentService_serviceId_fkey"
  FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AppointmentService" ADD CONSTRAINT "AppointmentService_subscriptionUsageId_fkey"
  FOREIGN KEY ("subscriptionUsageId") REFERENCES "SubscriptionUsage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AppointmentService" ADD CONSTRAINT appointment_service_price_non_negative
CHECK ("priceCents" >= 0);

ALTER TABLE "AppointmentService" ADD CONSTRAINT appointment_service_duration_positive
CHECK ("durationMin" > 0);


-- ──────────────────────────────────────────────────────────────── Review ────

CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT,
    "barberId" TEXT,
    "authorName" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Review_tenantId_published_createdAt_idx"
  ON "Review"("tenantId", "published", "createdAt");
CREATE INDEX "Review_barberId_published_idx" ON "Review"("barberId", "published");

ALTER TABLE "Review" ADD CONSTRAINT "Review_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_barberId_fkey"
  FOREIGN KEY ("barberId") REFERENCES "Barber"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Review" ADD CONSTRAINT review_rating_bounds
CHECK ("rating" BETWEEN 1 AND 5);


-- ─────────────────────────────────────────────────────────────── Backfill ───

-- Toda linha existente ganha a sua `AppointmentService` — a lista de serviços
-- passa a ser a fonte de verdade da duração e do preço, e não pode nascer vazia
-- para os agendamentos que já estavam no banco.
INSERT INTO "AppointmentService"
  ("id", "tenantId", "appointmentId", "serviceId", "sortOrder", "priceCents", "durationMin", "subscriptionUsageId", "createdAt")
SELECT
  'as_' || a."id",
  a."tenantId",
  a."id",
  a."serviceId",
  0,
  a."priceCents",
  GREATEST(1, CEIL(EXTRACT(EPOCH FROM (a."endsAt" - a."startsAt")) / 60)::int),
  a."subscriptionUsageId",
  a."createdAt"
FROM "Appointment" a;

-- Código de reserva das linhas antigas: sufixo do id, em maiúsculas. Curto o
-- bastante para caber na tela e derivado do id, então é único por construção.
UPDATE "Appointment"
SET "bookingCode" = 'AG-' || UPPER(RIGHT("id", 6))
WHERE "bookingCode" IS NULL;

ALTER TABLE "Appointment" ALTER COLUMN "bookingCode" SET NOT NULL;

CREATE UNIQUE INDEX "Appointment_tenantId_bookingCode_key"
  ON "Appointment"("tenantId", "bookingCode");

CREATE INDEX "Appointment_tenantId_guestPhone_startsAt_idx"
  ON "Appointment"("tenantId", "guestPhone", "startsAt");
