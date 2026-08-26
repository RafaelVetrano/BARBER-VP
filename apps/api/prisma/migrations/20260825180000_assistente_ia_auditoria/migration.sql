-- Auditoria 1:1 da aba "Assistente IA" (agente 28).

-- O protótipo (`Dashboard.dc.html` l.2840–2934) responde com um CARTÃO ao lado
-- do balão de texto: o faturamento da semana com sparkline, a lista de clientes
-- sumidos, o recorte da agenda. Isso não é markdown dentro de `content` — é
-- estrutura, com botões que navegam para entidades reais. Guardar como JSON ao
-- lado do texto é o que permite o histórico REABRIR com os cartões desenhados,
-- em vez de virar texto morto depois do refresh.
ALTER TABLE "AiChatMessage" ADD COLUMN "card" JSONB;

-- "Limpar conversa" (o botão do canto do header, l.2833) não pode apagar a
-- linha: a cota mensal do plano é contada em cima destas mesmas linhas, e um
-- DELETE zeraria o contador — quem estourasse o limite limpava a conversa e
-- ganhava 50 mensagens novas. `hiddenAt` esconde do histórico e MANTÉM a linha
-- contando para a cota.
ALTER TABLE "AiChatMessage" ADD COLUMN "hiddenAt" TIMESTAMPTZ(3);

-- O histórico filtra por `hiddenAt IS NULL` em cima do índice já existente de
-- (tenantId, userId, createdAt); a contagem da cota varre por tenant e mês,
-- sem o userId — recorte que o índice antigo não cobria pelo prefixo.
CREATE INDEX "AiChatMessage_tenantId_role_createdAt_idx"
  ON "AiChatMessage"("tenantId", "role", "createdAt");
