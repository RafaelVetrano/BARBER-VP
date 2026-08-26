-- Auditoria 1:1 da aba Relatórios (agente 20).
--
-- O bloco "Taxa de faltas por mês" (`Dashboard.dc.html` l.1424–1447) desenha
-- uma linha tracejada com o rótulo "WhatsApp de lembrete ativado" — ou seja, o
-- gráfico afirma QUANDO a automação foi ligada. O modelo só sabia se ela está
-- ligada AGORA (`enabled`), e `updatedAt` muda a cada edição de template, então
-- não serve de data de ativação.

ALTER TABLE "WhatsappAutomationConfig"
  ADD COLUMN "enabledAt" TIMESTAMPTZ(3);

-- Automação já ligada antes desta migration: `createdAt` é a melhor data que o
-- banco tem. Marcar como NULL apagaria o marcador de quem já usa o lembrete.
UPDATE "WhatsappAutomationConfig" SET "enabledAt" = "createdAt" WHERE "enabled" = true;
