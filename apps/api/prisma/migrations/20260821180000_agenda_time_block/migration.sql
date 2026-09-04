-- Bloqueio de horário da aba Agenda ("Bloquear horário").
-- `BLOCK` subtrai uma faixa do expediente; `CUSTOM_HOURS` o redefine.
ALTER TYPE "ScheduleExceptionType" ADD VALUE IF NOT EXISTS 'BLOCK';

-- Observações do modal de bloqueio.
ALTER TABLE "ScheduleException" ADD COLUMN IF NOT EXISTS "notes" TEXT;
