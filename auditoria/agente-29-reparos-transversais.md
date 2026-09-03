# Agente 29 — Fechamento do agente 15 e reparo das dívidas em aberto

Projeto: **BarberVP** — SaaS multi-tenant de gestão para barbearias
(`apps/api` NestJS + `apps/web` Next 14, monorepo pnpm/Turborepo).

Esta **não é uma auditoria de aba nova**. As 14 auditorias 1:1 (agentes 13–28)
estão fechadas. Esta fase varre o que elas deixaram para trás: o registro do
agente 15, que nunca foi fechado, e as dívidas espalhadas por `CONTEXT.md` que
são **defeito**, não escopo declarado fora do v1.

O critério que separa o que entra do que não entra é único e você deve aplicá-lo
em toda decisão de borda: **entra o que está quebrado, morto ou inalcançável;
não entra o que está honestamente ausente porque o v1 decidiu assim.** Um botão
que não faz nada entra. Um `MockPaymentDriver` que faz exatamente o que
prometeu, não.

---

## Leia primeiro

`CONTEXT.md` tem ~5.900 linhas. **Não leia inteiro.** Leia por faixa, na ordem:

```bash
sed -n '1,30p'      CONTEXT.md   # cabeçalho e último estado
sed -n '166,208p'   CONTEXT.md   # tabela de fases + A NOTA DO AGENTE 15
sed -n '3620,3700p' CONTEXT.md   # árvore de apps/web (fase 11) — paths atuais
sed -n '4663,4763p' CONTEXT.md   # dívidas dos agentes 28, 27, 24 + responsivas
sed -n '4862,4956p' CONTEXT.md   # dívidas da fase 11 — o deadlock do refresh
sed -n '5132,5230p' CONTEXT.md   # dívidas da fase 06 — Agenda
sed -n '5277,5360p' CONTEXT.md   # dívidas da fase 07
sed -n '5460,5530p' CONTEXT.md   # fechamento v1: o que é escopo, não dívida
```

Depois, `SPEC.md` → **RBAC**, **Design system** e **Fora do v1**.

Do protótipo, leia **só** o bloco da Agenda (Camada 0). O `Dashboard.dc.html`
tem 570 KB — ler inteiro estoura o contexto. Localize a faixa antes de abrir:

```bash
grep -n "isAgendaScreen\|agendaView\|AGENDA" Dashboard.dc.html | head -40
```

A faixa esperada é **l.401–563** (o Dashboard vai até l.400 e a aba Clientes
começa em l.564 — as duas confirmadas em `CONTEXT.md`). **Confirme com o grep
antes de ler**; se divergir, use o que o grep mostrar e registre a faixa real no
`CONTEXT.md` ao final, porque nenhum agente anterior a anotou. Leia também o
recorte do barbeiro em `DashboardFuncionario.dc.html` (a aba Agenda é a tela
inicial dele) e o modal de agendamento/remarcação que pende da aba.

---

## Regras invioláveis

1. **Fidelidade ao protótipo.** Nenhum valor do desenho vira constante no
   código. Se um número aparece na tela, ele sai do banco ou de um cálculo —
   nunca de um `useState('3459')`.
2. **Todo botão tem função real.** Um controle que não chama nada é pior que um
   controle ausente: promete um recurso que não existe. Esta fase inteira é,
   em boa parte, a aplicação da regra 2 ao que sobrou.
3. **Permissão e tenant são resolvidos no servidor.** A tela nunca recalcula
   papel a partir do usuário; ela renderiza o que a API autorizou. Nenhuma
   correção desta fase pode afrouxar `@Roles`, `@RequireFeature` ou o filtro
   por `tenantId`.
4. **Sem `disabled` para regra de negócio.** Use dois ramos de render.
5. **Reuso estrito.** Reaproveite handler, estado, hook e endpoint que já
   existem, com os nomes que já têm. Estado ou rota nova exige justificativa
   escrita no `CONTEXT.md`.
6. **Nenhuma suíte pode ficar vermelha.** Linha de base a bater ou superar:
   **95 unit · 333 e2e · 177 isolamento**. Toda correção que muda
   comportamento observável ganha caso de teste.

---

## Como trabalhar esta fase

Ela é grande de propósito — é a soma do que 14 agentes empurraram para frente.
Trabalhe **camada por camada, com commit ao fim de cada uma**:

```bash
git add -A && git commit -m "agente 29 — camada N: <resumo>"
```

Ao fim de cada camada, **atualize o bloco do agente 29 no `CONTEXT.md`**
marcando a camada como fechada, antes de começar a seguinte. Se a sessão
estourar o contexto no meio, a próxima abre com este mesmo arquivo e a
instrução "continue da primeira camada não marcada no `CONTEXT.md`" — e não
perde nada.

As camadas estão em ordem de dependência e de risco. **Não pule.** A Camada 1
conserta componentes compartilhados que a Camada 0 usa; a Camada 0 vem antes
porque é a única que ainda tem código não commitado no working tree, e código
não commitado é o que se perde primeiro.

---

## Escopo

### Entra

Camadas 0 a 5 abaixo.

### NÃO entra — e por quê

| Fora | Motivo |
|---|---|
| **Fase 12 e qualquer configuração de deploy** | Decisão explícita do dono do produto. Não toque em `docs/DEPLOY.md`, Railway, Vercel ou domínio. |
| **Provedores reais** (WhatsApp oficial, Asaas, Google OAuth, LLM do Assistente IA) | Escopo declarado fora do v1 no `SPEC.md`, com caminho de entrada documentado em `docs/INTEGRACOES.md`. Os mocks fazem o que prometem. |
| **Tabela `Notification` de verdade** | O sino DERIVA pendências do banco. Persistir leitura por usuário exige escrever em toda ação do produto — é fase própria, não reparo. |
| **Multi-unidade de fato** (filtro no `AvailabilityService`, escopar `Client`/`Product` por unidade) | Escopo próprio. Esta fase só amarra o `unitId` na ESCRITA (Camada 0/4), para que o filtro que já existe em Relatórios pare de devolver zero. |
| **Paginação de volume** (`/loyalty/subscribers`, histórico do WhatsApp, `/assistant/messages`) | Nenhuma delas está quebrada; todas devolvem dado correto. É otimização para volume que ainda não existe. |
| **Performance** (N+1 em `/commissions/period`, `AdminOutboxService` em memória, `lowStock` carregando a tabela) | Idem — correto e barato no volume de uma barbearia. |
| **Visão "Timeline" com desenho próprio** | Ver Camada 0, item 5: você vai DECIDIR entre implementar ou registrar como desvio consciente. Se decidir registrar, fica fora e o `CONTEXT.md` explica. |

---

## Camada 0 — Fechar o agente 15 (aba Agenda)

**Este é o item mais importante da fase.** Hoje existe código de Agenda no
repositório que ninguém auditou, ninguém commitou e nada documenta:
`components/dashboard/agenda/`, `test/agenda.e2e-spec.ts` e a migration
`agenda_time_block` apareceram no working tree quando o agente 16 começou. O
agente 16 não os tocou — só acrescentou `preselectedClientId` ao modal, que é o
contrato do botão "Agendar" da aba Clientes.

**Comece medindo o que está lá:**

```bash
git status
git diff --stat
```

Depois abra a tabela de desvios, como toda auditoria deste kit faz: bloco a
bloco do protótipo, com três colunas — *presente / parcial / ausente*,
*regra de negócio*, *papéis*. Preencha no início e feche zerada.

**Defeitos já conhecidos desta aba, todos registrados por outros agentes.**
Eles são o piso, não o teto — a auditoria contra o protótipo pode achar mais:

1. **`gap-4.5` não existe no Tailwind 3.4.** Em
   `apps/web/app/(dashboard)/app/agenda/page.tsx`, l.113 e l.263. A classe não
   gera regra nenhuma e o gap fica **zero**. (Achado do agente 22.)
2. **Cinco alvos de toque abaixo de 44px** na barra de navegação de data, a 360
   e 390px: `‹` e `›` (36×36), "Hoje" (49×20), o campo de data (187×42) e o
   seletor de barbeiro (169×17). É a **única** rota que a varredura do agente
   27 ainda reprova. Rode `make responsive` com `--delay=6000` e feche.
3. **`Service.color` não é lido pela agenda.** A coluna existe no schema desde
   o agente 23, o seed planta e a tabela do catálogo mostra — mas os blocos de
   `components/dashboard/agenda/` continuam colorindo por status. O protótipo
   colore por serviço. (Dívida do agente 23.)
4. **Não existe caminho para marcar `NO_SHOW` em lugar nenhum do produto.**
   Nem na Agenda, nem em Comandas. Consequência séria:
   `ClientProfile.noShowCount` é a base da regra de bloqueio de agendamento
   online, **ativa desde a fase 04**, e nunca recebe escrita fora do seed — a
   regra existe e não pode disparar. Crie
   `PATCH /staff-agenda/:id/no-show` (incrementa `noShowCount`, marca o
   `Appointment`, grava `AuditLog`) e o controle na tela. Caso de teste
   obrigatório: falta marcada → contador sobe → cliente no limite é bloqueado
   no booking público.
5. **`AgendaView.TIMELINE` renderiza igual a `DAY`.** O contrato existe, o
   backend responde a mesma forma e a resposta já tem tudo que a timeline
   precisaria; o protótipo desenha uma barra de tempo horizontal por barbeiro.
   **Decida** entre portar o desenho ou remover a opção do seletor — a regra 2
   proíbe deixar uma terceira visão que devolve a segunda. Registre a decisão.
6. **Mover agendamento só troca o horário do mesmo dia.** O `MoveModal` não
   deixa escolher outra data nem outro barbeiro, embora
   `PATCH /staff-agenda/:id/move` aceite os dois. Complete o formulário.
7. **Extraia o modal de remarcação para `components/dashboard/agenda/`.** O
   menu ⋯ dos "Próximos atendimentos" do Dashboard hoje navega para `/app/agenda`
   em vez de remarcar ali, e a correção certa — registrada pela fase 13 — é
   reusar este modal em vez de escrever uma segunda implementação da regra de
   disponibilidade. Feche a dívida 2 da fase 13 junto.
8. **O modal de novo agendamento assume fuso do navegador = fuso do tenant.**
   `GET /staff-agenda` já devolve `timezone`; repita no front a conversão
   `zonedTimeToUtc` que `apps/api/src/common/utils/timezone.ts` faz no backend.
9. **`Appointment.unitId` nasce nulo.** Amarre a unidade na criação do
   agendamento (o campo já existe em `Appointment` e em `Barber`). Sem isso o
   filtro por unidade de Relatórios, que o agente 20 entregou funcionando,
   devolve zero para sempre.

**Ao fechar a camada:** commit, e marque a linha 15 da tabela de fases como ✅
com o bloco "O que o agente 15 entregou" escrito no formato das outras
auditorias — faixa do protótipo, tabela de desvios, backend, frontend, decisões
conscientes, testes, dívidas que a aba deixa.

---

## Camada 1 — Defeitos que atingem o produto inteiro

1. **Deadlock no interceptor de refresh — é o defeito mais grave em aberto.**
   Um visitante **anônimo** que abre `/app` ou `/admin` fica preso no skeleton
   "Carregando sua sessão…" **para sempre**, em vez de ir para `/entrar`.

   Mecanismo, em `packages/ui/src/lib/api-client.ts:120-131`: o bootstrap do
   `EstablishmentAuthProvider` chama `establishmentApi.refresh(client)` pelo
   MESMO axios que tem o interceptor. Sem cookie válido dá 401; o interceptor
   marca `_retried`, define `refreshInFlight = options.refreshTokens()` e faz
   `await refreshInFlight`. Só que `refreshTokens` **é o mesmo `refresh`** —
   dispara outro `POST /auth/refresh`, toma outro 401, reentra no interceptor
   e, como `refreshInFlight` já está preenchido, dá `await` na promise que só
   resolve quando ele próprio terminar. Ninguém rejeita, o `catch` do provider
   nunca roda, `clearSession()` nunca é chamado, `status` fica em `'loading'`
   — o estado exato em que os guardas mostram skeleton e não redirecionam.

   Assinatura no navegador: exatamente **2** `401 /auth/refresh` por montagem
   (4 com StrictMode) e depois silêncio absoluto.

   Correção (decisão de uma linha, não refactor): `establishmentApi.refresh` e
   `clientApi.refresh` usam um axios **cru, sem interceptor** — ou o
   interceptor pula quando `config.url` já é a própria rota de refresh.
   **Teste obrigatório**: "anônimo em rota protegida vai para o login". Hoje
   nada reprova isso.

   Feito isso, reavalie a segunda dívida da fase 11: o `DashboardGuard` navega
   com `window.location.assign` em vez de `router.replace`, herança de quando o
   login morava em outra origem. Agora são a mesma origem.

2. **`packages/ui/src/components/tabs.tsx:117` usa `h-9` (36px).** Abaixo do
   mínimo de 44px que a própria `scripts/responsive-sweep.mjs` cobra. Reprova
   em `/app/servicos-produtos`, `/app/equipe`, `/app/comandas`, `/app/fidelidade`
   e `/admin/mensagens`, a 360 e 390. **Só é detectável com dado carregado** —
   com skeleton na tela as abas nem existem, e foi por isso que a varredura da
   fase 09 passou. `h-9` → `h-11` (ou `min-h-11`) e reconfira o espaçamento das
   cinco telas.

3. **`packages/ui/src/components/toggle.tsx` tem 44×22.** O agente 22 resolveu
   **localmente** embrulhando o interruptor num `<label>` de 44×44, e anotou
   que o conserto de verdade é no componente compartilhado. Faça no
   compartilhado e **remova o remendo local** da aba WhatsApp.

4. **Inputs abaixo do mínimo**: 24px em `/app/fidelidade` e `/app/whatsapp`
   (toggles) e 40px em `/app/comissoes`. O design system fixa 48px de altura de
   input — aplique o token, não um valor solto.

5. **`/admin/mensagens`**: "Anterior"/"Próxima" em 79×34.

6. **`nav.ts` restringe "Clientes" a OWNER/MANAGER**, mas o
   `DashboardFuncionario.dc.html` (l.1615) **tem** o item no nav do barbeiro.
   Ou o item volta com recorte próprio, ou o desvio vira consciente e escrito.
   Não deixe a divergência sem decisão. (Achado do agente 22 para o 16.)

7. **Não existe nenhum teste do middleware.** A guarda de host do super admin
   (`/admin/*` responde 404 seco fora do host do admin) foi verificada ao vivo
   com `curl -H "Host: ..."`, mas nada reprova no CI se alguém a quebrar. É a
   defesa que compensou a perda dos quatro deploys separados na fase 11.
   Escreva o teste.

**Ao fim da camada:** `make responsive` (com `--delay=6000` no dashboard) sem
reprovação em nenhuma rota, e commit.

---

## Camada 2 — Recursos que existem no backend e são inalcançáveis

Todos os itens abaixo são violação direta da regra 2, vista do outro lado: a
função existe, e a interface não a alcança.

1. **O programa de pontos não pode ser LIGADO por ninguém.**
   `GET|PATCH /loyalty/program` é o único interruptor de um recurso que o
   produto usa em três lugares — resgate na comanda, saldo no drawer do
   cliente, coluna "Pontos" da lista de clientes. A sub-aba que o editava saiu
   do protótipo revisado junto com Sorteios (agente 21), e **nenhuma tela
   assumiu**. O agente 21 apontou Configurações; o agente 26 não o portou.
   Crie a seção em `/app/configuracoes` (sub-aba Barbearia ou Preferências,
   você decide e justifica), com o gate `fidelidadePontos` (Profissional+) e
   `@Roles('OWNER','MANAGER')` que a rota já tem.

2. **Meta mensal sem campo na tela.** `TenantSettings.monthlyGoalCents` é
   gravável por `PATCH /settings/preferences` e o gráfico do Dashboard a
   desenha como linha tracejada, mas a fase 13 anotou que não há controle em
   Configurações. **Confirme se o agente 26 o incluiu**; se não, inclua.

3. **Não há como desfazer uma exclusão de conta agendada.** O agente 27 fez a
   exclusão AGENDAR (`Tenant.purgeAt`) com janela de 30 dias, e o dono pode
   desistir entrando pelo próprio login. Mas `/admin/tenants` filtra por
   `deletedAt`, que no agendamento é nulo: a barbearia continua na lista sem
   botão para limpar o `purgeAt`. **Se o dono perder o acesso ao login dentro
   dos 30 dias, ninguém desfaz e a `MaintenanceService` apaga.** Crie
   `POST /admin/tenants/:id/deletion/cancel` e o controle na linha.

4. **Impersonação não é revogável antes dos 900s.** Não existe encerrar à
   força do lado do super admin — só o próprio banner ou o token expirar.
   Crie o endpoint que invalida a `AuthSession` daquela impersonação
   especificamente, com `AuditLog`.

5. **`GET|PUT /barbers/:id/work-schedule` ficou sem consumidor.** O modal da
   aba Equipe grava a semana junto com o resto num `PATCH`, em transação
   única. As rotas seguem no contrato e cobertas pelo isolamento. **Decida:**
   ou alguma tela as consome, ou saem. Não deixe rota órfã no contrato.

---

## Camada 3 — Links que levam a lugar nenhum

1. **`/privacidade` e `/termos` não existem.** O cadastro do estabelecimento
   (fase 03), o registro do cliente (fase 05) e agora o bloco "Privacidade e
   dados" de Meu perfil (agente 27) apontam para lá: **três pontos de entrada
   para um 404.** Escreva as duas páginas no grupo `(marketing)`, no tema de
   produto. É conteúdo, não engenharia — texto sóbrio e coerente com o que o
   produto de fato faz (LGPD: exportação e exclusão já existem dos dois lados;
   dado de agendamento; retenção de `AuditLog`). Não invente cláusula sobre
   integração que o v1 não tem.

2. **Link público do onboarding (`{base}/agendar/{slug}`) → 404.** **Fica com o
   agente 30**, que refaz o passo 3 do wizard inteiro. Não toque; só confira
   ao final que o `CONTEXT.md` registra a correção de um dos dois lados.

3. **`notFound()` de `/{slug}` responde 200, não 404.** Slug inexistente
   renderiza a tela "Barbearia não encontrada" correta, com status 200 — *soft
   404* que robô de busca indexa. O 404 do Next funciona normalmente em rota
   sem match, então é específico do `notFound()` nesta rota dinâmica no
   14.2.16. Resolva ou, se o caminho for do próprio Next, registre com a
   evidência e o `noindex` explícito como mitigação.

4. **Título da landing duplica a marca**: sai "BarberVP — Sistema de gestão
   para barbearias · BarberVP", porque o `title` absoluto da rota ainda recebe
   o `template: '%s · BarberVP'` do layout. Use `title: { absolute: '...' }`.

5. **Slug de barbearia não é validado contra as rotas reservadas.** Desde a
   consolidação da fase 11, uma barbearia com slug `entrar`, `cadastro`,
   `agendar`, `recuperar-senha` ou qualquer rota de marketing **nunca abriria**
   — no Next a rota estática ganha da dinâmica. Antes eram domínios separados e
   o problema não existia. Valide no cadastro do tenant (`apps/api`), com a
   lista derivada das rotas reais, e cubra com teste.

---

## Camada 4 — Dado, schema e testes

1. **`make seed` deixa o onboarding PENDENTE.** `TenantSettings.onboardingDoneAt`
   fica `null` nos dois tenants, então logo após um seed limpo entrar no painel
   cai em `/app/configurar` — **contradizendo todos os roteiros de verificação
   deste `CONTEXT.md`**, que mandam abrir `/app/<aba>` direto. Marque o tenant
   demo como onboarding concluído no `make seed-demo`. Mantenha o `make seed`
   cru pendente se essa for a intenção da separação do agente 14, mas então
   **corrija os roteiros** para dizer qual seed usar.

2. **`LoyaltyRaffle` / `LoyaltyRaffleEntry` são tabelas órfãs.** Rotas, serviço,
   tipos, frontend e seed dos sorteios foram removidos pelo agente 21; o schema
   ficou, porque derrubar tabela é migration destrutiva e não cabia decidir
   ali. Cabe aqui: migration de limpeza, junto com `RaffleStatus` em
   `packages/types/src/enums.ts`.

3. **Resgate de pontos não é protegido contra concorrência.** Duas comandas
   abertas do mesmo cliente, ambas com `useLoyalty`, fechando ao mesmo tempo,
   podem resgatar o mesmo saldo duas vezes — o saldo é a soma do ledger, sem
   `SELECT ... FOR UPDATE` nem constraint de não-negativo. A quota de
   assinatura já tem débito atômico e CHECK; trate o ledger de pontos do mesmo
   jeito, pela mesma razão.

4. **Editar o teto de um PLANO não reprocessa os tenants.** `applyPlanLimit`
   roda na troca de plano DO TENANT (`/settings/plan/change` e
   `/admin/tenants/:id/plan`), não quando `maxBarbers` é editado em
   `/admin/planos`. Um plano que encolhe deixa os tenants acima do novo teto
   sem marcação até a próxima troca. Varra os tenants do plano no
   `AdminPlansService`.

5. **`revenueByBarber` usa `INNER JOIN Barber`**, então comanda sem barbeiro
   (walk-in no balcão) fica fora do detalhamento e **a soma por barbeiro não
   bate com o faturamento total do resumo** — dois números na mesma tela que
   discordam. No mínimo, faça a linha "Sem barbeiro" aparecer para que a soma
   feche. (O rateio por item continua fora: é decisão de produto, não defeito.)

6. **`booking.spec.ts` → "não repete em 2 mil sorteios" é flaky.** Colisão
   genuína de `generateBookingCode()` — paradoxo do aniversário com alfabeto
   pequeno. A fase 04 já mitiga a colisão real com retry na escrita, então o
   caso testa uma propriedade que o produto não depende. Descole o teste da
   margem exata (amostra maior ou `n` menor) ou reescreva-o para testar o
   retry, que é o que importa.

7. **`next build` exige `NODE_ENV=production` explícito neste ambiente.**
   Rodado de dentro dos containers de dev (que definem `development`), quebra
   35 páginas na prerenderização com `Cannot read properties of null (reading
   'useContext')` — a pista está na pilha, que mistura `app-page.runtime.prod.js`
   com `...dev.js`: runtime errado, não código errado. **Confirme se o
   `Makefile` e o CI forçam `NODE_ENV`**; se não, force. Não é dívida de código,
   é pegadinha de ambiente que já custou meia hora uma vez.

---

## Camada 5 — Infraestrutura pronta, faltando plugar

Nenhum destes exige escolher provedor. A infra foi construída e testada por
agentes anteriores; falta o consumidor.

1. **Foto do barbeiro ainda é campo de URL.** O `image-slot` do protótipo
   (l.2166) virou "URL da foto" com prévia no `Avatar`. **O `StorageAdapter` do
   agente 25 já resolve o lado do servidor.** Troque pelo `ImageSlot` de
   `components/dashboard/my-page/image-slot.tsx` mais
   `POST /team/barbers/:id/avatar`. O contrato não muda: `Barber.avatarUrl`
   continua sendo o destino.

2. **Onboarding passo 3 (logo e capa)** — **fica com o agente 30**, dono do
   wizard. Use o mesmo `ImageSlot` e a mesma `StorageAdapter` que ele; se o 30
   já rodou, siga o padrão que ele deixou registrado.

3. **Automações de calendário do WhatsApp não disparam nada.** `enabled` para
   `BIRTHDAY`, `REACTIVATION` e `REVIEW` guarda a intenção e o `enabledAt`, e
   **ninguém as executa** — o `BookingNotificationsService` só cobre
   confirmação, lembrete e cancelamento, que são reações a um agendamento. Os
   outros três são disparos por calendário. A fila da fase 09 já existe e já
   entrega o `NotificationOutbox`; falta o job diário que varre aniversariantes
   do dia, inativos na janela **configurada** (não 30 dias fixos — o agente 22
   tornou a janela configurável) e atendimentos concluídos há N minutos.

   **É o maior item da fase.** Se o contexto apertar, é o candidato natural a
   virar a última camada de uma segunda sessão — mas não o deixe cair: hoje o
   dono liga três interruptores e nada acontece, o que a regra 2 proíbe.

---

## Critérios de aceite

- `pnpm turbo run lint typecheck` 11/11 · `pnpm turbo run build` 3/3
  (com `NODE_ENV=production`).
- Suítes verdes e **acima** da linha de base: ≥ 95 unit · ≥ 333 e2e ·
  ≥ 177 isolamento. Toda rota nova desta fase tem caso de isolamento próprio —
  `POST /admin/tenants/:id/deletion/cancel`, o kill-switch de impersonação e
  `PATCH /staff-agenda/:id/no-show` mexem em recurso de tenant.
- `make responsive` sem reprovação em nenhuma rota, nos 5 tamanhos (use
  `--delay=6000` no dashboard; a varredura estoura o rate limit sem folga).
- **Conferido no navegador, não só por leitura de código:** visitante anônimo
  em `/app` cai em `/entrar`; falta marcada na Agenda bloqueia o cliente no
  booking; o programa de pontos liga e o resgate aparece na comanda; o link do
  fim do onboarding abre a página da barbearia; `/privacidade` responde 200.
- Tabela de fases com a linha **15 marcada ✅** e a linha **29** acrescentada.
- Nenhuma rota, tabela ou tipo órfão a mais do que quando a fase começou.

---

## Ao finalizar

Atualizar `CONTEXT.md`:

- **Cabeçalho** — novo bloco "Atualizado por último", no tom dos anteriores:
  o achado que mais dói primeiro, o mecanismo depois, os números da suíte no
  fim. O candidato natural a abrir é o deadlock do refresh — um produto em que
  o visitante anônimo trava para sempre na porta do painel.
- **Tabela de fases** — 15 ✅, 29 ✅.
- **Bloco "O que o agente 15 entregou"** — no formato das outras auditorias,
  com a faixa real do protótipo que você confirmou por grep, a tabela de
  desvios e as decisões conscientes (Timeline em especial).
- **Bloco "O que o agente 29 entregou"** — uma seção por camada, dizendo o que
  foi corrigido e **o que foi decidido não corrigir, com o motivo**. Esta fase
  vive de decisões de borda; sem elas escritas, o próximo agente refaz a
  análise.
- **Dívidas técnicas** — risque as resolvidas **onde elas aparecem** (não só
  num resumo no fim; é o padrão deste arquivo) e acrescente as novas.
- **Números finais** — recontar as três suítes rodando, não estimar.
- **Decisões tomadas** — datar as decisões estruturais (Timeline, nav do
  barbeiro em Clientes, destino do programa de pontos, `work-schedule`).

E deixe explícito, no fim do bloco do agente 29, **o que continua em aberto**:
a fase 12 e o que o `SPEC.md` declarou fora do v1. Quem abrir a próxima sessão
precisa ver, em uma tela, que o produto está inteiro e o que falta é publicar.
