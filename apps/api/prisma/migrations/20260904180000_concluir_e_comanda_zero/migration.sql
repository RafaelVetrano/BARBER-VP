-- Agente 31 — "Concluir" sem comanda, e comanda de R$ 0 que fecha ou cancela.
--
-- 1. `COURTESY` no `PaymentMethod`. A cortesia é uma forma de FECHAR, não de
--    receber: o valor é sempre R$ 0 e nada entra em conta bancária nem no
--    caixa. Ela existe como método (e não como um desconto de 100%) porque o
--    balcão precisa distinguir "cobrei zero de propósito" de "esqueci de
--    lançar os itens" — e o relatório precisa contar as duas coisas separado.
ALTER TYPE "PaymentMethod" ADD VALUE 'COURTESY';

-- 2. O que a cortesia perdoou, e por quê. `courtesyReason` é a prova de que o
--    R$ 0 foi uma decisão: sem ele o fechamento é recusado com 400.
--    `courtesyCents` guarda quanto a comanda TERIA cobrado — é o número do
--    recorte "Cortesias" do relatório, que de outro modo se perderia (o
--    `totalCents` da comanda fechada por cortesia é zero, por definição).
ALTER TABLE "Order" ADD COLUMN "courtesyCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN "courtesyReason" TEXT;

-- 3. Quando a comanda foi cancelada. `OrderStatus.CANCELED` já existia no enum
--    desde a fase 01 e nenhuma rota chegava nele; agora `POST /orders/:id/cancel`
--    chega, e a aba "Todas" precisa de uma data para ordenar e exibir.
ALTER TABLE "Order" ADD COLUMN "canceledAt" TIMESTAMPTZ(3);
