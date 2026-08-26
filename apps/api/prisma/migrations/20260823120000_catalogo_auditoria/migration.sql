-- Auditoria 1:1 da aba "Serviços & Produtos" (agente 23).

-- 1. Duas colunas que o protótipo desenha e o modelo não tinha:
--    a bolinha de cor da agenda e a comissão específica do serviço.
ALTER TABLE "Service" ADD COLUMN "color" TEXT;
ALTER TABLE "Service" ADD COLUMN "commissionBps" INTEGER;

-- Comissão em basis points: 0–100%. Uma "comissão específica" de 150% é
-- sempre erro de digitação, e o cálculo do fechamento não tem como recusar.
ALTER TABLE "Service" ADD CONSTRAINT "service_commission_bps_range"
  CHECK ("commissionBps" IS NULL OR ("commissionBps" >= 0 AND "commissionBps" <= 10000));

-- 2. Calculadora de preço inteligente (plano Avançado) — agora persistida.
CREATE TABLE "PriceCalculatorConfig" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "custoVariavelCents" INTEGER NOT NULL DEFAULT 0,
  "comissaoMediaBps" INTEGER NOT NULL DEFAULT 0,
  "atendimentosMes" INTEGER NOT NULL DEFAULT 300,
  "margemBps" INTEGER NOT NULL DEFAULT 2000,
  "precoPraticadoCents" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "PriceCalculatorConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PriceCalculatorConfig_tenantId_key" ON "PriceCalculatorConfig"("tenantId");

ALTER TABLE "PriceCalculatorConfig"
  ADD CONSTRAINT "PriceCalculatorConfig_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Os limites dos dois sliders do protótipo (l.1897 e l.1905), no banco: o
-- gate do plano é server-side, o intervalo do slider também precisa ser.
ALTER TABLE "PriceCalculatorConfig" ADD CONSTRAINT "price_calc_ranges" CHECK (
  "custoVariavelCents" >= 0
  AND "comissaoMediaBps" BETWEEN 0 AND 10000
  AND "atendimentosMes" BETWEEN 100 AND 1200
  AND "margemBps" BETWEEN 0 AND 6000
  AND "precoPraticadoCents" >= 0
);

CREATE TABLE "PriceCalcFixedCost" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL DEFAULT 0,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "PriceCalcFixedCost_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PriceCalcFixedCost_tenantId_sortOrder_idx" ON "PriceCalcFixedCost"("tenantId", "sortOrder");

ALTER TABLE "PriceCalcFixedCost"
  ADD CONSTRAINT "PriceCalcFixedCost_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PriceCalcFixedCost" ADD CONSTRAINT "price_calc_fixed_cost_amount_non_negative"
  CHECK ("amountCents" >= 0);
