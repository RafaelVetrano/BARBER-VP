-- Sorteios: limpeza das tabelas órfãs (agente 29).
--
-- O agente 21 removeu a sub-aba "Sorteios" do protótipo revisado e, com ela,
-- as rotas, o serviço, os tipos, o frontend e o seed. O SCHEMA ficou, porque
-- derrubar tabela é migration destrutiva e não cabia decidir naquela sessão.
-- Cabe aqui: nada no código referencia estas tabelas, e as duas estão vazias.
--
-- Se sorteios voltarem como escopo de produto, voltam como fase própria, com
-- desenho novo — e não com o schema de um recurso que nunca chegou a existir
-- na tela.
DROP TABLE IF EXISTS "LoyaltyRaffleEntry";
DROP TABLE IF EXISTS "LoyaltyRaffle";
DROP TYPE IF EXISTS "RaffleStatus";
