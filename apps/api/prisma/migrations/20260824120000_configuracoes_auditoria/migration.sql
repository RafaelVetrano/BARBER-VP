-- Auditoria 1:1 da aba "Configurações" (agente 26).

-- A linha de horário de funcionamento do protótipo (l.2506–2530) tem um
-- toggle "Almoço" com duas horas por dia — o expediente da CASA fecha ao meio
-- do dia, e isso não existia: só o `WorkSchedule` de cada barbeiro tinha
-- almoço. Sem estas colunas o toggle do desenho seria um controle sem destino.
--
-- Nulos os dois = a casa não fecha para o almoço naquele dia, que é como todo
-- tenant nasce (o wizard de onboarding não pergunta almoço).
ALTER TABLE "TenantBusinessHour" ADD COLUMN "lunchStart" INTEGER;
ALTER TABLE "TenantBusinessHour" ADD COLUMN "lunchEnd" INTEGER;

-- Um intervalo pela metade não é um intervalo: ou os dois lados existem, ou
-- nenhum. O motor de disponibilidade subtrai a janela sem checar nada, e uma
-- ponta nula viraria um `NaN` silencioso na grade.
ALTER TABLE "TenantBusinessHour" ADD CONSTRAINT "tenant_business_hour_lunch_pair"
  CHECK (("lunchStart" IS NULL) = ("lunchEnd" IS NULL));

-- O intervalo tem de ser uma janela real e caber dentro do expediente do dia.
ALTER TABLE "TenantBusinessHour" ADD CONSTRAINT "tenant_business_hour_lunch_window"
  CHECK (
    "lunchStart" IS NULL
    OR ("lunchStart" < "lunchEnd" AND "lunchStart" >= "opensAt" AND "lunchEnd" <= "closesAt")
  );
