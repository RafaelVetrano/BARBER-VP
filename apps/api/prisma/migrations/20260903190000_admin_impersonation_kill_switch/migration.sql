-- Kill-switch da impersonação (agente 29).
--
-- Uma sessão de impersonação era indistinguível de um login normal do OWNER,
-- então não havia como o super admin encerrá-la à força: ou o próprio banner
-- fechava a sessão, ou se esperava o access token de 900s expirar. Esta coluna
-- marca quem abriu a sessão; o kill-switch revoga só as marcadas.
--
-- Sem FK de propósito: é ponteiro de auditoria, e o `AuditLog` já guarda o
-- registro completo de quem impersonou quem (com `tenantId` em SetNull).
ALTER TABLE "AuthSession" ADD COLUMN "impersonatedBy" TEXT;

-- Serve exatamente a pergunta do kill-switch: "há impersonação em curso NESTE
-- tenant?", feita uma vez por página da lista de tenants.
CREATE INDEX "AuthSession_tenantId_impersonatedBy_revokedAt_idx"
  ON "AuthSession"("tenantId", "impersonatedBy", "revokedAt");
