-- Auditoria 1:1 da aba Financeiro (agente 18).
--
-- 1. `CashMovement` ganha forma de pagamento e categoria: a tabela
--    "Movimentações de hoje" do protótipo tem as duas colunas, e o resumo do
--    modal de fechamento soma por forma.
-- 2. Contas a pagar/receber ganham `seriesId` (parcelamento) e `recurrence`
--    (os toggles "Parcelado?"/"Recorrente?" dos modais).
-- 3. `Vale` ganha o DIA do adiantamento — até aqui só a competência mensal era
--    guardada, e a coluna "Data" da tabela não tinha de onde sair.

CREATE TYPE "AccountRecurrence" AS ENUM ('WEEKLY', 'MONTHLY', 'YEARLY');

ALTER TABLE "CashMovement"
  ADD COLUMN "method"   "PaymentMethod",
  ADD COLUMN "category" TEXT;

ALTER TABLE "AccountPayable"
  ADD COLUMN "seriesId"   TEXT,
  ADD COLUMN "recurrence" "AccountRecurrence";

ALTER TABLE "AccountReceivable"
  ADD COLUMN "seriesId"   TEXT,
  ADD COLUMN "recurrence" "AccountRecurrence";

CREATE INDEX "AccountPayable_tenantId_seriesId_idx"    ON "AccountPayable"("tenantId", "seriesId");
CREATE INDEX "AccountReceivable_tenantId_seriesId_idx" ON "AccountReceivable"("tenantId", "seriesId");

-- Linhas já existentes não têm o dia: a competência é a melhor aproximação
-- disponível, e é o que a tela mostrava até agora.
ALTER TABLE "Vale" ADD COLUMN "date" DATE;
UPDATE "Vale" SET "date" = "referenceMonth" WHERE "date" IS NULL;
ALTER TABLE "Vale" ALTER COLUMN "date" SET NOT NULL;
