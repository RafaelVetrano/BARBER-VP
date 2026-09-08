-- Agente 32 — celular único por `User`.
--
-- A regra de produto (2026-09-04): dois donos não se cadastram com o mesmo
-- celular. `User.email` já era `@unique` desde a fase 03; o celular não era, e
-- o `/cadastro` aceitava o mesmo número quantas vezes quisessem.
--
-- O campo segue OPCIONAL de propósito. No Postgres vários `NULL` convivem num
-- índice único, então quem entra por convite da Equipe sem telefone não colide
-- com ninguém — a premissa está coberta por teste em `shared-rules.spec.ts` e
-- em `auth.e2e-spec.ts`, porque é ela que sustenta o campo continuar nulável.

-- 1. Desempate ANTES do índice.
--
--    O `seed.ts` cria todos os `User` sem `phone`, então em banco recém-semeado
--    esta etapa não toca em nada. Mas um banco de DESENVOLVIMENTO tem duplicata
--    de verdade: o banco desta máquina trazia quatro contas de teste do mesmo
--    dono com `5516996022093` — cadastros manuais feitos enquanto a tela era
--    testada, todas com e-mails diferentes.
--
--    A escolha aqui é preservar CONTA, não telefone: quem entra é o e-mail, e
--    `User.phone` é dado de contato que o dono repõe em "Meu perfil". Então a
--    linha mais RECENTE de cada grupo fica com o número e as anteriores vão
--    para `NULL` — nenhuma conta é apagada, nenhum login para de funcionar.
--    É a mesma decisão que o fluxo de vínculo cliente→dono toma quando o
--    telefone do `Client` já pertence a outro `User`.
UPDATE "User" SET "phone" = NULL
WHERE "id" IN (
  SELECT "id" FROM (
    SELECT "id",
           row_number() OVER (PARTITION BY "phone" ORDER BY "createdAt" DESC, "id" DESC) AS rn
    FROM "User"
    WHERE "phone" IS NOT NULL
  ) ranked
  WHERE rn > 1
);

-- 2. O índice.
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");
