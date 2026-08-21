# Agente — Auditoria e correção 1:1 da tela Clientes

Projeto: BarberVP. Esta sessão corrige **apenas** a tela Clientes (`/app/clientes`).
Ler `agentes/auditoria/00-como-usar.md` antes: ele traz a regra
"componente ≠ dado" e a lista de desvios que a fase 13 encontrou no Dashboard
e que devem ser procurados aqui.

## Leia primeiro

1. `agentes/CONTEXT.md` e `agentes/SPEC.md`
2. `agentes/auditoria/00-como-usar.md`
3. **`BARBER VP/Dashboard.dc.html`, linhas 564–638** — esta é a fonte de
   verdade. Ler o HTML real, não trabalhar de memória. Ver também os modais no
   fim do arquivo (a partir da linha 2818), onde o protótipo guarda os
   diálogos compartilhados.
4. A implementação atual:
   - `apps/web/app/(dashboard)/app/clientes/page.tsx` (225 linhas)

## Inventário a conferir contra o `.dc.html`

- Tabela com nome, telefone, última visita, nº de visitas, total gasto e o
  status (bloqueado por faltas).
- **Ficha do cliente** em drawer: histórico de atendimentos, pontos de
  fidelidade, assinatura ativa, notas e barbeiro favorito.
- Ações de linha: editar, bloquear/desbloquear, abrir agendamento.

Para CADA bloco acima: existe na implementação? Na mesma ordem? Com o mesmo
grid, as mesmas cores e a mesma tipografia? As interações funcionam?

## Endpoints que já existem

- `GET /clients` (busca, filtro, paginação)
- `PATCH /clients/:id`
- `PATCH /clients/:id/block` · `/unblock`

Se um dado da tela não tem endpoint, **criar o endpoint** — com tipos em
`packages/types`, agregação em SQL (nunca N+1), `tenantId` em todo `where`,
recorte por papel (`StaffScopeService` quando `BARBER` entra) e gate de plano
server-side.

## Notas específicas desta tela

- O Dashboard navega para cá com `?q=` (busca global) e `?filtro=inativos`
  (alerta de clientes sem visita há 30+ dias). **Nenhum dos dois é lido hoje** —
  implementar, senão os dois caminhos do Dashboard chegam numa lista sem filtro.
- Filtro "inativos" precisa de suporte no `GET /clients` (hoje não existe).

## Estados obrigatórios

- **Loading**: skeletons com a MESMA altura dos blocos reais — sem layout shift.
- **Vazio**: mensagem própria por bloco, nunca zero falso nem dado do protótipo.
- **Erro**: card com retry, sem derrubar a página inteira (a casca continua
  utilizável).

## Responsividade (não negociável)

Testar 360 · 390 · 768 · 1024 · 1440.

- Sem rolagem horizontal da página (contêiner largo rola por dentro, com
  `overflow-x: auto`).
- Alvo de toque ≥ 44×44 abaixo de 768px — o padrão do projeto é
  `size-11 md:size-9` / `h-11 md:h-10`.
- Tabela vira card abaixo de `md` (`ResponsiveTable` já faz isso).
- Dropdown vira bottom-sheet abaixo de `md` (`Popover` já faz isso).

`node scripts/responsive-sweep.mjs --app=dashboard --delay=6000`
(se der 429: `docker exec barbervp-redis redis-cli FLUSHDB`).

## Critérios de aceite

- [ ] Comparação lado a lado com o `.dc.html` renderizado: mesma ordem de
      blocos, mesmos grids, mesmas cores, mesma tipografia
- [ ] Toda ação de menu/botão executa ou navega — nenhuma decorativa
- [ ] `grep` no diff não encontra nenhum valor do protótipo hardcodado
- [ ] Com tenant vazio a página renderiza completa, sem erro no console e sem
      bloco sumido
- [ ] Papel `BARBER` vê a versão restrita (ou 403 limpo, se a tela não é dele)
- [ ] Gate de plano server-side; o front só espelha, com upsell
- [ ] Teste e2e do endpoint novo + teste de isolamento de tenant
- [ ] Checklist responsivo nos 5 tamanhos
- [ ] `CONTEXT.md` atualizado: endpoints criados, desvios encontrados, dívidas

## Ao finalizar

Atualizar `CONTEXT.md` com: endpoints criados, a tabela de desvios encontrados
nesta tela, e as dívidas que ficaram abertas de propósito.
