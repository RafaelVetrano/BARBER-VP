-- Auditoria 1:1 da aba "Equipe" (agente 24).

-- 1. "Inativo pelo plano" (protótipo l.2027): o downgrade deixou de RECUSAR e
--    passou a desligar os excedentes. A coluna separa "o dono desativou" de
--    "o plano não comporta" — só o segundo caso volta sozinho no upgrade.
ALTER TABLE "Barber" ADD COLUMN "inactiveByPlan" BOOLEAN NOT NULL DEFAULT false;

-- Um barbeiro inativo PELO PLANO é, antes de tudo, um barbeiro inativo: a
-- agenda, o booking e a contagem do limite filtram por `active`, e nenhum
-- deles deve precisar conhecer o motivo.
ALTER TABLE "Barber" ADD CONSTRAINT "barber_inactive_by_plan_implies_inactive"
  CHECK (NOT "inactiveByPlan" OR NOT "active");

-- 2. O modal de "+ Novo barbeiro" monta a semana inteira (entrada, saída e
--    almoço por dia, l.2216–2233), não só os dias trabalhados. O convite
--    guarda essa semana para o `WorkSchedule` nascer igual ao que o dono
--    preencheu — `workDays` sozinho perdia os horários.
ALTER TABLE "StaffInvite" ADD COLUMN "schedule" JSONB;
