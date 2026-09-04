# Guia — Auditoria 1:1 do Dashboard (agentes 14–28)

## Ordem de execução
14 Seeds de auditoria (OBRIGATÓRIO primeiro — sem dados, bloco vazio e
bloco faltando são indistinguíveis)
→ 15 Agenda → 16 Clientes → 17 Comandas → 18 Financeiro → 19 Comissões
→ 20 Relatórios → 21 Fidelidade → 22 WhatsApp → 23 Serviços & Produtos
→ 24 Equipe → 25 Minha Página → 26 Configurações → 27 Meu Perfil
→ 28 Assistente IA

## Como rodar
1. Extrair esta pasta em `agentes/auditoria/` no repositório e commitar
2. `claude` na raiz → `/model` → colar:
   `Leia e execute agentes/auditoria/agente-15-agenda.md`
3. Conferir os critérios de aceite no navegador, commit, `/clear`, próximo
4. **Um agente por sessão. Nunca dois.**
5. `git commit` ANTES de cada agente — desfazer sessão ruim = `git checkout .`

## Modelos
- Opus 5: 14 (seeds), 17 (Comandas), 18 (Financeiro), 26 (Configurações)
- Sonnet 5: os demais

## Dependências entre auditorias
- 17↔19↔18↔20 cruzam números (comanda→comissão→financeiro→relatório):
  rodar nessa ordem
- 21 depende do 17 (débito de assinatura via comanda)
- 24 e 26 compartilham as regras de limite de plano

## Depois da auditoria
Agente 11 (consolidação 1 frontend) → agente 12 (deploy Railway+Vercel).
Nunca consolidar/deployar antes de as telas estarem completas.
