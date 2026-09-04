# Agente 14 — Seeds de auditoria (rodar ANTES das auditorias de aba)

Projeto: **BarberVP**. Objetivo: enriquecer o `seed.ts` para que TODAS as
abas do dashboard tenham dados visíveis — sem isso, a comparação visual com
o protótipo não funciona (blocos vazios parecem blocos faltando).

> Seeds são de **desenvolvimento**. Nada disso roda em produção — manter a
> separação (seed base vs seed demo) se já existir, ou criar
> `prisma/seed-demo.ts` acionado por `make seed-demo`.

## Leia primeiro
`CONTEXT.md`, `SPEC.md`, `prisma/schema.prisma` e o seed atual.

## Princípio
Dados **coerentes entre si** — os números que o dashboard agrega devem bater
entre as abas (comanda fechada gera comissão, que aparece no financeiro, que
soma no relatório). Auditar com dados incoerentes esconde bugs de agregação.

## O que o seed demo precisa cobrir (tenant `barbearia-vp`)

1. **Equipe**: os 5 barbeiros do protótipo (Carlos Silva, Bruno Costa, Diego
   Alves, Rafael Souza, Maria Fernanda) com escalas diferentes, 1 exceção de
   folga, 1 convite pendente (para testar o limite do plano).
2. **Clientes**: ~40, com distribuição que ativa os alertas do dashboard:
   12+ sem visita há 30+ dias, 3 com aniversário na semana corrente
   (calcular datas relativas a `new Date()`, nunca fixas), 2+ com 2 faltas
   (aviso ⚠ na agenda), alguns mensalistas.
3. **Agendamentos**: últimos 30 dias + próximos 7, em todos os status
   (SCHEDULED, CONFIRMED, DONE, NO_SHOW, CANCELED), espalhados entre
   barbeiros e serviços; hoje com ~8 (mistura de status) para a home e a
   agenda ficarem parecidas com o protótipo.
4. **Comandas**: ~60 fechadas no mês (com itens de serviço E produto,
   métodos de pagamento variados, algumas pagas por assinatura) + 3 abertas
   agora; garantir que geraram CommissionEntry e baixa de estoque.
5. **Financeiro**: caixa de ontem fechado, o de hoje NÃO aberto (ativa o
   alerta); 4 contas a pagar (2 vencendo esta semana — ativa o alerta), 3 a
   receber, 2 vales de barbeiros, 2 contas bancárias.
6. **Assinaturas de cliente**: 2 planos (ex.: 4 cortes/mês e ilimitado
   barba), 5 assinantes com usos parciais no ciclo, 1 pagamento mock
   recusado (testar fluxo de cobrança).
7. **Fidelidade**: consistente com o design atual (somente Assinaturas —
   sem pontos/sorteios).
8. **Produtos**: ~10, sendo 2 com estoque baixo (ativa o card da home) —
   estoque final coerente com as baixas das comandas.
9. **Notificações/Outbox**: ~10 notificações no sino, ~15 mensagens no
   NotificationOutbox (lembretes/confirmações "enviados") para a aba
   WhatsApp e o outbox do admin.
10. **Assistente IA**: consumo parcial da cota do plano.
11. **AuditLog**: alguns eventos (login, troca de plano) para telas que o
    exibam.
12. **Tenant secundário**: dados mínimos porém presentes em cada módulo —
    é ele que prova o isolamento visualmente (logar nele e conferir que nada
    do tenant principal aparece).

## Regras técnicas
- Datas sempre relativas ao dia da execução (dashboard "vivo" em qualquer dia)
- Idempotente: rodar 2x não duplica (upsert ou truncate demo antes)
- Respeitar as constraints reais (EXCLUDE: não seedar agendamentos
  sobrepostos do mesmo barbeiro; débito de assinatura consistente)
- Money em centavos; timezone do tenant

## Aceite
- [x] `make seed-demo` roda limpo e é idempotente
- [x] Home do dashboard exibe os 6 KPIs, gráficos, ranking e os 4 alertas
      com dados
- [x] Cada uma das 14 abas mostra conteúdo (nenhuma vazia)
- [x] Números cruzam: comandas ↔ comissões ↔ financeiro ↔ relatórios
- [x] Login no tenant secundário não vaza nada do principal

## Resultado (2026-08-21)

`prisma/seed-demo.ts` + `prisma/seed-demo-data.ts`, acionados por
`make seed-demo` (ou `pnpm --filter @barbervp/api run seed:demo`). O
`make seed` continua entregando só o que o SPEC manda — a separação base/demo
está feita. Detalhes e decisões em `agentes/CONTEXT.md` → "O que o agente 14
(seeds de auditoria) entregou".

Números plantados no tenant demo: 5 barbeiros · 40 clientes · 1.360
agendamentos (8 meses de histórico + 60 dias densos + 7 à frente, nos 5
status) · 1.228 comandas fechadas (352 no mês corrente, 538 no anterior) + 3
abertas · 10 produtos (2 no mínimo) · 5 assinantes (1 com cobrança recusada) ·
15 mensagens no outbox · 24 do Assistente IA · 12 no `AuditLog`.

Conferido contra a API no ar:

- **Home** — 6 KPIs com valor e sparkline de 8 pontos SEM buraco (faturamento,
  agendamentos, ocupação, ticket médio, novos clientes, faltas), gráfico de 30
  dias com média diária de R$ ~980 contra meta diária de R$ ~903, top 5
  serviços + "Outros", ranking dos 5 barbeiros com valores distintos, 10
  próximos atendimentos e os 4 alertas acesos (12 inativos · 3 contas na
  semana · caixa não aberto · 3 aniversariantes). Sino com 11 itens.
- **Cruzamento** — comissões do mês somam R$ 6.162,00 na aba Comissões e o
  mesmo valor em `SUM(CommissionEntry)`; 12 invariantes de coerência
  (pagamento = total, subtotal = itens, comissão = base × faixa, sem comissão
  em item coberto por assinatura, estoque ≥ 0, nenhum agendamento em dia de
  folga…) devolvem zero.
- **Faixa de comissão** — o mês anterior é um mês INTEIRO, e o Diego Alves o
  fecha com 40% + 45%: a regra `TIERED` do SPEC fica visível na tela.
- **Isolamento** — logado no tenant secundário, o overview traz só os números
  dele (1 agendamento hoje, 2 barbeiros no ranking) e ainda devolve
  `lockedByPlan: ['contasPagarReceber']`, porque ele assina o Essencial.
- **Idempotência** — duas execuções seguidas, contagem idêntica linha a linha
  em 12 tabelas (o PRNG do seed é determinístico).

Desvios conscientes do enunciado, com o porquê em `CONTEXT.md`: volume de
comandas bem acima das "~60 no mês" (com 60 a home nasce quebrada contra a
meta de R$ 28.000), janela densa de 60 dias em vez de 30 (para existir um mês
fechado inteiro e a faixa de comissão ser exercitada), e nada de pontos ou
sorteios novos na Fidelidade (o design atual só tem Assinaturas).
