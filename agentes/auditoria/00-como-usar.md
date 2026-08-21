# Auditoria 1:1 das telas do painel — como usar

A fase 13 auditou a tela **Dashboard** (`/app`) contra `Dashboard.dc.html` e
encontrou o que está listado em `CONTEXT.md` → "Os desvios encontrados". Não há
razão para supor que as outras telas estejam melhores: foram construídas nas
mesmas fases, com o mesmo método.

**Uma tela por sessão.** Cada arquivo desta pasta é o enunciado de uma sessão.

## Regra que vale para todas

> **Componente ≠ dado.** O que deve ficar 1:1 é a ESTRUTURA — quais blocos
> existem, em que ordem, com quais grids, cores, tipografia e interações. Os
> VALORES do protótipo (`R$ 1.240,00`, `Diego Martins`, `24.680`) são fixture
> de tela: se aparecerem no frontend, é bug. Dado vem da API; sem endpoint,
> cria-se o endpoint; sem dado no tenant, renderiza-se o estado vazio.

## O que procurar em toda tela (o que a fase 13 achou no Dashboard)

1. **Blocos ausentes.** Contar os blocos do `.dc.html` e os da implementação.
   No Dashboard eram 4 contra 1½.
2. **Endpoint inexistente.** A tela soma no cliente o que outro endpoint
   devolveu? Então o endpoint dela não existe. Criar.
3. **Ações de menu que não fazem nada.** Todo item de `⋯`, todo botão de
   card: ou executa, ou navega para onde executa. Nunca decorativo.
4. **Modais e drawers do protótipo que não foram portados.**
5. **Cadeado/upsell não refletindo o plano.** O gate é server-side; o front
   espelha. Um botão que sai em 403 é um defeito de produto.
6. **Estados faltando** — loading sem layout shift, vazio com mensagem própria
   por bloco, erro com retry que não derruba a página.
7. **Alvos de toque abaixo de 44px** abaixo de 768px.
8. **A tela é alcançável?** O achado nº 9 da fase 13: o seed não marcava
   `onboardingDoneAt`, então `/app` caía no wizard e a varredura responsiva
   media a tela errada dando verde. **Confirme que está vendo a tela certa
   antes de auditar.**

## Método sugerido

1. Ler `CONTEXT.md` e `SPEC.md`.
2. Ler o trecho indicado do `.dc.html` — **o HTML real, não de memória**.
3. Ler a implementação atual da rota.
4. Montar a tabela de desvios ANTES de escrever código.
5. Backend primeiro (endpoint + tipos + teste e2e + teste de isolamento),
   frontend depois.
6. Conferir: 5 tamanhos (360 · 390 · 768 · 1024 · 1440), tenant vazio, papel
   `BARBER`, `grep` dos valores do protótipo no diff.
7. Atualizar `CONTEXT.md`: endpoints criados, desvios encontrados, dívidas.

## Ferramentas que a fase 13 deixou prontas

- `packages/ui`: `Popover` (dropdown ≥768px / bottom-sheet abaixo, com fundo
  clicável), `Donut`, `AreaChart`, `Segmented`. `StatCard` com `delta.tone` e
  `sparklineTone`. `AppShell` com `topbarCenter`.
- `GET /dashboard/shell` — plano, `features`, teste e unidades, para qualquer
  tela que precise pintar cadeado ou upsell. Hook: `useDashboardShellQuery()`.
- `node scripts/responsive-sweep.mjs --app=dashboard --delay=6000` — varredura
  nos 5 tamanhos. Se der 429, `docker exec barbervp-redis redis-cli FLUSHDB`.

## Ordem sugerida

Por quanto a tela é usada no dia a dia da barbearia:

1. `01-agenda.md`
2. `02-comandas.md`
3. `03-clientes.md`
4. `04-financeiro.md`
5. `05-servicos-produtos.md`
6. `06-equipe.md`
7. `07-comissoes.md`
8. `08-fidelidade.md`
9. `09-relatorios.md`
10. `10-whatsapp.md`
11. `11-minha-pagina.md`
12. `12-configuracoes.md`
13. `13-assistente-ia.md`
