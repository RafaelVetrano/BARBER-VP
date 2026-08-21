# Agente — Auditoria e correção 1:1 da tela Configurações

Projeto: BarberVP. Esta sessão corrige **apenas** a tela Configurações (`/app/configuracoes`).
Ler `agentes/auditoria/00-como-usar.md` antes: ele traz a regra
"componente ≠ dado" e a lista de desvios que a fase 13 encontrou no Dashboard
e que devem ser procurados aqui.

## Leia primeiro

1. `agentes/CONTEXT.md` e `agentes/SPEC.md`
2. `agentes/auditoria/00-como-usar.md`
3. **`BARBER VP/Dashboard.dc.html`, linhas 2466–2736** — esta é a fonte de
   verdade. Ler o HTML real, não trabalhar de memória. Ver também os modais no
   fim do arquivo (a partir da linha 2818), onde o protótipo guarda os
   diálogos compartilhados.
4. A implementação atual:
   - `apps/web/app/(dashboard)/app/configuracoes/page.tsx` (352 linhas)
   - `apps/web/components/dashboard/settings/unit-modal.tsx`

## Inventário a conferir contra o `.dc.html`

Blocos identificados no protótipo:
- **Dados da barbearia** · **Horário de funcionamento**
- **Unidades** — "Sincronização entre unidades", "Nova unidade" (gate
  `multiUnidades`, Avançado)
- **Plano e cobrança** — "Histórico de faturas", troca de plano com o modal de
  ganhos/perdas
- **Preferências** — bloqueio por faltas, antecedência mínima, cancelamento
- A tela **Meu perfil** (linhas 2737–2817) é irmã desta e o menu do avatar
  aponta para `?tab=perfil`: "Dados pessoais", "Segurança", "Privacidade e
  dados" (exportar/excluir — LGPD, fase 05).

Para CADA bloco acima: existe na implementação? Na mesma ordem? Com o mesmo
grid, as mesmas cores e a mesma tipografia? As interações funcionam?

## Endpoints que já existem

- `GET|PATCH /settings/barbershop`
- `GET|POST|PATCH /settings/units(/:id)`
- `GET /settings/plan` · `POST /settings/plan/change`
- `GET|PATCH /settings/preferences`

Se um dado da tela não tem endpoint, **criar o endpoint** — com tipos em
`packages/types`, agregação em SQL (nunca N+1), `tenantId` em todo `where`,
recorte por papel (`StaffScopeService` quando `BARBER` entra) e gate de plano
server-side.

## Notas específicas desta tela

- O menu do avatar (fase 13) navega para `?tab=perfil` e para a raiz.
  **Conferir se `?tab=` é lido** — se não, "Meu perfil" abre a aba errada.
- `GET /settings/plan` devolve **404** para tenant sem plano contratado
  (`TRIAL`). A tela precisa tratar isso: um tenant em teste tem de conseguir
  ESCOLHER um plano, e é para cá que o rodapé da sidebar manda.
- Falta o campo de **meta mensal** (`monthlyGoalCents`), criado na fase 13 e
  gravável por `PATCH /settings/preferences`, mas sem controle na UI.

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
