# Agente — Auditoria e correção 1:1 da tela Agenda

Projeto: BarberVP. Esta sessão corrige **apenas** a tela Agenda (`/app/agenda`).
Ler `agentes/auditoria/00-como-usar.md` antes: ele traz a regra
"componente ≠ dado" e a lista de desvios que a fase 13 encontrou no Dashboard
e que devem ser procurados aqui.

## Leia primeiro

1. `agentes/CONTEXT.md` e `agentes/SPEC.md`
2. `agentes/auditoria/00-como-usar.md`
3. **`BARBER VP/Dashboard.dc.html`, linhas 393–563** — esta é a fonte de
   verdade. Ler o HTML real, não trabalhar de memória. Ver também os modais no
   fim do arquivo (a partir da linha 2818), onde o protótipo guarda os
   diálogos compartilhados.
4. A implementação atual:
   - `apps/web/app/(dashboard)/app/agenda/page.tsx` (379 linhas)
   - `apps/web/components/dashboard/agenda/appointment-form-modal.tsx`

## Inventário a conferir contra o `.dc.html`

- Navegação de data: `‹ Hoje ›` + input de data nativo escondido sob o rótulo.
- Toggle **Dia / Semana / Mês** — conferir se as três views existem mesmo (a
  API tem `DAY`/`WEEK`/`TIMELINE`; `Mês` pode não ter contrapartida).
- Filtro por barbeiro e a **grade em colunas** (uma coluna por barbeiro), que é
  o formato do protótipo — não uma lista.
- **Bloquear horário** (o protótipo tem esse modal — ver `isAgenda` + os modais
  no fim do arquivo). Não há endpoint: `ScheduleException` existe no schema mas
  não tem rota. Provavelmente precisa ser criada.
- **Detalhes do agendamento** em drawer/modal, com as ações.
- Estados de status por cor na própria célula.

Para CADA bloco acima: existe na implementação? Na mesma ordem? Com o mesmo
grid, as mesmas cores e a mesma tipografia? As interações funcionam?

## Endpoints que já existem

- `GET /staff-agenda?date=&view=&barberId=`
- `POST /staff-agenda`
- `PATCH /staff-agenda/:id/move`
- `PATCH /staff-agenda/:id/cancel`
- `PATCH /staff-agenda/:id/confirm` (fase 13)

Se um dado da tela não tem endpoint, **criar o endpoint** — com tipos em
`packages/types`, agregação em SQL (nunca N+1), `tenantId` em todo `where`,
recorte por papel (`StaffScopeService` quando `BARBER` entra) e gate de plano
server-side.

## Notas específicas desta tela

- `?novo=1` e `?date=` já são pontos de entrada (fase 13). Não quebrar.
- O modal de remarcação vive aqui; a dívida nº 2 da fase 13 pede extraí-lo
  para `components/dashboard/agenda/` para o Dashboard poder reusá-lo.

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
