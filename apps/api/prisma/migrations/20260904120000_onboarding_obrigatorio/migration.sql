-- Agente 30 — passo 2 do wizard: Cidade e UF viraram seletores com busca, e a
-- cidade escolhida passa a guardar o CÓDIGO IBGE do município além do nome.
--
-- Por que o código, e não só o nome: é ele que casa a resposta da ViaCEP (campo
-- `ibge`) com o item da lista do IBGE. Casar por nome erra em toda grafia
-- divergente ("Ribeirão Preto" com e sem acento é o mesmo município), e a
-- comparação por texto seria uma armadilha silenciosa — o endereço ficaria
-- "certo" na tela e o município, não identificado.
ALTER TABLE "TenantSettings" ADD COLUMN "addressCityIbge" TEXT;
