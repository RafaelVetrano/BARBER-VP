-- Auditoria 1:1 da tela "Meu perfil" (agente 27).

-- "Alterar foto" (`Dashboard.dc.html` l.2754) era um toast "será habilitado em
-- breve" no protótipo, e não tinha destino nenhum no banco: `avatarUrl` só
-- existia em `Barber`, que é o profissional da agenda, não a PESSOA logada.
-- Um gerente sem ficha de barbeiro não tinha onde guardar a própria foto.
ALTER TABLE "User" ADD COLUMN "avatarUrl" TEXT;

-- "Excluir minha conta" (l.2811) promete no próprio modal (l.3527) que "você
-- terá 30 dias para reativar a conta antes da exclusão definitiva dos dados".
-- `Tenant.deletedAt` não serve para isso: ele já significa "apagado", e o
-- `TenantGuard`/login filtram por ele — marcar `deletedAt` no pedido trancaria
-- o dono para fora exatamente na janela em que ele deveria poder desistir.
-- `purgeAt` é a DATA DA FAXINA: até lá o dono entra normalmente e o botão de
-- desistir funciona; depois dela a `MaintenanceService` apaga de vez.
ALTER TABLE "Tenant" ADD COLUMN "purgeAt" TIMESTAMPTZ(3);

-- A varredura da faxina consulta por esta coluna a cada rodada. O índice o
-- Prisma também declara (`@@index([purgeAt])`), para schema e banco não
-- divergirem no `migrate diff`.
CREATE INDEX "Tenant_purgeAt_idx" ON "Tenant"("purgeAt");
