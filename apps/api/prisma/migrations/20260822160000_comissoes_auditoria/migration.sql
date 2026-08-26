-- Auditoria 1:1 da aba Comissões (agente 19).
--
-- O protótipo (`Dashboard.dc.html` l.1089–1228) tem uma coluna "Comissão
-- produtos" e o modal de regras (l.4154) pede "% produtos" nos DOIS modos —
-- mas o modelo só sabia comissionar serviço. Estas três colunas fecham isso.

CREATE TYPE "CommissionEntryKind" AS ENUM ('SERVICE', 'PRODUCT');

ALTER TABLE "CommissionRule"
  ADD COLUMN "percentProdutosBps" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "deductVales" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "CommissionEntry"
  ADD COLUMN "kind" "CommissionEntryKind" NOT NULL DEFAULT 'SERVICE';

-- Todo lançamento existente nasceu de um item de SERVIÇO (produto não gerava
-- comissão até aqui), então o DEFAULT já classifica o histórico corretamente.

-- O extrato do período varre por competência E tipo (serviços somam na faixa,
-- produtos não).
CREATE INDEX "CommissionEntry_tenantId_barberId_referenceMonth_kind_idx"
  ON "CommissionEntry"("tenantId", "barberId", "referenceMonth", "kind");
