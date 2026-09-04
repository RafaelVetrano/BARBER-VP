# BarberVP — CONTEXT (memória entre sessões)

Atualizado por último: 2026-09-04 — **agente 30 (configuração inicial
obrigatória)** concluído.

A fase começa por uma **regra de produto**, não por um defeito: **concluir a
configuração inicial é obrigatório para acessar o painel.** Não existe
"explorar antes", não existe "continuar depois" — o dono entra no wizard depois
do cadastro e só sai dele pela última etapa. Tudo o mais decorre disso.

O achado que mais dói é o que a regra expôs: **a obrigatoriedade era só do
navegador.** `POST /onboarding/complete` marcava `onboardingDoneAt` sem
conferir nada, então uma chamada avulsa à rota destravava o painel inteiro de
uma barbearia sem endereço e sem um serviço sequer — e uma barbearia nesse
estado não monta grade de agendamento nenhuma. Agora a rota recusa com 409
`ONBOARDING_INCOMPLETE`, listando os passos que faltam, e confere o **dado
gravado**, não o contador `onboardingStep` (que "Pular etapa" faz subir sem
salvar — confiar nele deixaria passar exatamente o caso que a verificação
existe para pegar).

Dois botões contradiziam a regra e saíram: o **"Pular e explorar o painel"** das
boas-vindas, que navegava para `/app` e era devolvido para o wizard pelo guard —
girava em falso —, e o **"×" (continuar depois)** do cabeçalho dos 6 passos.
Nenhum atalho os substituiu. O outro lado da regra também estava aberto: o
wizard **reabria depois de concluído**, e quem digitasse `/app/configurar` com
tudo pronto voltava à tela de conclusão em vez do painel.

E um aviso que mentia há duas fases: o passo 3 pedia **"URL do logo"** e **"URL
da foto de capa"** dizendo que "o upload direto chega na fase de integrações" —
mas o `StorageAdapter` existe desde o agente 25, `POST /my-page/images/:slot`
recebe multipart e grava na MESMA `TenantSettings` que o passo escreve. Faltava
só o consumidor. Agora são dois `ImageSlot` reusados da Minha Página, com
prévia de como a barbearia vai aparecer na página pública. Junto, a dívida da
fase 11: o link do fim do wizard era `{base}/agendar/{slug}` e a página é
`{base}/{slug}` — o produto entregava ao dono um **404 para mandar aos
clientes**.

No passo 2, Cidade e UF deixaram de ser texto livre e viraram seletores com
busca (`Combobox` novo em `packages/ui`): 27 UFs de lista estática, municípios
do IBGE com cache no Redis por 30 dias — o mesmo arranjo da ViaCEP, pelas
mesmas razões. O CEP passa a **selecionar** os dois casando pelo código IBGE,
não pelo nome.

A lição de método da fase é a do #9 da fase 13, repetida: **verde de varredura
não prova que a tela certa foi medida.** `/app/configurar` nunca tinha entrado
na varredura responsiva — o dono do seed já concluiu o onboarding, então abrir
a rota com ele media o dashboard. Ao medir os 6 passos de verdade
(`?passo=N`, com uma fixture de barbearia pendente), apareceram **7 pendências
que nunca ninguém tinha visto**: `flex-1` no eixo vertical espremendo campos de
48px para 19px em três passos, cinco seletores de 40px onde a régua pede 44, e
um botão de 365px empurrando a página inteira a 360.

Suíte: **97 unit · 364 e2e · 183 isolamento**, mais **25 unit de frontend**
(+15 e2e, +3 isolamento, +11 de frontend). `make responsive --delay=6000` sem
pendência nas 35 rotas **e nos 6 passos do wizard**, nos 5 tamanhos.

Antes disso, o **agente 29 (reparos transversais)**, e com ele a **linha 15
(aba Agenda) finalmente fechada**. Esta fase não auditou aba nova: varreu o que
quatorze agentes empurraram para frente. O achado que mais doeu lá foi o que
estava na PORTA do produto. **Um visitante
anônimo que abrisse `/app` ou `/admin` ficava preso para sempre no skeleton
"Carregando sua sessão…"** — não ia para o login, não dava erro, não fazia
nada. O mecanismo é um deadlock de uma linha em `packages/ui/src/lib/api-client.ts`:
o bootstrap do provider chamava `POST /auth/refresh` pelo MESMO axios que tem o
interceptor; sem cookie válido dava 401; o interceptor preenchia
`refreshInFlight` com `options.refreshTokens()` — que É a própria função de
refresh —, ela disparava outro `/auth/refresh`, tomava outro 401, reentrava no
interceptor e ali dava `await` na promise que só resolveria quando ela mesma
terminasse. Ninguém rejeitava, `clearSession()` nunca era chamado, `status`
ficava em `'loading'` — o estado exato em que os guardas mostram skeleton e não
redirecionam. A correção é a guarda de que **o 401 da própria rota de refresh é
definitivo**. O teste que a cobre foi conferido REPROVANDO antes do conserto:
sem a guarda, três casos morrem no timeout.

Depois dele, a fase é a aplicação sistemática da regra 2 ("todo botão tem
função real") ao que sobrou — dos dois lados. Do lado do botão morto: o
programa de pontos era usado em três telas e **ninguém no produto podia
ligá-lo** (`GET|PATCH /loyalty/program` ficou órfão de tela quando o agente 21
removeu a sub-aba), a meta mensal era desenhada pelo gráfico do Dashboard sem
campo em lugar nenhum, e os três interruptores de automação de calendário do
WhatsApp gravavam `enabled` **sem nada que os executasse**. Do lado do caminho
sem saída: `/privacidade` e `/termos` eram TRÊS pontos de entrada para um 404,
e uma barbearia com slug `cadastro` ou `recuperar-senha` nunca abriria.

Duas armadilhas silenciosas que ninguém veria acontecer: **`Appointment.unitId`
nascia sempre nulo**, o que fazia o filtro por unidade dos Relatórios — que o
agente 20 entregou funcionando — devolver zero para sempre; e **o resgate de
pontos não era atômico**, então duas comandas do mesmo cliente fechando juntas
resgatavam o mesmo saldo duas vezes.

Do registro que faltava: o trabalho não commitado do agente 15 estava **muito
mais completo** do que as dívidas de outros agentes faziam supor — cinco das
nove correções previstas já estavam feitas, e ninguém sabia porque o registro
nunca foi escrito. É o argumento mais concreto deste arquivo para escrevê-lo
antes de fechar a sessão.

A suíte de frontend nasceu ali, criada por duas defesas que nada reprovava no
CI: o deadlock acima e a guarda de host do super admin.

Antes disso, o **agente 27 (auditoria 1:1 da tela Meu perfil)**: a `/app/meu-perfil` foi reconstruída contra
`Dashboard.dc.html` l.2737–2817 (dono/gerente), `DashboardFuncionario.dc.html`
l.776–845 (barbeiro) e os dois modais que pendem dela (l.3511 exclusão de
conta, l.1212 do funcionário pedido de exclusão de dados). O achado que mais
dói: **a tela tinha DOIS dos quatro blocos do desenho, e os dois pela metade**
— "Dados pessoais" era uma lista de texto READ-ONLY (nem nome, nem e-mail, nem
WhatsApp editáveis, sem endpoint por trás), e "Segurança" tinha dois dos três
campos, sem a confirmação da nova senha. Trocar a senha com um erro de digitação
derrubava as outras sessões e só se descobria no próximo login. "Privacidade e
dados" e o bloco vermelho "ATENÇÃO" não existiam em lugar nenhum: **"Excluir
minha conta", a ação mais destrutiva do produto inteiro, não tinha nem tela nem
endpoint**. Junto vieram três defeitos de fundo: **a foto do usuário não tinha
onde morar** (`avatarUrl` só existia em `Barber`, o profissional da agenda —
um gerente sem ficha de barbeiro não tinha onde guardar a própria foto, e o
protótipo respondia com um toast "será habilitado em breve"), **o recorte do
BARBEIRO não existia** (o desenho do funcionário trava o nome com "Gerenciado
pela administração da barbearia", esconde "Alterar foto" e troca o bloco
vermelho por "Solicitar exclusão dos meus dados" — nada disso estava lá), e **o
"30 dias para reativar a conta" que o modal promete não tinha como ser
cumprido**: não havia coluna de prazo nem faxina. Agora a exclusão AGENDA
(`Tenant.purgeAt`), cancela a assinatura no `PAYMENT_ADAPTER` na hora, manda o
e-mail com a data, deixa o dono entrar e desistir dentro da janela, e a
`MaintenanceService` apaga de vez quando o prazo vence — com `AuditLog`
sobrevivendo (`tenantId` é `SetNull`) como prova de que foi cumprida.
Suíte: 95 unit · 321 e2e · 173 isolamento.

Antes disso, o **agente 26 (auditoria 1:1 da aba
Configurações)**: a `/app/configuracoes` foi reconstruída contra
`Dashboard.dc.html` l.2466–2736 e os dois modais que pendem dela (l.3461
upgrade, l.3483 troca de plano). O achado que mais dói: **o gerente podia
trocar o plano da barbearia** — `/settings/plan*` era `@Roles('OWNER','MANAGER')`
quando o `SPEC.md` diz "MANAGER: dashboard completo EXCETO billing/plano do
SaaS", e isso não era um detalhe de leitura: um gerente podia fazer downgrade e
desligar barbeiros da equipe. Junto vieram quatro defeitos de fundo: **o
"Almoço" do horário de funcionamento não existia** (o toggle do desenho não
tinha coluna no banco — só o `WorkSchedule` de cada barbeiro tinha almoço),
**"Fechado" não chegava ao motor de disponibilidade** (`business.closed` só
desligava o RECORTE pelo expediente, então um barbeiro escalado no domingo
enchia de horários uma barbearia que não abre domingo), **o `modalTrocarPlano`
não existia** — a troca era um `window.confirm()`, sem os blocos de GANHOS e
PERDAS que são a razão de o modal existir — e **o link "PDF" das faturas era um
`href="#"`**. A grade de comparação mostrava só nome e preço, sem um recurso
sequer. Agora os ganhos e perdas saem do diff REAL entre os `features` dos dois
planos (`GET /settings/plan/preview/:planId`), com os NOMES dos barbeiros que o
downgrade vai desligar, e a troca passa pelo `PAYMENT_ADAPTER` como toda
cobrança do produto. O gate de `multiUnidades` mudou de lugar: a leitura das
unidades é livre e o cadeado ficou no botão "+ Nova unidade", como na topbar do
protótipo. Um achado fora do escopo, mas que aparecia na cara do usuário:
**suíte de teste interrompida deixava `SaasPlan` no banco para sempre**, e a
grade de planos listava "Avançado (isolamento)" ao lado dos planos de verdade.
Suíte: 95 unit · 296 e2e · 168 isolamento.

Antes disso, o **agente 23 (auditoria 1:1 da aba
Serviços & Produtos)**: a `/app/servicos-produtos` foi reconstruída
contra `Dashboard.dc.html` l.1723–2022 e o modal de serviço (l.1949). O achado
que mais dói: **a sub-aba "Calculadora de preço" não existia na aba** — ela
morava em Configurações, uma aba que o protótipo NÃO tem, como um `POST` sem
estado cujos valores iniciais eram os do desenho hardcodados no formulário
(`fixos = '3459'` é exatamente `2500+450+120+89+300` da fixture l.4762 — regra
1 violada em um `useState`). Junto vieram três defeitos de fundo: **serviço não
tinha cor nem comissão no schema** (duas colunas do desenho sem coluna no
banco, e a tela mostrava 4 colunas onde o protótipo desenha 6), **"Excluir" não
existia em lugar nenhum do catálogo** — nem para serviço, nem para produto, e
"Repor estoque" também não — e **o "Ativo" era um selo em vez do interruptor do
desenho**, transformando a ação mais frequente da tela em abrir um kebab. A
calculadora nasceu inteira e PERSISTIDA (custos fixos linha a linha, dois
sliders, ponto de equilíbrio com barra e marcador, simulação de lucro), com a
fórmula numa função pura só (`computePriceCalculator`, em `@barbervp/types`)
que a API e a página compartilham — os sliders respondem no cliente, o servidor
é a fonte da verdade, e as duas contas não têm como divergir. Os parâmetros
iniciais saem do TENANT (regras de comissão reais, `DONE` dos últimos 30 dias,
média do catálogo), não do protótipo. A comissão específica do serviço, que no
desenho era um toggle que descartava o valor, agora vence a regra do barbeiro
no fechamento da comanda. Suíte: 95 unit · 259 e2e · 153 isolamento.

Antes disso, o **agente 22 (auditoria 1:1 da aba
WhatsApp)**: a `/app/whatsapp` foi reconstruída contra
`Dashboard.dc.html` l.1624–1722 e os dois modais que pendem dela (l.4285
editor de mensagem, l.4318 envio em massa). O achado que mais dói: **a aba
tinha UM dos quatro blocos do desenho** — conexão, faixa de reativação e
histórico de envios simplesmente não existiam, e o único bloco presente era um
grid de seis cards onde o protótipo desenha UMA lista. Junto vieram três
defeitos de fundo: **toda barbearia recém-cadastrada abria a aba VAZIA** (o
`register` da fase 03 nunca criou linhas em `WhatsappAutomationConfig`, e o
`GET` devolvia o que achasse — nada), **`?evento=REACTIVATION` e
`?evento=BIRTHDAY`, os dois botões da faixa de alertas do Dashboard, eram
ignorados** (caíam numa lista sem nada aberto), e **o gate só olhava o
`enabled`** — dava para editar o template de uma automação fora do plano e
achar que tinha comprado o recurso. Nasceram os três controles por evento que
o desenho pede (antecedência do lembrete, hora do aniversário, janela da
reativação) com validação server-side, e a faixa dourada passou a contar pela
janela CONFIGURADA em vez de 30 dias fixos. A pré-visualização resolve os
placeholders com dado REAL da barbearia (um barbeiro, um serviço, o link
público), não com o "João Pedro / Corte + Barba / Diego" do protótipo.
Suíte: 88 unit · 238 e2e · 148 isolamento.

Antes disso, o **agente 21 (auditoria 1:1 da aba
Fidelidade)**: a `/app/fidelidade` foi reconstruída contra
`Dashboard.dc.html` l.1497–1623 e o modal `modalNewPlano` (l.3323) com os dois
diálogos que pendem dele (l.3376 impacto, l.3384 exclusão). O achado que mais
dói: **a aba tinha TRÊS sub-abas quando o protótipo revisado tem UMA** — Pontos
e Sorteios saíram do desenho e saíram da implementação (rotas, modal, hooks e
seed), em vez de serem completadas. Junto vieram três defeitos de gate: **o
cadeado do nav apontava para `fidelidadePontos` (Profissional) quando o
conteúdo real é `fidelidadeAssinaturas` (Avançado)**, **o `BARBER` via a aba no
menu** — o `DashboardFuncionario` não tem Fidelidade — e **o MRR do card
simplesmente não existia**, assim como "Reativar", "Excluir plano", "Pausar" e
"Cancelar", todos botões do desenho sem nenhum endpoint atrás. A coluna
"Pagamento" (Pago/Pendente/Atrasado) também não existia: nasceu agora, derivada
do `Payment` do ciclo cruzado com o `nextChargeAt`. No caminho, um defeito fora
do escopo: **o e2e de Relatórios quebrava das 21h à meia-noite** porque escolhia
a quarta-feira por `getUTCDay()` enquanto o resto do caso mede em São Paulo.
Suíte: 88 unit · 224 e2e · 144 isolamento.

Antes disso, o **agente 20 (auditoria 1:1 da aba Relatórios)**: a `/app/relatorios` foi reconstruída contra
`Dashboard.dc.html` l.1229–1496 e contra a versão do barbeiro em
`DashboardFuncionario.dc.html` l.667–775. O achado que mais dói: **a aba
inteira era uma página de cadeado quando o protótipo tranca CINCO dos oito
blocos** — e "Faturamento por barbeiro", que o desenho mostra sem cadeado
nenhum, vivia dentro do endpoint gated. Também entraram as 5 pílulas de
período com intervalo personalizado, os filtros de barbeiro e de UNIDADE (o
primeiro `unitId` que o produto de fato filtra), a exportação em PDF e CSV de
verdade, e quatro blocos que não existiam em lugar nenhum: heatmap de horários
de pico, taxa de faltas por mês, ticket médio por barbeiro e o headline da taxa
de retorno. No caminho, dois defeitos: **o período do relatório era resolvido
em UTC** (o "hoje" da barbearia virava o dia do container) e **um `@Transform`
de DTO transformava um parâmetro AUSENTE na string `"undefined"`**, o que
fazia toda consulta sem filtro procurar um barbeiro inexistente. O `BARBER`
passou a ver a aba, com o recorte próprio que o `DashboardFuncionario` desenha.
Suíte: 81 unit · 208 e2e · 139 isolamento.

Antes disso, o **agente 19 (auditoria 1:1 da aba Comissões)**: a `/app/comissoes` foi reconstruída contra
`Dashboard.dc.html` l.1089–1228 e os dois modais (l.4154 regras, l.4228 PDF).
O achado que mais dói: **o protótipo cobra uma coluna "Comissão produtos" e um
campo "% produtos" que o modelo simplesmente não tinha** — produto não gerava
comissão nenhuma, e a tela mostrava metade da conta que o barbeiro faz.
Entraram também o recorte Semanal/Mensal com stepper, os 3 KPIs, a tabela de 9
colunas com extrato expansível, o toggle "Descontar vales" com efeito real no
dinheiro e o relatório em PDF (pdfkit).

Antes disso, o **agente 18 (auditoria 1:1 da aba Financeiro)**: as 6 sub-abas foram reconstruídas contra
`Dashboard.dc.html` l.718–1088 e os 5 modais. O achado que mais dói: **duas das
seis sub-abas estavam travadas por plano sem que o protótipo as trancasse**
(contas bancárias e fluxo de caixa) — o Essencial via paywall onde deveria ver
a tela. Também entraram o extrato de caixa com forma de pagamento e categoria,
os lançamentos manuais (entrada avulsa / sangria), os KPIs somados em SQL,
parcelamento e recorrência de verdade, e a conferência de fechamento sobre o
DINHEIRO em vez do total do dia. Suíte: 81 unit · 185 e2e · 129 isolamento.

Antes disso, o **agente 17 (auditoria 1:1 da aba Comandas/POS)**: a `/app/comandas` foi reconstruída contra
`Dashboard.dc.html` l.639–717 e o modal l.3123 — 3 abas com contagem real, busca
por cliente/nº, grid de cards das abertas e a comanda como diálogo de 3 colunas.
No caminho, achou e corrigiu um defeito de sessão que atingia TODO o painel
(duas renovações simultâneas revogavam a família do refresh — ver "Os dois
achados"). Antes disso, o agente 16 reconstruiu a `/app/clientes`, o 14 separou
`make seed` de `make seed-demo` e a fase 13 reconstruiu a `/app`. Suíte:
81 unit · 173 e2e · 125 isolamento.

> Fase 12 (deploy) segue pendente. A 13 entrou na frente porque a auditoria
> mostrou que a tela mais visível do produto estava incompleta — não faz
> sentido publicar assim.

## Status das fases

| # | Fase | Status |
|---|---|---|
| 01 | Fundação | ✅ |
| 02 | Design system | ✅ |
| 03 | Auth & Tenancy | ✅ |
| 04 | Booking público | ✅ |
| 05 | Área do cliente | ✅ |
| 06 | Dashboard I | ✅ |
| 07 | Dashboard II | ✅ |
| 08 | Super Admin | ✅ |
| 09 | Integrações & Hardening (GATE) | ✅ |
| 10 | Landing de vendas | ✅ |
| 11 | Consolidação (4 apps → 1 frontend) | ✅ |
| 12 | Deploy | ⬜ |
| 13 | Auditoria 1:1 — tela Dashboard | ✅ |
| 14 | Auditoria — seeds de demonstração | ✅ |
| 15 | Auditoria 1:1 — aba Agenda | ✅ |
| 16 | Auditoria 1:1 — aba Clientes | ✅ |
| 17 | Auditoria 1:1 — aba Comandas (POS) | ✅ |
| 18 | Auditoria 1:1 — aba Financeiro | ✅ |
| 19 | Auditoria 1:1 — aba Comissões | ✅ |
| 20 | Auditoria 1:1 — aba Relatórios | ✅ |
| 21 | Auditoria 1:1 — aba Fidelidade | ✅ |
| 22 | Auditoria 1:1 — aba WhatsApp | ✅ |
| 23 | Auditoria 1:1 — aba Serviços & Produtos | ✅ |
| 24 | Auditoria 1:1 — aba Equipe | ✅ |
| 25 | Auditoria 1:1 — aba Minha Página | ✅ |
| 26 | Auditoria 1:1 — aba Configurações | ✅ |
| 27 | Auditoria 1:1 — tela Meu perfil | ✅ |
| 28 | Auditoria 1:1 — aba Assistente IA (`auditoria/`) | ✅ |
| 29 | Reparos transversais — fecha o 15 e as dívidas em aberto | ✅ |
| 30 | Configuração inicial obrigatória — wizard `/app/configurar` (`auditoria/`) | ✅ |

(⬜ pendente · 🟨 em andamento · ✅ concluída — só marcar ✅ com critérios de
aceite verdes; NUNCA avançar com a fase anterior quebrada)

> **Nota sobre o agente 15 — RESOLVIDA pelo agente 29 (2026-09-03).** Quando o
> 16 começou, o working tree já trazia a aba Agenda reconstruída
> (`components/dashboard/agenda/`, `agenda.e2e-spec.ts`, migration
> `agenda_time_block`) sem commit e sem registro nesta memória. O 16 não mexeu
> nesse trabalho — só acrescentou `preselectedClientId` ao modal. O agente 29
> auditou esse código contra o protótipo, corrigiu o que faltava e escreveu o
> bloco "O que o agente 15 entregou". **A lição, registrada porque custou
> caro:** cinco das nove correções que o enunciado do 29 listava como
> pendentes JÁ estavam feitas naquele código — as dívidas de outros agentes
> descreviam um estado anterior ao trabalho que ninguém registrou. Código sem
> registro é retrabalho garantido.

## Endpoints existentes

| Método | Rota | Auth | Tenant | Observações |
|---|---|---|---|---|
| GET | `/api/v1/health` | pública | não exige | Ping real em Postgres e Redis; 200 se ambos up, 503 se algum down. Fora do rate limit. |

### Auth de estabelecimento (`/api/v1/auth`) — fase 03

Todas `@TenantOptional()`: o tenant destas rotas nasce do login, nunca de header.

| Método | Rota | Auth | Rate limit | Observações |
|---|---|---|---|---|
| POST | `/auth/check-email` | pública | 20/min | `available` \| `establishment` \| `client` — os 3 estados do campo de e-mail do cadastro. |
| POST | `/auth/register` | pública | 5/h | `User`+`Tenant`(TRIAL)+`Membership` OWNER+`TenantSettings`+7 `TenantBusinessHour`+`Barber` do dono, em UMA transação. 201. |
| POST | `/auth/register/link` | pública | 5/h | Vincula conta de `Client` existente (confirma senha atual). 201. |
| POST | `/auth/login` | pública | 10/min | Aceita `tenantId` opcional para quem tem N barbearias. |
| POST | `/auth/refresh` | cookie | 60/min | Rotaciona; reuso do token antigo revoga a família inteira. |
| POST | `/auth/logout` | opcional | — | Revoga a sessão e limpa o cookie. 204. |
| GET | `/auth/me` | Bearer | — | Usuário + `memberships[]` com `onboardingDone`/`onboardingStep`. |
| POST | `/auth/context` | Bearer | — | **Seletor de contexto**: emite par novo apontando para outra barbearia. |
| POST | `/auth/password/change` | Bearer | 5/min | Derruba as demais sessões; mantém a atual. 204. |
| POST | `/auth/password/forgot` | pública | 5/15min | 202 sempre — não revela se o e-mail existe. Envia por `MailOutbox`. |
| POST | `/auth/password/reset` | pública | 10/15min | Token do e-mail; derruba TODAS as sessões. 204. |

### Auth do cliente (`/api/v1/client-auth`) — fase 03

| Método | Rota | Auth | Rate limit | Observações |
|---|---|---|---|---|
| POST | `/client-auth/login` | pública | 10/min | Campo único: telefone **ou** e-mail. |
| POST | `/client-auth/register` | pública | 5/15min | **Não cria a conta** — valida, guarda o cadastro pendente e dispara o OTP. 202. |
| POST | `/client-auth/otp/verify` | pública | 15/5min | Cadastro → sessão; recuperação → `resetToken`. |
| POST | `/client-auth/otp/resend` | pública | 10/15min | Cooldown de 59s (429 `OTP_COOLDOWN` com `retryInSeconds`). |
| POST | `/client-auth/otp/call` | pública | 5/15min | "Receber por chamada" — stub, registra a intenção no outbox. |
| POST | `/client-auth/password/forgot` | pública | 5/15min | Desafio de fachada quando não há conta (ver decisões). |
| POST | `/client-auth/password/reset` | pública | 10/15min | Token de uso único. 204. |
| POST | `/client-auth/refresh` · `/logout` | cookie | 60/min | Cookie e audience próprios. |
| GET | `/client-auth/me` | Bearer | — | `@Roles('CLIENT')`. |

### Onboarding (`/api/v1/onboarding`) — fase 03, revisto pelo agente 30

`@Roles('OWNER','MANAGER')`; tenant SEMPRE do `@CurrentTenant()` (JWT).
Todo `PUT` devolve o `OnboardingState` completo.

**Concluir o wizard é obrigatório para acessar o painel** (regra de produto do
agente 30), e a obrigatoriedade é do SERVIDOR: ver `complete`.

| Método | Rota | Observações |
|---|---|---|
| GET | `/onboarding` | Estado do wizard — permite retomar de onde parou. Devolve `publicUrl` (`{base}/{slug}`), `publicBaseUrl` (o MESMO de `GET /my-page`) e `ownerGreetingName`. |
| GET | `/onboarding/slug?slug=` | Disponibilidade do link público, com sugestão. Devolve `reserved: true` quando o nome é de uma ROTA do produto — recusa que nunca vai virar disponível, e a tela diz isso (🆕 ag.30). |
| GET | `/onboarding/cep/:cep` | Proxy da ViaCEP com cache no Redis (30 dias). 30/min. Passou a devolver `ibgeCode` — é por ele que o passo 2 seleciona a cidade no combo (chave de cache versionada para `v2`). |
| GET | `/onboarding/ufs` | 🆕 ag.30. As 27 UFs, lista ESTÁTICA de `@barbervp/types`. Sem chamada externa: 27 itens que não mudam desde 1988. |
| GET | `/onboarding/cities/:uf` | 🆕 ag.30. Proxy da API de localidades do IBGE, cache no Redis por 30 dias, mesmo throttle do CEP (30/min). `{ id, name }`, `id` = código IBGE. IBGE fora do ar devolve lista VAZIA (e não grava cache): a tela degrada para cidade digitada. |
| PUT | `/onboarding/profile` | Passo 1 — nome, telefone, Instagram, descrição (200 chars). |
| PUT | `/onboarding/location` | Passo 2 — endereço estruturado + linha única renderizada. Aceita `cityIbgeCode` (7 dígitos) além de `city`/`state`, e grava os três; `state` validado contra as 27 UFs. |
| PUT | `/onboarding/identity` | Passo 3 — **só o slug** (pulável). `logoUrl`/`coverUrl` saíram do DTO: `forbidNonWhitelisted` devolve 400 se vierem. Logo e capa sobem por `POST /my-page/images/:slot`. 409 `SLUG_RESERVED` (novo) separado de `SLUG_IN_USE`. |
| PUT | `/onboarding/services` | Passo 4 — `Service` em lote (sumiu = soft delete). |
| PUT | `/onboarding/team` | Passo 5 — `Barber` em lote (pulável); o dono é preservado. |
| PUT | `/onboarding/business-hours` | Passo 6 — `TenantBusinessHour` + propaga para `WorkSchedule`. |
| POST | `/onboarding/complete` | Marca `onboardingDoneAt` — **e só se os passos OBRIGATÓRIOS (1, 2, 4 e 6) tiverem dado gravado**. Senão, 409 `ONBOARDING_INCOMPLETE` com `details.missingSteps`. Confere o DADO, não o contador: "Pular etapa" faz `onboardingStep` subir sem salvar. Os passos 3 e 5 seguem puláveis (decisão da fase 03). |

### Planos públicos (`/api/v1/public/saas-plans`) — fase 10

`@Public()` **e** `@TenantOptional()` — é a única rota de `/public` que não fala
de uma barbearia, e sim do produto. Sem `@TenantOptional()` o `TenantGuard`
global devolveria 403 `TENANT_REQUIRED`.

**Ordem de registro importa**: `PublicPlansModule` entra ANTES do
`BookingModule` no `AppModule`. `PublicBookingController` é
`@Controller('public/:slug')` com `@Get()` na raiz, então `/public/saas-plans`
casaria com ele como `slug = "saas-plans"`. Express casa na ordem de registro.

| Método | Rota | Rate limit | Observações |
|---|---|---|---|
| GET | `/public/saas-plans` | global | Planos ativos por preço asc. Resposta igual para todos e sem dado de sessão: `cache-control: public, max-age=300, stale-while-revalidate=1800`. `id` é o `code` do plano (não o cuid) — é ele que vai no `/cadastro?plano=`. |

### Booking público (`/api/v1/public/:slug`) — fase 04

Todas `@Public()` — mas **não** `@TenantOptional()`: o `:slug` da rota é o que
resolve a barbearia, e todo serviço filtra por `@CurrentTenant('id')`. Nenhuma
aceita `tenantId` no corpo ou na query. O token, quando existe, é lido mesmo
assim (acende o selo de assinatura e liga o agendamento à conta).

| Método | Rota | Rate limit | Observações |
|---|---|---|---|
| GET | `/public/:slug` | global | Página inteira numa resposta: serviços, equipe, planos, avaliações, horário, política. |
| GET | `/public/:slug/quote` | global | Aplica o combo, precifica, marca cobertura de assinatura e diz quem atende (com o motivo de quem não atende). |
| GET | `/public/:slug/availability` | 60/min | Chips de dia (com "sem vagas"), horários do dia por período e atalho do próximo dia livre. |
| POST | `/public/:slug/appointments` | 30/h (env) | Cliente logado ou visitante. `201` com `kind: 'confirmed'` ou `'otp-required'`. `409 DOUBLE_BOOKING` se o horário foi tomado. |
| POST | `/public/:slug/appointments/confirm` | 15/5min | Fecha o guest booking verificado (código de 6 dígitos). |
| GET | `/public/:slug/appointments/:code` | 20/min | Consulta pelo código; visitante prova com o telefone. |
| POST | `/public/:slug/appointments/:code/cancel` | 20/min | Respeita `TenantSettings.cancelamentoHoras` e devolve o uso da assinatura. |
| POST | `/public/:slug/appointments/:code/reschedule` | 20/min | Revalida a grade e passa de novo pela EXCLUDE. |

Swagger em `http://localhost:3333/api/docs` (tags já registradas para os
módulos das fases seguintes).

### "Meus dados" e LGPD (`/api/v1/client-auth`) — fase 05

Globais (`@TenantOptional()`, como o resto de `client-auth`) — o perfil, a
senha e os dados exportados são do cliente, não de uma barbearia.

| Método | Rota | Auth | Rate limit | Observações |
|---|---|---|---|---|
| PATCH | `/client-auth/me` | `@Roles('CLIENT')` | — | Nome, e-mail, `notifyWhatsapp`/`notifyEmail`. |
| POST | `/client-auth/me/phone` | `@Roles('CLIENT')` | 5/15min | Inicia a troca de telefone — dispara `OtpPurpose.CLIENT_PHONE_CHANGE`. |
| POST | `/client-auth/me/phone/confirm` | `@Roles('CLIENT')` | 15/5min | Confirma com o código; sincroniza `ClientProfile.phone` em TODAS as barbearias do cliente. |
| POST | `/client-auth/password/change` | `@Roles('CLIENT')` | 5/min | Senha atual como prova; derruba as demais sessões (mesmo padrão do painel). 204. |
| GET | `/client-auth/me/export` | `@Roles('CLIENT')` | — | JSON completo (LGPD) — perfil, agendamentos, assinaturas e avaliações de TODAS as barbearias. |
| POST | `/client-auth/me/delete` | `@Roles('CLIENT')` | 5/h | Anonimiza (`name`/`phone`/`email`/`passwordHash`), preserva `Order`/`Payment`. 204. |

### Agendamentos e assinatura do cliente (`/api/v1/public/:slug/account`) — fase 05

Tenant do `:slug`, como o resto do booking; `@Roles('CLIENT')` em vez de
`@Public()` — exige Bearer. Cancelar/remarcar continuam sendo as MESMAS rotas
da fase 04 (`/public/:slug/appointments/:code/cancel`/`reschedule`), chamadas
pelo cliente logado com o `bookingCode` que esta lista devolve.

| Método | Rota | Rate limit | Observações |
|---|---|---|---|
| GET | `/account/appointments` | — | Próximos (futuro, SCHEDULED/CONFIRMED) e histórico. |
| POST | `/account/appointments/:id/rate` | 20/min | 1–5 estrelas, uma vez por atendimento (`Review.appointmentId` `@unique`). 409 na segunda tentativa. |
| GET | `/account/subscription/plans` | — | 403 `FEATURE_NOT_IN_PLAN` se o tenant não tem `fidelidadeAssinaturas`. |
| GET | `/account/subscription` | — | `{ enabled, subscription, billingHistory }` — nunca lança pelo gate, só `enabled: false`. |
| POST | `/account/subscription` | 10/h | Assina (cartão OU Pix mock, auto-aprovado). 409 se já houver assinatura não cancelada. |
| POST | `/account/subscription/pause` \| `/resume` \| `/cancel` | — | Ver decisões abaixo. |

### Clientes (`/api/v1/clients`) — fase 06, revisto pelo agente 16

`@Roles('OWNER','MANAGER')` — `BARBER` toma 403 (a visão dele é a própria
agenda, não a base de clientes). Tudo escopado por `@CurrentTenant('id')`.

| Método | Rota | Observações |
|---|---|---|
| GET | `/clients` | Paginado; `search` (nome/telefone/e-mail), `favoriteBarberId`, `blocked`, `status` (chip da aba), `sort`/`order`. Devolve `counts` — as 5 contagens dos chips, disjuntas e somando o total, calculadas DENTRO da busca e ignorando o status escolhido. Cada item traz `status` derivado, `loyaltyPoints` (`null` sem programa) e `acceptsMessages`. |
| GET | `/clients/export` | **Agente 16.** CSV da lista (busca + chip) ou da seleção (`ids=` separados por vírgula). `text/csv` com BOM e `;` (Excel pt-BR), célula escapada contra injeção de fórmula, teto de 5.000 linhas. Registrada ANTES de `:id`. |
| GET | `/clients/:id` | **Agente 16.** Perfil do drawer numa resposta só: KPIs (inclui ticket médio), histórico das últimas 20 comandas FECHADAS, extrato de pontos e a assinatura do ciclo corrente com uso por serviço. |
| POST | `/clients` | Cadastro. Aceita a ficha inteira do modal "Novo cliente" (`email`, `birthDate`, `notes`, `acceptsMessages`) além de nome e telefone; `Client` é identidade global e é reaproveitado pelo telefone. |
| POST | `/clients/bulk/block` | **Agente 16.** `{ ids, blocked }`; o `updateMany` filtra por `tenantId` junto com os ids e a resposta conta só o que mudou de verdade. Máx. 200. |
| POST | `/clients/bulk/message` | **Agente 16.** `{ ids, body }` pelo `NotificationAdapter`, com `{nome}` substituído; pula quem tem `notifyWhatsapp: false` e devolve `{ queued, skipped }`. Máx. 200. |
| PATCH | `/clients/:id` | Notas e barbeiro favorito (`ClientProfile`, não `Client`). |
| PATCH | `/clients/:id/block` \| `/unblock` | Bloqueia/libera o agendamento online deste cliente NESTA barbearia. |

### Serviços & Produtos (`/api/v1/services`, `/api/v1/products`, `/api/v1/price-calculator`) — fase 06, reescrito pelo agente 23

`@Roles('OWNER','MANAGER')` — `BARBER` toma 403 (o `DashboardFuncionario` não
tem esta aba). É o MESMO `Service`/`Product` que o booking público e o motor de
disponibilidade leem — editar aqui muda a vitrine na hora, sem sincronização à
parte.

| Método | Rota | Observações |
|---|---|---|
| GET \| POST | `/services` | Paginado (`search`/`category`/`active`); criar sincroniza `BarberService`. **Agente 23:** a resposta ganhou `defaultCommissionBps` no envelope (a regra da casa que o modal mostra como herança) e cada linha traz `color`, `commissionBps` (override, `null` = herda) e `effectiveCommissionBps` (o que a coluna "Comissão padrão" exibe). |
| PATCH | `/services/:id` | Atualiza campos + `barberIds` (substitui a lista). **Agente 23:** aceita `color` (só as 6 de `SERVICE_COLORS`; hex livre é 400) e `commissionBps` (0–10000). |
| PATCH | `/services/:id/activate` \| `/deactivate` | Some do booking, mantém histórico. |
| DELETE | `/services/:id` | **Agente 23.** "Excluir" do kebab — **soft-delete** (`deletedAt` + nome carimbado, para liberar o `@@unique([tenantId,name])`). 409 quando há agendamento FUTURO `SCHEDULED`/`CONFIRMED`, com a saída ("desative") no texto. Nunca hard-delete: `Appointment`/`OrderItem`/`ClientPlanItem` referenciam. |
| GET \| POST | `/products` | Paginado (`search`/`category`/`active`/`lowStock`); `lowStock` compara `stock` com `estoqueMin` (filtro em memória — Prisma não expressa comparação entre duas colunas em `where`). **Agente 23:** cada linha traz `marginBps` (`null` sem custo, em vez de `Infinity`). |
| PATCH | `/products/:id` \| `/:id/activate` \| `/:id/deactivate` | Idem serviços. |
| POST | `/products/:id/restock` | **Agente 23.** "Repor estoque" — `{ quantity }` (1–100.000) por `increment`, nunca `SET` absoluto. `AuditLog`. |
| DELETE | `/products/:id` | **Agente 23.** Soft-delete. 409 com estoque > 0 ou item em comanda ABERTA. |
| GET \| PUT | `/price-calculator` | **Agente 23.** Calculadora de preço inteligente — `@RequireFeature('calculadoraPreco')` no controller INTEIRO (a leitura também é gated: o cadeado está na aba, não num botão). `PUT` substitui a lista de custos fixos e devolve os derivados. Primeiro acesso vem sem custos, mas com comissão média/atendimentos/preço praticado **derivados do tenant** (regras de comissão, `DONE` dos últimos 30 dias, média do catálogo). Faixas dos sliders validadas no DTO *e* em `CHECK` no banco. |

> A calculadora **saiu de `/settings/price-calculator`** (fase 07). O protótipo
> a desenha na aba Serviços & Produtos (l.1856), não em Configurações — e a
> versão antiga era um `POST` sem estado, com os defaults do desenho
> hardcodados no formulário.

### Equipe (`/api/v1/barbers`, `/api/v1/team/invites`, `/api/v1/staff-invites`) — fase 06

`/barbers` e `/team/invites` são `@Roles('OWNER','MANAGER')`. `/staff-invites/*`
é `@Public()` + `@TenantOptional()` — quem ainda não tem sessão nenhuma só tem
o token do e-mail.

| Método | Rota | Observações |
|---|---|---|
| GET \| POST | `/barbers` | Lista o time (grid); `POST` adiciona barbeiro SEM login, copiando `TenantBusinessHour` para o `WorkSchedule` dele. Gate `maxBarbeiros` do plano. Cada linha traz `serviceNames`, `commissionLabel` e `inactiveByPlan` (fase 24). |
| GET | `/barbers/plan-usage` | **fase 24** — `activeBarbers`/`pendingInvites`/`maxBarbers`/`canAddBarber`/`inactiveByPlanNames`. É a fonte do "Barbeiros: X de Y", da barra e do banner de downgrade. |
| PATCH | `/barbers/:id` | Nome/contato/`avatarUrl`/`serviceIds`/`active` **e a semana inteira (`schedule`) na mesma transação** (fase 24). Barbeiro-dono não pode ser desativado; REATIVAR passa pelo gate de plano (403). WhatsApp quebrado recusa (400) em vez de virar `null`. |
| GET \| PUT | `/barbers/:id/work-schedule` | Escala semanal (7 dias, com almoço e `isDayOff`). Validação da semana inteira ANTES de gravar qualquer dia. |
| GET \| POST | `/barbers/exceptions` | Folga avulsa/férias/feriado — `barberId` nulo = barbearia inteira. Alimenta o ícone de férias da matriz da escala. |
| DELETE | `/barbers/exceptions/:id` | Remove a exceção. |
| GET \| POST | `/team/invites` | Lista/convida por e-mail com serviços pré-marcados e a semana montada no modal (`schedule`; `workDays` vira derivado). Gate `maxBarbeiros` (conta ativos + convites `PENDING`). |
| POST | `/team/invites/:id/resend` \| `/revoke` | Reenvio gera token novo (o antigo perde validade); revogação é definitiva. |
| POST | `/team/invites/:id/link` | **fase 24** — reemite o token e devolve a URL do `CadastroFuncionario` SEM mandar e-mail (o link anterior morre). É o "Gerar link de cadastro" da linha do convite. |
| GET | `/staff-invites/:token` | Preview público — e-mail travado, serviços, dias, `valid`/`invalidReason`. |
| POST | `/staff-invites/accept` | `{ token, password }` → cria `User` (se preciso) + `Membership` BARBER + `Barber` + `WorkSchedule` + `BarberService`, e já devolve sessão logada (mesmo formato do login). |

### Agenda interna (`/api/v1/staff-agenda`) — fase 06

`@Roles('OWNER','MANAGER','BARBER')` — MESMO endpoint para `Dashboard` e
`DashboardFuncionario`; `StaffScopeService` resolve `forcedBarberId` a partir
de `(tenantId, userId)` e o serviço filtra por dentro. `BARBER` pedindo
`barberId` de outro no `GET` tem o parâmetro silenciosamente ignorado (a
resposta só mostra a própria coluna); tentando **criar/mover/cancelar** um
agendamento de outro barbeiro toma 403 — é esse o caso coberto pelo critério
de aceite "BARBER tentando acessar agenda de outro barbeiro".

| Método | Rota | Observações |
|---|---|---|
| GET | `/staff-agenda` | `date`+`view` (`DAY`\|`WEEK`\|`TIMELINE` — `TIMELINE` usa a mesma forma de `DAY`, o front é que desenha diferente) `+barberId` opcional. |
| POST | `/staff-agenda` | Cria pelo staff — cliente cadastrado OU walk-in (`guestName`/`guestPhone`). Reusa `AvailabilityService`/`CatalogService`/`SubscriptionCoverageService` da fase 04; `origin: DASHBOARD`. |
| PATCH | `/staff-agenda/:id/move` | Remarca (novo horário e/ou barbeiro), revalida a grade. |
| PATCH | `/staff-agenda/:id/cancel` | Cancela e devolve uso de assinatura, se houver. |

### Comandas / POS (`/api/v1/orders`) — fase 07

`@Roles('OWNER','MANAGER','BARBER')` — `BARBER` só vê/mexe nas próprias
comandas (`StaffScopeService`, mesmo recorte da agenda interna). Sem gate de
feature — comandas são o core do produto, liberado em todo plano.

| Método | Rota | Observações |
|---|---|---|
| GET | `/orders/catalog` | Serviços/produtos/barbeiros ativos para o balcão. **Agente 17:** + `nextNumber`, o `#N` que o modal "Nova comanda" mostra antes de a comanda existir. |
| GET | `/orders` | Lista abertas/fechadas — `status`/`search`/`barberId`, paginado. **Agente 17:** + `closedToday` (recorte do dia no fuso do tenant), `counts` (`abertas`/`fechadasHoje`, que ignoram a aba e respeitam a busca), e cada linha traz `subtotalCents` + `lines[]` para o card. `search` aceita `#123`. |
| GET \| POST | `/orders/:id` \| `/orders` | Detalhe; abrir (cliente cadastrado, walk-in `{name,phone}`, ou vinculado a um `appointmentId`). **Agente 17:** o detalhe passou a trazer `loyaltyEnabled`/`loyaltyPointsRequired`/`loyaltyRewardCents` — a prévia do resgate, mostrada ANTES de o toggle ser ligado. |
| PATCH | `/orders/:id` | **Agente 17.** Troca cliente e/ou barbeiro de uma comanda ABERTA — o "trocar" do cabeçalho do modal. Trocar o cliente REAVALIA a cobertura de assinatura item a item e derruba o resgate de pontos. `AuditLog`. |
| POST \| PATCH \| DELETE | `/orders/:id/items(/:itemId)` | Adiciona/atualiza quantidade/remove item. Serviço com cliente coberto por assinatura ativa entra a R$0 automaticamente (`quantity` 1 apenas). |
| PATCH | `/orders/:id/discount` | Desconto percentual (basis points) ou fixo (centavos). |
| PATCH | `/orders/:id/loyalty` | Liga/desliga o resgate de pontos (aplica `valorDesconto` de uma vez, se o saldo cobrir `pontosParaDesconto`). |
| POST | `/orders/:id/close` | **Fechamento em transação única** — ver "Decisões técnicas". |
| POST | `/orders/:id/reopen` | Só `OWNER`/`MANAGER` (`@Roles` no método, não na classe), sempre `AuditLog`. |

### Financeiro (`/api/v1/finance`) — fase 07, revisto na fase 18

`@Roles('OWNER','MANAGER')` — `BARBER` toma 403 em TODAS as rotas e não vê o
item no nav (`navForRole`), como no `DashboardFuncionario`.

**Gate de plano (corrigido na fase 18):** `contasPagarReceber` cobre
EXATAMENTE as 3 sub-abas que o protótipo tranca (`LOCKED_FIN_TABS` =
contas a pagar · contas a receber · vales). **Caixa, contas bancárias e fluxo
de caixa são de TODO plano** — antes as duas últimas estavam travadas, o que
escondia do Essencial telas que o protótipo lhe entrega. Há caso em
`dashboard-ii.isolation-spec.ts` afirmando os 200, para não regredir.

| Método | Rota | Observações |
|---|---|---|
| GET \| POST | `/finance/cash-register` \| `/cash-register/open` \| `/cash-register/close` | O status devolve `entriesCents`/`exitsCents`/`currentCents` (os 4 KPIs), `byMethod[]` (resumo do fechamento — só ENTRADAS por forma) e `expectedCashCents`. |
| POST | `/finance/cash-register/movements` | **Fase 18.** "+ Entrada avulsa" / "+ Saída/Sangria": `{direction, amountCents, description, category, method}`. Valor sempre positivo — quem inverte o sinal é o servidor. Categoria validada contra a lista da direção; saída em `CASH` maior que a gaveta é 400. |
| GET \| POST | `/finance/payables` \| `/receivables` | A listagem devolve `summary` (`overdueCents`/`next7DaysCents`/`monthCents`) somado em SQL sobre o conjunto, não sobre a página. `installments`/`recurrence` materializam N linhas com `seriesId` comum. |
| PATCH | `/finance/payables/:id/pay` \| `/receivables/:id/receive` | Liquidar duas vezes é 409 `ACCOUNT_ALREADY_SETTLED`. |
| GET \| POST \| PATCH | `/finance/bank-accounts(/:id)` | Nome (único por tenant, 409), `type`, `acceptedMethods: PaymentMethod[]`, saldo. Sem gate de plano. |
| GET | `/finance/cash-flow` | Mensal agregado em SQL (`?months=`, 1–24, default 6): `inflowByCategory`/`outflowByCategory` e `accumulatedCents`. Entradas de comanda são RATEADAS pelo peso de cada item (Serviços × Produtos); assinaturas, recebíveis e vales entram como categorias próprias. Sem gate de plano. |

**Conferência do caixa.** `expectedCents` do fechamento é só o DINHEIRO
(`method = CASH`), não o total do dia: o operador conta a gaveta, e Pix/cartão
não estão nela. Somar tudo faria toda barbearia com maquininha fechar com uma
"quebra" do tamanho das vendas no cartão. O extrato mostra as três formas; a
conferência filtra uma.

**`OVERDUE` é derivado, nunca gravado.** A coluna guarda `PENDING`; vencida é
quem passou de `dueDate`. Gravar exigiria job noturno e criaria estado que
envelhece sozinho.

### Comissões (`/api/v1/commissions`) — fase 07

`@Roles('OWNER','MANAGER','BARBER')` atrás de `comissoes` (Profissional+) —
gate no CONTROLLER inteiro, então Essencial toma 403 mesmo sendo `BARBER`
pedindo o próprio extrato. `BARBER` só vê a si mesmo.

| Método | Rota | Observações |
|---|---|---|
| GET \| POST \| PATCH | `/commissions/rules(/:id)` | `FIXED` (%) ou `TIERED` (faixas); `barberIds` substitui o vínculo `Barber.commissionRuleId`. **Fase 19**: ganhou `percentProdutosBps` e `deductVales`. |
| GET | `/commissions/period` | Extrato — lê os `CommissionEntry` gravados no fechamento da comanda. **Fase 19**: aceita `?type=WEEKLY&anchor=YYYY-MM-DD` além do `?month=YYYY-MM` de sempre; a resposta traz `start`/`end`/`totalAPagarCents`/`scoped` e separa comissão de serviço da de produto. |
| GET | `/commissions/period/report.pdf` | **Fase 19, nova** — `?barberId=` mais o mesmo recorte do `/period`. Devolve `application/pdf` (pdfkit). `BARBER` só emite o próprio (404 no do colega). |
| POST | `/commissions/period/close` | Recalcula a taxa definitiva pelo faturamento TOTAL de SERVIÇO do mês, trava (`status: PAID`) e quita os vales — **só os de quem tem `deductVales`**. |
| GET \| POST | `/commissions/vales` | Atrás de `vales` (Profissional+) — vale entra automaticamente no desconto do próximo fechamento de período. |

### Fidelidade (`/api/v1/loyalty`) — fase 07, reescrito pelo agente 21

`@Roles('OWNER','MANAGER')`. A aba do painel ficou **só com Assinaturas**
(`fidelidadeAssinaturas`, Avançado). `/loyalty/clients` e toda a família
`/loyalty/raffles` FORAM REMOVIDAS — as sub-abas que as consumiam saíram do
protótipo. `/loyalty/program` sobreviveu SEM TELA: o programa de pontos
continua sendo lido pela comanda (resgate) e pela aba Clientes (saldo). Ver
dívida "o programa de pontos ficou sem tela".

| Método | Rota | Observações |
|---|---|---|
| GET \| PATCH | `/loyalty/program` | `fidelidadePontos` (Profissional+). Sem tela no painel — ver dívida. |
| GET \| POST \| PATCH | `/loyalty/plans(/:id)` | CRUD do `ClientPlan` vendido pela barbearia — o MESMO modelo que a fase 05 usa do lado do cliente. A lista traz arquivados (o card esmaecido do desenho), com `mrrCents` e `canDelete` calculados no servidor. |
| PATCH | `/loyalty/plans/:id/archive` \| `/reactivate` | **Agente 21, nova a segunda** — some da vitrine / volta para ela. Devolvem o card pronto. |
| DELETE | `/loyalty/plans/:id` | **Agente 21, nova** — 204. 409 `CLIENT_PLAN_HAS_SUBSCRIBERS` se QUALQUER assinatura (mesmo cancelada) aponta para o plano; aí o caminho é arquivar. |
| GET | `/loyalty/subscribers` | Assinantes com uso do ciclo (`SubscriptionUsage`), `usedTotal`/`quotaTotal` somados e `paymentStatus` derivado (`PAID`/`PENDING`/`OVERDUE`/`PAUSED`). |
| PATCH | `/loyalty/subscribers/:id/pause` \| `/resume` \| `/cancel` | **Agente 21, novas** — delegam ao `ClientSubscriptionService` da fase 05; `cancel` devolve 204. O log grava `actorUserId` (dono) em vez de `actorClientId`. |

### WhatsApp (`/api/v1/whatsapp-config`) — fase 07, reescrita na fase 22

`@Roles('OWNER','MANAGER')` — o `DashboardFuncionario.dc.html` não tem esta
tela, então `BARBER` não a vê no nav E toma 403 na URL.

Lembrete/confirmação/cancelamento liberados em todo plano;
aniversário/reativação/avaliação exigem `whatsappCompleto` (Profissional+) —
checado por EVENTO, não no controller inteiro: ler a lista sempre funciona
(senão a tela não teria o que trancar com cadeado), com os avançados sempre
`enabled:false` e `locked:true` quando o plano não cobre. Na fase 22 o gate
passou a cobrir a linha INTEIRA: editar o template de um evento avançado
também é 403, não só ligar o interruptor.

| Método | Rota | Observações |
|---|---|---|
| GET | `/whatsapp-config` | `{ items, sample }`. Os 6 eventos SEMPRE, na ordem do protótipo, com padrão de fábrica para quem nunca configurou (leitura não escreve nada). Cada item traz `locked`, `control` e `options`. |
| GET | `/whatsapp-config/connection` | Estado do `NOTIFICATION_ADAPTER` + total de mensagens no outbox do tenant. `driver:'MOCK'` enquanto não houver provedor. |
| GET | `/whatsapp-config/history` | "Histórico de envios" — `NotificationOutbox` do tenant, paginado por cursor. Nome do cliente resolvido em UMA consulta a mais (nunca N+1); telefone sai MASCARADO. |
| GET | `/whatsapp-config/reactivation` | Contagem de inativos na janela configurada na automação, `optedOutCount` e o preview resolvido. |
| POST | `/whatsapp-config/reactivation/send` | Disparo em massa pelo adapter (teto de 500). 403 sem `whatsappCompleto`. Pula quem desligou `notifyWhatsapp` e devolve `{queued, skipped}`. |
| PATCH | `/whatsapp-config/:event` | **Upsert** (a linha pode não existir). `offsetMinutes` validado contra as `options` publicadas pela própria API. |

**`offsetMinutes` muda de unidade por evento** (`WHATSAPP_CONTROL` em
`packages/types`): minutos de antecedência no lembrete (`DELAY_BEFORE`),
minutos desde a meia-noite no aniversário (`TIME_OF_DAY`), dias × 1440 na
reativação (`INACTIVITY_DAYS`). Quem lê `offsetMinutes` sem olhar o `control`
vai errar a conta.

### Assistente IA (`/api/v1/assistant`) — fase 07, reescrito pelo agente 28

`@Roles('OWNER','MANAGER')`. Sem gate de feature — o limite mensal por plano
(`AI_MESSAGE_LIMIT_BY_TIER`: Essencial 50, Profissional 200, Avançado
ilimitado) já regula o uso, contado nas `AiChatMessage` do TENANT no mês
corrente (era por usuário até o agente 28 — a cota é do plano, não da pessoa).

| Método | Rota | Observações |
|---|---|---|
| GET | `/assistant/messages` | Histórico (100 últimas, `hiddenAt IS NULL`) + uso do mês + sugestões do driver. |
| POST | `/assistant/messages` | Resposta com `card` opcional. 403 `AI_MESSAGE_LIMIT_REACHED` ao estourar o limite. |
| DELETE | `/assistant/messages` | Limpa a conversa do usuário. A cota do mês PERMANECE contada (ver agente 28). |

### Relatórios (`/api/v1/reports`) — fase 07, reescrito pelo agente 20

`@Roles('OWNER','MANAGER','BARBER')`. A divisão entre as duas rotas é a do
PROTÓTIPO, não uma escolha de arquitetura: o que aparece SEM cadeado na tela
mora em `summary` (todo plano), o que aparece embaçado atrás de "Disponível no
plano Profissional" mora em `advanced` (`relatoriosAvancados`). Mover um bloco
de lado muda o que o Essencial vê.

Todas as rotas aceitam o mesmo filtro: `?period=hoje|7d|30d|mes|custom`
(default `30d`; `custom` exige `from`/`to` em `YYYY-MM-DD`), `?barberIds=`
(repetível) e `?unitId=`. A janela é resolvida no FUSO DA BARBEARIA.

| Método | Rota | Observações |
|---|---|---|
| GET | `/reports/summary` | Faturamento do período + janela anterior + delta, série (por HORA em `hoje`, por dia no resto), faturamento por barbeiro e rosca de formas de pagamento. `scoped: true` quando o papel é `BARBER`. |
| GET | `/reports/advanced` | 🔒 `relatoriosAvancados`. Faturamento por serviço, taxa de retorno (4 faixas + headline), heatmap dia×hora com rótulo de pico, taxa de faltas dos últimos 8 meses com o mês de ativação do lembrete, e ticket médio por barbeiro. |
| GET | `/reports/export.csv` | 🔒 `relatoriosAvancados`. Planilha `;` + BOM (Excel pt-BR) montada do MESMO par de respostas que a tela desenha. |
| GET | `/reports/export.pdf` | 🔒 `relatoriosAvancados`. Mesmo conteúdo em A4 (pdfkit), mesma paleta clara do relatório de comissão. |

### Configurações e Minha Página (`/api/v1/settings`, `/api/v1/my-page`) — fase 07, revisto pelo agente 26

`@Roles('OWNER','MANAGER')` no controller, **`@Roles('OWNER')` em tudo que é
plano e cobrança** (`SPEC.md` → RBAC: o gerente não mexe no billing do SaaS).
O gate `multiUnidades` está nas ESCRITAS de unidade, não na leitura — a
sub-aba mostra a lista e o cadeado fica no botão "+ Nova unidade", como na
topbar do protótipo. `/my-page` não tem gate — branding público não está em
`FEATURE_KEYS` (o overlay `minhaPaginaLocked` do protótipo é código morto; ver
decisão). A calculadora saiu daqui na fase 23 (`/price-calculator`).

| Método | Rota | Papel | Observações |
|---|---|---|---|
| GET \| PATCH | `/settings/barbershop` | OWNER/MANAGER | Nome/CNPJ/endereço/telefone/fuso + `TenantBusinessHour`, agora **com almoço da casa** (`lunchStart`/`lunchEnd`). Fuso validado contra `TENANT_TIMEZONES`. Recusa 400 com o DIA no texto quando o almoço sai do expediente. Não repropaga pra `WorkSchedule` dos barbeiros — ver decisão. |
| GET | `/settings/units` | OWNER/MANAGER | Sem gate (🆕 ag.26). Cada linha traz `status` DERIVADO: `INACTIVE` \| `SETUP` (ligada, zero barbeiro) \| `ACTIVE`. |
| POST \| PATCH | `/settings/units(/:id)` | OWNER/MANAGER | `@RequireFeature('multiUnidades')`. A primeira criada vira `isDefault`. |
| GET | `/settings/plan` | **OWNER** | Plano atual + faturas + planos disponíveis COM `marketing` (os bullets do card). `renewsAt` é **nulo** sem assinatura (era `new Date()`, e a tela anunciava renovação para hoje). Cada fatura traz `overdue` — `PENDING` + `BILLING_DUE_DAYS` (env, padrão 5). |
| GET | `/settings/plan/preview/:planId` | **OWNER** | 🆕 ag.26. O corpo do `modalTrocarPlano`: `gained`/`lost` do diff REAL entre os `features` dos dois planos + os NOMES dos barbeiros que o downgrade desliga (mesma ordem de `applyPlanLimit`). 409 `PLAN_UNCHANGED` no plano atual. |
| POST | `/settings/plan/change` | **OWNER** | Passa pelo `PAYMENT_ADAPTER` (`createCharge` → CONFIRMED → RECEIVED) e a `SaasInvoice` nasce com `externalId`. Downgrade não recusa: `applyPlanLimit` desliga os excedentes. 409 no plano atual. |
| GET | `/settings/plan/invoices/:id.pdf` | **OWNER** | 🆕 ag.26. Recibo da fatura (pdfkit, mesma paleta clara dos outros exports). Busca por `id` **e** `tenantId` — fatura do vizinho é 404. |
| GET \| PATCH | `/settings/preferences` | OWNER/MANAGER | `bloquearFaltasAtivo`/`bloquearFaltasQtd`/`antecedenciaMinima`/`cancelamentoHoras`/`monthlyGoalCents`. Validação por FAIXA, não por lista — ver decisão do seletor. |
| GET \| PATCH | `/my-page` | Slug (valida com `SlugService`, mesma trava de reservados do onboarding), sobre, Instagram, endereço, toggles. Devolve também `publicBaseUrl` (prefixo do campo de URL). 409 `SLUG_IN_USE` quando o link já é de outra. |
| GET | `/my-page/preview` | 🆕 ag.25. Payload da página pública, servido pelo MESMO `PublicPageService` de `/{slug}` — é o "Preview ao vivo". |
| POST \| DELETE | `/my-page/images/:slot` | 🆕 ag.25. Upload REAL de logo/capa (`slot` ∈ `logo`\|`cover`), multipart, JPG/PNG/WebP até 5 MB, atrás de `StorageAdapter`. |
| POST \| DELETE | `/my-page/photos(/:id)` | Galeria — o POST virou upload multipart (era URL digitada); teto de 12 fotos. |
| GET \| PATCH | `/my-page/reviews(/:id)` | 🆕 ag.25. Tabela "Avaliações recebidas": lista TODAS (publicadas ou não) e liga/desliga `Review.published`, que controla a página pública E a média da nota. |

### Meu perfil (`/api/v1/me`) — agente 27

A PESSOA logada, não a barbearia. Prefixo próprio de propósito: `/settings` é
do TENANT e vive inteiro sob `@Roles('OWNER','MANAGER')`; aqui os TRÊS papéis
entram — o barbeiro também troca a própria senha e baixa os próprios dados. O
recorte por papel não é "tem acesso ou não", é campo a campo, e por isso mora
DENTRO do serviço. Os três `can*` do payload são o espelho exato desses 403 —
a tela não recalcula permissão a partir do papel (regra 3).

A troca de senha continua em `POST /auth/password/change` (fase 03), que já
revoga as demais sessões e audita. Repetir a rota aqui daria dois caminhos
para a mesma operação sensível.

| Método | Rota | Papel | Observações |
|---|---|---|---|
| GET | `/me` | OWNER/MANAGER/BARBER | Nome, e-mail, WhatsApp, foto, `role`/`roleLabel` (o selo do desenho), `tenantName`, os três `can*` e `scheduledDeletion`. O WhatsApp CAI para `Barber.phone` quando o `User` não tem — quem entra pelo convite da Equipe não tem telefone próprio, e o campo vazio parecia dado perdido. |
| PATCH | `/me` | OWNER/MANAGER/BARBER | Nome/e-mail/WhatsApp. **403 quando um BARBER tenta mudar o próprio nome** (a ficha é da Equipe). Reenviar o mesmo nome não conta como edição — a tela do funcionário manda o campo travado de volta. 409 `EMAIL_IN_USE`. Telefone normalizado para E.164; escreve TAMBÉM em `Barber.email`/`phone` das fichas deste usuário. |
| POST \| DELETE | `/me/avatar` | OWNER/MANAGER | Upload REAL, multipart, JPG/PNG/WebP até 5 MB, atrás do `StorageAdapter` do agente 25 (pasta `{tenantId}/perfil`). **403 para BARBER** — o desenho do funcionário não tem "Alterar foto". |
| GET | `/me/export` | OWNER/MANAGER/BARBER | LGPD art. 18 IV/V: perfil, vínculos, fichas de barbeiro, sessões abertas (sem token) e a trilha das próprias ações (teto de 500). Sai NA HORA — o protótipo prometia e-mail "em até 48h" para uma consulta de meio segundo. 5/h. |
| POST | `/me/data-deletion-request` | MANAGER/BARBER | Encaminha o pedido ao(s) dono(s) por e-mail + `AuditLog`. **400 para OWNER** — ele tem o botão que exclui de fato. 3/h. |
| POST | `/me/account-deletion` | **OWNER** | Exige `confirm: "EXCLUIR"` por extenso (validado no DTO E no serviço). AGENDA: `purgeAt = +30d`, tenant `CANCELED`, assinatura cancelada no `PAYMENT_ADAPTER`, e-mail com a data. **Não marca `deletedAt`** — é ele que o login e o `TenantGuard` filtram, e marcá-lo trancaria o dono para fora da janela em que deveria poder desistir. 409 `DELETION_ALREADY_SCHEDULED`. 10/h. |
| DELETE | `/me/account-deletion` | **OWNER** | Desiste dentro da janela. Volta a `TRIAL`, não a `ACTIVE`: a assinatura foi cancelada no gateway e não se ressuscita cobrança recorrente por conta própria — reativar é escolher plano em Configurações. 409 `DELETION_NOT_SCHEDULED`. |

### Super Admin (`/api/v1/admin`) — fase 08

`@Roles('SUPER_ADMIN')` + `@TenantOptional()` em todo controller — nenhuma
rota daqui pertence a um tenant, `RolesGuard` deixa passar pelo bypass
`isSuperAdmin` mesmo sem `Membership` nenhum.

| Método | Rota | Observações |
|---|---|---|
| GET \| POST | `/admin/plans` | Lista/cria `SaasPlan`; `POST` rejeita `features` com chave fora de `FEATURE_KEYS` (400). |
| PATCH | `/admin/plans/:id` \| `/:id/archive` | Edita; arquivar não afeta tenants já assinantes. |
| GET | `/admin/tenants` | Busca/paginação + uso agregado (barbeiros, agendamentos do mês) via 2 `groupBy`, sem N+1. |
| GET | `/admin/tenants/:id` | Detalhe com `Membership[]`, plano, métricas. |
| PATCH | `/admin/tenants/:id/suspend` \| `/reactivate` | Suspender bloqueia login de TODOS os `Membership` do tenant na hora (ver decisões). |
| PATCH | `/admin/tenants/:id/plan` | Troca manual de plano — reflete no `FeatureGuard` na PRÓXIMA requisição, sem precisar de novo login. |
| POST | `/admin/tenants/:id/impersonate` | Sessão real de OWNER (sem cookie de refresh), `AuditLog` pesado. 409 se o tenant está suspenso. |
| GET | `/admin/billing/invoices` | Lista `SaasInvoice` paginado. |
| POST | `/admin/billing/run-cycle` | Gera fatura `PENDING` pra cada tenant com `currentPeriodEnd` vencido (gateway mock). |
| POST | `/admin/billing/invoices/:id/approve` \| `/reject` | Aprovar avança o mock em DOIS passos (`CONFIRMED`→`RECEIVED`); recusar soma `failedAttempts` e suspende automaticamente ao atingir `BILLING_MAX_FAILED_ATTEMPTS` (env, padrão 3). |
| GET | `/admin/metrics` | MRR, tenants por plano, novos tenants do mês, churn do mês. |

### Filas e mensagens (`/api/v1/admin`) — fase 09

Mesmas regras do resto do super admin (`SUPER_ADMIN` + `@TenantOptional()`).

| Método | Rota | Observações |
|---|---|---|
| GET | `/admin/queues` | Resumo das 4 filas: contagens por estado e próximo disparo de cada cron. |
| GET | `/admin/queues/:name` | Últimos jobs da fila (padrão 20, teto 100) com o resumo que o processor devolveu. |
| POST | `/admin/queues/:name/run` | Dispara o job agora, fora do cron. `attempts: 1` — rodada manual não fica repetindo sozinha. |
| POST | `/admin/queues/:name/jobs/:jobId/retry` | Reenfileira um job que falhou depois de esgotar as tentativas. 404 se o job não existe. |
| GET | `/admin/outbox` | "Mensagens enviadas" — `NotificationOutbox` + `MailOutbox` unidos, filtro por `kind`/`status`/`tenantId`. Destinatário sai MASCARADO. |

### Dashboard, busca global e sino (`/api/v1`) — fase 13

`@Roles('OWNER','MANAGER','BARBER')` nos três controllers. `BARBER` entra pelo
MESMO endpoint do dono — quem recorta é o `StaffScopeService` (o mesmo da
agenda interna e das comandas), dentro do serviço, nunca uma rota paralela.

| Método | Rota | Observações |
|---|---|---|
| GET | `/dashboard/shell` | Plano, `features` (espelho exato do `FeatureGuard`), dias de teste e unidades — a casca das 14 telas. Cacheada 5 min no front. Funciona com `planId` nulo: `plan: null` + tudo `false`. |
| GET | `/dashboard/overview?period=dia\|semana\|mes` | A tela `/app` inteira numa chamada: KPIs (6), gráfico de faturamento, serviços do mês, ranking da semana, próximos atendimentos e alertas. ~12 agregações em SQL, em paralelo. Padrão `mes`. |
| GET | `/search?q=` | Busca global da topbar (Ctrl+K) — clientes, agendamentos e serviços, 5 por grupo. `q` com menos de 2 caracteres é 400. `BARBER` não recebe a base de clientes. |
| GET | `/notifications` | Sino — pendências do dia DERIVADAS do banco (confirmações/cancelamentos de hoje, contas a vencer, caixa fechado, estoque no mínimo). Não há tabela `Notification`; ver dívidas da fase 13. |
| PATCH | `/staff-agenda/:id/confirm` | Confirma pelo balcão. Nasceu na fase 13 porque o menu ⋯ dos "Próximos atendimentos" oferece "Confirmar" e não havia rota — até então `CONFIRMED` só era alcançável pelo cliente. Idempotente. |

`GET|PATCH /settings/preferences` ganhou `monthlyGoalCents` (nullable) — a meta
mensal que o gráfico do Dashboard desenha como linha tracejada.

## O que a fase 01 entregou

- **Monorepo** pnpm + Turborepo: `apps/api`, `apps/site`, `apps/booking`,
  `apps/dashboard`, `apps/admin`, `packages/config`, `packages/types`,
  `packages/ui`. `Makefile` com `up/down/logs/migrate/seed/reset/test/
  test-isolation` (+ `env`, `install`, `lint`, `typecheck`, `psql`, `sh`).
- **Docker**: `docker-compose.yml` (postgres 16 + redis + api + 4 webs, todos
  com healthcheck) e `docker-compose.prod.yml` com Dockerfile multi-stage por
  app (`apps/*/Dockerfile`) + `Dockerfile.dev` compartilhado.
- **API NestJS**: config validada por Zod no boot, pino com redaction de
  campos sensíveis, `RequestIdInterceptor`, `ValidationPipe` global
  (`whitelist` + `forbidNonWhitelisted`), helmet, CORS por origem explícita,
  `@nestjs/throttler`, filtro global de exceções no contrato
  `{ code, message, details? }`, Swagger.
- **Isolamento**: `TenantGuard` global + `RolesGuard`, decorators
  `@CurrentTenant()`, `@CurrentUser()`, `@Roles()`, `@Public()`,
  `@TenantOptional()`.
- **Prisma**: 41 modelos, migration inicial com a EXCLUDE anti double-booking
  e mais 7 constraints estruturais. Seed com os dados reais do `SPEC.md`.
- **Adapters**: `NotificationAdapter`/`MailAdapter`/`PaymentAdapter` com
  drivers mock completos, ligados por factory em `AdaptersModule`.
- **Frontends**: as 4 apps Next.js 14 App Router no tema de produto, com
  provider do TanStack Query e cliente axios compartilhados em `packages/ui`.

Contas de desenvolvimento criadas pelo seed (senha `BarberVP@2026`):
`admin@barbervp.com.br` (SUPER_ADMIN) · `dono@barbeariacentral.com.br` (OWNER)
· `gerente@barbeariacentral.com.br` (MANAGER) ·
`carlos@barbeariacentral.com.br` (BARBER).

## O que a fase 02 entregou

- **`packages/config/tokens.js`** (+ `.d.ts`): paleta bruta em JS puro, fonte
  única de cor do projeto. `tailwind-preset.js` monta o tema a partir daqui;
  os 4 `app/layout.tsx` importam `@barbervp/config/tokens` para o
  `viewport.themeColor`, então nenhum hex de marca mora fora deste arquivo
  (`@barbervp/config` migrou de `devDependencies` para `dependencies` nas 4
  apps por causa desse import em tempo de build).
- **Preset Tailwind revisado**: cores relidas contra os `.dc.html` (ver
  decisões abaixo), `borderRadius.control` (10px, controles), `boxShadow`
  ampliado (`card`/`sheet`/`modal`/`menu`/`toast`/`gold`),
  `transitionTimingFunction.sheet` (a curva `cubic-bezier(.32,.72,0,1)` das
  sheets), e as 13 keyframes do SPEC com valores conferidos um a um contra o
  bundle (não só os nomes — duração, delay e curva).
- **Ícones** (`packages/ui/src/icons`): ~30 componentes SVG outline portados
  path por path dos `.dc.html` (nav do dashboard, check, chevron, olho
  mostrar/ocultar, cadeado, kebab, busca, spinner) + `EmptyCalendarArt`
  (ilustração de "sem horários" da `MinhaConta`). API com prop `size` (não
  `width`/`height` soltos) — os 2 ícones da fase 01 (`api-status.tsx`,
  `placeholder-screen.tsx`) foram ajustados para o novo contrato.
- **Formulário**: `Button`/`IconButton` (variantes primary/outline/ghost/
  danger + loading/disabled), `Field` (moldura label+erro+hint reaproveitada
  por todos os campos), `Input`, `Textarea`, `Select`, `OtpInput` (6 caixas,
  auto-advance, paste, shake), `PasswordInput` (toggle + força de 4 barras,
  exporta `passwordStrength`/`isPasswordValid`), `Checkbox`/`Radio`/`Switch`.
- **Overlays**: `Modal`/`Drawer` compartilhando um `OverlayRoot` único —
  bottom-sheet < 768px, modal centrado/drawer lateral ≥ 768px, tudo via
  classes `md:` do Tailwind (sem `ResizeObserver`/`window.innerWidth`, ver
  decisão abaixo); hooks reutilizáveis em `lib/use-overlay.ts`
  (`useScrollLock`, `useFocusTrap`, `useEscapeKey`, `useMountTransition`,
  `useIsMounted`). `Toast`/`ToastProvider`/`useToast` (fila, portal, pílula
  única). `SuccessScreen` (círculo dourado + check animado + resumo +
  código).
- **Estrutura e conteúdo**: `Card`/`CardHeader`, `Badge`/`StatusPill` +
  `AppointmentStatusPill` (ligado ao enum real `AppointmentStatus` de
  `@barbervp/types`, não string solta), `Tabs`/`TabPanel` (roláveis no
  mobile, variantes `underline`/`segmented`), `Menu` (kebab acessível),
  `ResponsiveTable` (tabela ≥ `md`, cards com papéis
  `title`/`subtitle`/`meta` < `md`), `EmptyState`, `Skeleton`/
  `SkeletonGroup`, `Avatar` (+ `initialsOf`), `StatCard` (com sparkline
  SVG).
- **Agenda**: `DayPill`/`DatePicker` (chips de dia, ponto de "sem vagas"),
  `TimeChip`/`TimeSlotGrid` (grade por período + esqueleto de carregamento).
- **`AppShell`**: sidebar fixa colapsável ≥ `lg`, drawer sobreposto < `lg`
  com foco preso/scroll lock/ESC, topbar com busca e ações.
- **Playground**: rota `/playground` em `apps/dashboard` (não Storybook —
  ver decisão abaixo) com todos os primitives, mais `/playground/shell` para
  o `AppShell` (que precisa da viewport inteira). Alterna 360/768/1440px
  recarregando a mesma rota dentro de um `<iframe>` daquela largura exata
  (`?frame=1`), não `transform: scale`.

## O que a fase 03 entregou

- **Modelos novos** (`migration 20260815120000_auth_tenancy`): `AuthSession`
  (refresh rotativo, com família), `OtpCode` (código do cliente + cadastro
  pendente + token de troca), `PasswordResetToken` (link por e-mail do painel).
  Enums `TokenAudience`, `OtpPurpose`, `OtpChannel`. Campos novos:
  `Client.userId`/`email @unique`/`emailVerifiedAt`/`lastLoginAt`,
  `TenantSettings.address*` (endereço estruturado) + `onboardingStep`/
  `onboardingDoneAt`. `NotificationOutbox.tenantId` virou nullable.
  3 CHECK à mão: `auth_session_subject`, `otp_attempts_within_max`,
  `onboarding_step_bounds`.
- **Auth de estabelecimento**: registro (transação única), vínculo de conta de
  cliente, login, refresh rotativo com detecção de reuso, logout, `/me`,
  seletor de contexto, troca e recuperação de senha.
- **Auth do cliente**: login por telefone ou e-mail, registro com OTP, reenvio
  com cooldown, "receber por chamada" (stub), recuperação pelo mesmo desafio.
- **RBAC real**: `JwtAuthGuard` global **antes** do `TenantGuard` na cadeia de
  `APP_GUARD` — é ele quem preenche `request.principal`, de onde o tenant sai.
  `AuthPrincipal` ganhou `activeTenantId`, `audience` e `sessionId`.
- **Onboarding**: os 6 passos, retomáveis, + proxy de CEP com cache.
- **`AuditLog`** em login, login falho, logout, troca/recuperação de senha,
  reuso de sessão, criação e vínculo de tenant, troca de contexto, alterações
  de `TenantSettings` e conclusão do onboarding (`AuditAction` em
  `src/audit/audit.service.ts`).
- **`packages/types`**: `auth.ts` e `onboarding.ts` — as regras que precisam dar
  o MESMO resultado nos dois lados (senha, telefone, slug, e-mail) e os
  contratos de resposta. O `PasswordInput` de `packages/ui` passou a reexportar
  `isPasswordValid`/`passwordStrength` daqui em vez de ter cópia própria.
- **`packages/ui/src/auth/`**: `EstablishmentAuthProvider`/`ClientAuthProvider`
  (token em memória + refresh silencioso no mount), `auth-api.ts` tipado,
  `RequireEstablishmentAuth`, máscaras de digitação.
- **Frontends**: `apps/site` com `/entrar`, `/cadastro` (incluindo o card de
  vínculo) e `/recuperar-senha`; `apps/dashboard` com `/configurar` (wizard de
  6 passos) e `/selecionar-barbearia`; `apps/booking` com o `ClienteAuth` como
  sheet reutilizável; `middleware.ts` nas 4 apps.
- **Testes**: 34 unitários, 28 e2e (`test/auth.e2e-spec.ts`) e 11 de isolamento
  (`test/isolation/auth-tenancy.isolation-spec.ts`, com app real e token real).
- **Dependências novas**: `@nestjs/jwt` + `cookie-parser` na API;
  `react-hook-form` + `@hookform/resolvers` + `zod` nas 4 apps web.

## O que a fase 04 entregou

- **Modelos novos** (`migration 20260816000000_booking_public`):
  `ServiceComboPart` (composição dos combos), `AppointmentService` (seleção
  múltipla do wizard, com preço e duração fotografados na reserva), `Review`
  (as avaliações da página pública). Campos novos: `Appointment.bookingCode`
  (`@@unique([tenantId, bookingCode])`), `NotificationOutbox.scheduledFor`,
  `TenantSettings.slotIntervalMin`/`lembrete1Horas`/`lembrete2Horas`. Valor novo
  no enum `OtpPurpose`: `GUEST_BOOKING`. 6 CHECK à mão
  (`tenant_settings_slot_interval_bounds`, `tenant_settings_reminder_bounds`,
  `service_combo_part_not_self`, `service_combo_part_quantity_positive`,
  `appointment_service_price_non_negative`, `appointment_service_duration_positive`,
  `review_rating_bounds`). A migration faz backfill: toda linha antiga de
  `Appointment` ganhou a sua `AppointmentService` e um `bookingCode`.
- **`common/utils/timezone.ts`** — conversão relógio-de-parede ↔ instante via
  `Intl`, sem dependência nova. **Resolve a dívida da fase 01** do offset fixo
  de -3h: o offset passa a ser perguntado data a data, então horário de verão
  volta a funcionar sozinho (coberto por teste com `America/New_York`).
- **Motor de disponibilidade** (`availability.service.ts`): cruza
  `TenantBusinessHour` + `WorkSchedule` (com almoço) + `ScheduleException`
  (do barbeiro e da casa) + agendamentos ativos + duração somada da seleção +
  `slotIntervalMin` + `antecedenciaMinima`, no fuso do tenant. Devolve os 14
  dias com contagem de vagas (para o ponto de "sem vagas" do chip), os horários
  do dia escolhido já com o período (MANHÃ/TARDE/NOITE) e o próximo dia livre.
- **Catálogo** (`catalog.service.ts`): combo automático e compatibilidade
  barbeiro↔serviço, com o motivo textual de cada bloqueio.
- **Agendamento** (`appointments.service.ts`): criação por cliente logado ou
  visitante, cancelamento e remarcação pelo código da reserva, débito atômico de
  assinatura, `ClientProfile` sincronizado na escrita, e a EXCLUDE
  `no_double_booking` traduzida em `409 DOUBLE_BOOKING` com texto de gente.
- **OTP condicional do guest booking** (`guest-risk.service.ts`) — ver decisão.
- **Notificações** (`booking-notifications.service.ts`): confirmação imediata +
  dois lembretes agendados, saindo pelo `NotificationAdapter` com os templates
  de `WhatsappAutomationConfig`. Cancelar ou remarcar derruba o lembrete velho.
- **`packages/types/src/booking.ts`**: contratos da página, da grade, da cotação
  e do agendamento, mais as regras que os dois lados precisam compartilhar
  (faixa do dia, `formatDuration`, limiar de "últimos horários").
- **`apps/booking`**: rota `/{slug}` (componente de servidor, com metadata
  dinâmica e JSON-LD de `HairSalon`), `not-found` e `loading` próprios, a página
  pública inteira e o wizard de 4 passos com estados de carregando, vazio, 409 e
  sucesso (com `.ics` e compartilhamento).
- **Seed**: composição do combo Corte + Barba, 5 avaliações do protótipo,
  `bookingCode` determinístico (`AG-S0001`…) e `AppointmentService` em todo
  agendamento semeado.
- **Testes**: 65 unitários (9 novos de timezone, 7 de risco do visitante, 15 de
  janela/combo/código/template), 60 e2e (`test/booking.e2e-spec.ts` com 32
  casos, incluindo a corrida de slot) e 21 de isolamento
  (`test/isolation/booking.isolation-spec.ts`, 9 casos novos).
- **Sem dependência nova** — nem no backend nem no frontend.

## O que a fase 05 entregou

- **Modelos** (`migration 20260816120000_client_area`): `Client.consentVersion`
  (LGPD versionado) + `notifyWhatsapp`/`notifyEmail` (preferências de canal,
  separadas do consentimento — a `MinhaConta` do protótipo já mantinha
  "Notificações" longe de "Segurança"); `Review.appointmentId` (`@unique`,
  liga a nota ao atendimento específico — sem isso não dava para saber o que
  já foi avaliado). Valor novo em `OtpPurpose`: `CLIENT_PHONE_CHANGE`.
  `ClientPlan`/`ClientSubscription`/`SubscriptionUsage` já existiam desde a
  fase 01/04; esta fase só liga a ESCRITA (assinar/pausar/reativar/cancelar/
  renovar) — a leitura de cobertura e o débito atômico já eram da fase 04
  (`SubscriptionCoverageService`, inalterado).
- **`auth/client-auth.service.ts` ganhou "Meus dados" e LGPD**: `updateProfile`,
  `requestPhoneChange`/`confirmPhoneChange` (OTP, mesmo desafio do registro),
  `changePassword`, `exportData`, `requestDeletion` — endpoints em
  `client-auth.controller.ts` (ver tabela acima).
- **Módulo novo `client-account`** (`apps/api/src/client-account/`):
  - `ClientAppointmentsService` — lista Próximos/Histórico do cliente NESTA
    barbearia e grava a avaliação; reusa `isWithinChangeWindow` do
    `booking/appointments.service.ts` (função pura exportada, não o serviço
    inteiro — o módulo não depende do `BookingModule`).
  - `ClientSubscriptionService` — vitrine de planos (com economia calculada),
    assinar (cobra via `PAYMENT_ADAPTER`, cria `ClientSubscription` +
    `SubscriptionUsage` zerado em transação), pausar, reativar, cancelar,
    `renewCycle` (cobra de novo e abre período novo — chamado tanto pelo job
    quanto por `resume` quando o ciclo pausado já venceu).
  - `SubscriptionRenewalService.runOnce()` — a "lógica de renovação testável
    isoladamente" do SPEC; sem BullMQ real ainda (mesma dívida do lembrete de
    agendamento da fase 04), mas pronta para o `@Cron`/worker da fase 09
    chamar sem mudar uma linha.
- **`packages/types/src/client-account.ts`** (novo): contratos de
  `MinhaConta`/`AssinaturaCliente`. `auth.ts` ganhou `CURRENT_TERMS_VERSION`
  e `AuthClient.notifyWhatsapp`/`notifyEmail`.
- **`apps/booking`**: `components/minha-conta/` (sheet com as 3 abas reais —
  Agendamentos com sub-abas Próximos/Histórico e avaliação por estrelas,
  Assinatura condicionada ao gate, Meus dados com edição campo a campo, troca
  de telefone com OTP embutido, senha, notificações, exportar dados,
  excluir conta) e `components/assinatura-cliente/` (detalhe → pagamento →
  sucesso, reaproveitável dos dois pontos de entrada: vitrine da página
  pública e aba "Assinatura" sem plano). `RescheduleDialog` novo — reusa
  `DatePicker`/`TimeSlotGrid` do design system fora do wizard. O selo
  "Incluído na assinatura" do wizard **já existia desde a fase 04**
  (`step-services.tsx` já lia `coveredBySubscription` da cotação); esta fase
  só fez esse selo passar a refletir uma assinatura de verdade.
- **Testes**: 15 unitários novos (débito atômico e ciclo de vida da
  assinatura com Prisma/`PaymentAdapter` mockados, renovação em lote, regras
  de avaliação), 18 e2e (`test/client-account.e2e-spec.ts` — inclui o caso
  central do critério de aceite: três reservas do MESMO serviço disparadas
  juntas contra uma quota de 2 debitam no máximo 2, nunca 3) e 4 de
  isolamento (`test/isolation/client-account.isolation-spec.ts` — um cliente
  global com histórico em duas barbearias, provando que `MinhaConta` aberta
  pelo slug A nunca mostra assinatura/agendamento do slug B; a exportação
  LGPD, ao contrário, é global de propósito — ver decisão). Total do projeto:
  80 unit + 78 e2e + 25 isolamento, todos verdes.
- **Sem dependência nova** — nem no backend nem no frontend.

## O que a fase 06 entregou

- **Modelos** (`migration 20260816150000_staff_management`, escrita à mão pelo
  mesmo motivo de sempre — o diff bruto mexe na coluna GERADA
  `Appointment.timeRange`): `ClientProfile.favoriteBarberId` (barbeiro
  favorito da tela Clientes) e `StaffInvite` (convite de funcionário — e-mail,
  telefone, `serviceIds`/`workDays` pré-marcados, `tokenHash` no MESMO padrão
  HMAC do `PasswordResetToken`, ciclo `PENDING → ACCEPTED/EXPIRED/REVOKED`).
  Todo o resto do schema desta fase (`Barber`, `Service`, `Product`,
  `WorkSchedule`, `ScheduleException`, `BarberService`) **já existia desde a
  fase 01** — esta fase só escreveu os endpoints em cima.
- **Módulos novos** (`apps/api/src/`): `clients/` (CRUD de `ClientProfile`),
  `catalog-admin/` (CRUD de `Service`/`Product` — nome separado de
  `booking/catalog.service.ts`, que é o motor de leitura pública, para não
  misturar escrita administrativa com o caminho quente do booking),
  `team/` (`BarbersService` — CRUD + escala + exceções; `InvitesService` —
  convite/reenvio/revogação/preview/aceite; `PlanLimitsService` — gate de
  `maxBarbeiros` server-side, `null` durante TRIAL porque a contratação de
  plano é fase 07/08), `staff-agenda/` (`StaffAppointmentsService` reusando
  literalmente `AvailabilityService`/`CatalogService`/
  `SubscriptionCoverageService` do `BookingModule`; `StaffScopeService`
  resolve o recorte do papel `BARBER`).
- **`EstablishmentAuthService` ganhou `issueSessionForUser`** (método
  público de 3 linhas em cima do `issueForUser` privado que já existia) —
  o aceite de convite de equipe emite sessão pelo MESMO caminho do
  login/registro, sem duplicar a lógica de `roles`/claims. `AuthModule` passou
  a exportar `EstablishmentAuthService` e `RefreshCookieService` por isso.
- **`packages/types/src/management.ts`** (novo): todos os contratos da
  operação diária — `ClientListItem`, `ServiceListItem`/`ProductListItem`,
  `BarberListItem`/`WorkScheduleDay`/`ScheduleExceptionItem`,
  `StaffInviteListItem`/`StaffInvitePreview`, `StaffAgendaResponse`/
  `StaffAppointmentItem`. `enums.ts` ganhou `StaffInviteStatus`.
- **`apps/dashboard`**: `DashboardChrome` (novo) — casca comum ao `Dashboard`
  e ao `DashboardFuncionario`; **mesmo componente, mesma rota**, só o `nav`
  muda por papel (`lib/nav.ts` → `navForRole`). Rotas novas: `/agenda`
  (dia/semana, colunas por barbeiro, walk-in, mover/cancelar), `/clientes`
  (busca + paginação + drawer de notas/favorito/bloqueio), `/servicos-produtos`
  (abas Serviços/Produtos, CRUD em modal), `/equipe` (grid do time, escala
  semanal, convites pendentes), `/aceitar-convite` (pública, fora do
  `DashboardGuard` — e-mail travado do convite, senha nova, já entra logado).
  `/` virou o resumo real (hoje: agendamentos, faturamento previsto, estoque
  baixo, próximos horários) — antes era o `PlaceholderScreen`.
- **Simplificação assumida no modal de novo agendamento**: o horário digitado
  é interpretado no fuso do NAVEGADOR (`new Date(`${data}T${hora}`)`), não no
  fuso IANA do tenant que a API devolve. Correto sempre que quem opera o
  dashboard está fisicamente na barbearia (o caso real); ver dívida abaixo
  para o caso de operação remota.
- **Testes**: os 80 unitários e 78 e2e das fases anteriores continuam verdes
  (nada quebrou). Isolamento ganhou `test/isolation/dashboard-operation.
  isolation-spec.ts` — 11 casos novos: tenant (Clientes/Serviços/Barbeiros/
  convites de A nunca aparecem em B; mover/cancelar agendamento de B com
  token de A → 404) e papel (`BARBER` toma 403 em Clientes/Serviços/Produtos/
  Equipe/Convites; a agenda pedida por `BARBER` só mostra a própria coluna
  mesmo pedindo `barberId` de outro; criar/mover/cancelar na agenda de outro
  barbeiro → 403; criar na própria agenda funciona). Total do projeto: 80
  unit + 78 e2e + 36 isolamento, todos verdes.
- **Sem dependência nova.**

## O que a fase 07 entregou

- **Quase todo o modelo de dados desta fase já existia desde a migration
  inicial da fase 01** (`Order`/`OrderItem`/`Payment`, `CommissionRule`/
  `Tier`/`Entry`, `Vale`, `CashRegister`/`CashMovement`, `BankAccount`,
  `AccountPayable`/`Receivable`, `LoyaltyProgram`/`Points`/`Raffle`, `Unit`,
  `WhatsappAutomationConfig`) — o trabalho real desta fase foi escrever a
  CAMADA DE API por cima do que já estava modelado e semeado, não desenhar
  schema novo. `migration 20260817000000_dashboard_ii` (escrita à mão, mesmo
  motivo de sempre) só acrescentou o que faltava: `SaasInvoice` (histórico de
  faturas do plano SaaS), `TenantPhoto` (galeria de "Minha Página"),
  `AiChatMessage` (histórico + contagem de uso do Assistente IA),
  `TenantSettings.showPhotos`/`showBusinessHours`/`bloquearFaltasAtivo`,
  `BankAccount.type`/`acceptedMethods`, `Order.guestName` (walk-in sem
  agendamento).
- **`FeatureGuard` + `@RequireFeature()`** (`common/guards/feature.guard.ts`,
  `common/decorators/require-feature.decorator.ts`) — gate de plano SaaS
  agora é UM guard global (`APP_GUARD`, depois de `TenantGuard`/`RolesGuard`),
  não checagem ad hoc por serviço. Lê `SaasPlan.features` do tenant ativo e
  devolve 403 `FEATURE_NOT_IN_PLAN`; `SUPER_ADMIN` atravessa.
- **Módulos novos** (`apps/api/src/`):
  - `pos/` (`OrdersService`) — Comandas. Abrir (cliente cadastrado, walk-in,
    ou vinculado a um `Appointment`), itens de serviço/produto, desconto
    (percentual/fixo), resgate de pontos, **fechamento em transação única**
    (ver decisões abaixo), reabertura só `MANAGER+` auditada.
  - `commissions/` (`CommissionsService` + `CommissionCalcService`) — regras
    `FIXED`/`TIERED`, extrato por período, "fechar período", vales.
    `CommissionCalcService` é exportado do módulo porque o fechamento de
    comanda precisa gravar `CommissionEntry` DENTRO da própria transação —
    não dá pra chamar endpoint HTTP de dentro de outra transação.
  - `finance/` — caixa (abrir/fechar com conferência), contas a pagar/
    receber, contas bancárias, fluxo de caixa mensal agregado.
  - `loyalty/` — programa de pontos, saldo por cliente, sorteios (criar +
    sortear, ponderado por cupom), planos de assinatura administrados pela
    barbearia (reusa `ClientPlan`/`ClientSubscription`/`SubscriptionUsage` da
    fase 01/05, só adiciona a escrita do lado da barbearia).
  - `whatsapp-config/` — CRUD do `WhatsappAutomationConfig`.
  - `assistant/` — chat do "Navalha" atrás de `AI_ASSISTANT_ADAPTER` (mock,
    mesmo padrão de `NotificationAdapter`/`PaymentAdapter`; novo driver mock +
    binding em `AdaptersModule` + `AI_ASSISTANT_DRIVER` no `envSchema`).
  - `reports/` — `summary` (todo plano) + `advanced` (`relatoriosAvancados`,
    rota DISTINTA de propósito) com SQL agregado (`$queryRaw` com `JOIN`/
    `GROUP BY`, sem N+1) para faturamento por barbeiro/serviço/dia, ocupação,
    no-show e taxa de retorno.
  - `settings/` (`SettingsService` + `MyPageService`) — barbearia, unidades
    (`multiUnidades`), plano + troca + faturas, preferências, calculadora de
    preço (`calculadoraPreco`), Minha Página + galeria de fotos.
- **`packages/types`**: `pos.ts`, `finance.ts` (+ `ACCOUNT_PAYABLE_CATEGORIES`/
  `ACCOUNT_RECEIVABLE_CATEGORIES` — as categorias REAIS do bundle, não as que
  a fase 01 tinha inventado no seed, ver decisão), `commissions.ts`,
  `loyalty.ts`, `whatsapp-config.ts`, `reports.ts`, `settings.ts`,
  `assistant.ts` (+ `AI_MESSAGE_LIMIT_BY_TIER`).
- **`seed-data.ts`/`seed.ts`**: `CATEGORIAS_PAGAR`/`CATEGORIAS_RECEBER` e as
  linhas de `ACCOUNTS_PAYABLE`/`ACCOUNTS_RECEIVABLE`/`BANK_ACCOUNTS` agora são
  as REAIS de `CONTAS_PAGAR_DATA`/`CONTAS_RECEBER_DATA`/
  `CONTAS_BANCARIAS_DATA` do `Dashboard.dc.html` (regra 2 nomeia
  `CONTAS_PAGAR_DATA` explicitamente — as datas do bundle viram deslocamento
  relativo ao dia do seed, pra nunca "nascerem vencidas"). `SaasInvoice`
  seedado (4 faturas pagas retroativas). `CommissionEntry` do seed agora linka
  `orderItemId` (o extrato mostra o nome do serviço, não mais "—") e usa o mês
  de competência real do fechamento.
- **Testes novos**: `test/dashboard-ii.e2e-spec.ts` (fechamento "tudo ou
  nada" — pagamento que não bate não fecha nada; ciclo completo comanda →
  fechamento → baixa de estoque → `CommissionEntry` → pontos de fidelidade →
  "fechar período" → `/reports/summary`, com os valores conferidos um a um;
  reabertura só `MANAGER+`, auditada) e
  `test/isolation/dashboard-ii.isolation-spec.ts` (16 casos — os 403 de
  feature flag do critério de aceite, um tenant Essencial e um Profissional
  de verdade, mais isolamento de tenant em `/orders`). Total do projeto: 80
  unit (1 é probabilístico — colisão rara de `bookingCode` em 2000 sorteios,
  ver dívidas) + 81 e2e + 52 isolamento, todos verdes na última rodada.
- **Dependência nova**: nenhuma (o Assistente IA usa só o padrão de
  adapter já existente).

### Front-end (9 telas, `apps/dashboard`)

- **`lib/api/`**: um arquivo de hooks TanStack Query por domínio —
  `pos.ts`, `finance.ts`, `commissions.ts`, `loyalty.ts`, `whatsapp.ts`,
  `assistant.ts`, `reports.ts`, `settings.ts`, `my-page.ts` — mesmo padrão
  de `catalog.ts`/`agenda.ts`/`clients.ts` da fase 06 (query key por
  domínio, `invalidateQueries` no `onSuccess` da mutation).
- **Comandas (POS)** (`app/comandas/`, `components/pos/`): lista Abertas/
  Fechadas → abrir comanda (cliente cadastrado ou walk-in, mesmo padrão do
  "Novo agendamento") → `PosWorkspace` com catálogo + comanda em
  `lg:grid-cols-[1fr_380px]`. `ComandaContent`/`ComandaFooter` são
  DELIBERADAMENTE dois componentes separados: o rodapé (subtotal/desconto/
  total/"Fechar comanda") nunca fica dentro da área que rola — no desktop é
  um bloco `shrink-0` fixo no `Card`, no mobile é o `footer` do `Modal`
  (que já é bottom-sheet nativo abaixo de 768px). É o "subtotal sempre
  visível" do critério de aceite, verificado pela ESTRUTURA do layout
  (`overflow-y-auto` só no conteúdo, nunca envolvendo o rodapé), não por
  captura de tela — ver dívida sobre verificação visual.
- **Financeiro** (`app/financeiro/`, `components/dashboard/finance/`):
  reconstruído na fase 18. A página é só a moldura — barra de 6 sub-abas em
  pill group com cadeado nas travadas — e cada sub-aba é um componente que faz
  as PRÓPRIAS consultas (`cash-tab`, `accounts-tab`, `vales-tab`,
  `bank-accounts-tab`, `cash-flow-tab`). Sem isso, abrir "Caixa" dispararia as
  cinco consultas das outras. `CashFlowChart` é SVG puro com barras (entradas ×
  saídas) e a linha do acumulado por cima, em ESCALAS separadas: acumulado é
  estoque, fluxo é vazão — na mesma escala uma das séries vira reta no eixo.
- **Comissões** (`app/comissoes/`): reconstruída na fase 19. Faixa de recorte
  (`Segmented` Semanal/Mensal + stepper `‹ ›`), 3 KPIs e a tabela de 9 colunas
  com o extrato abrindo por barbeiro. `RuleModal` e `PdfModal` vivem em
  `components/dashboard/commissions/`; rótulos e recortes de data em
  `commissions-shared.ts`. "Fechar período" segue com `confirm()` nativo — é
  uma ação que TRAVA o cálculo do mês, e a fricção é bem-vinda.
- **Fidelidade** (`app/fidelidade/`): Pontos/Sorteios/Assinaturas.
  Assinaturas usa `FeatureLocked` (Avançado).
- **WhatsApp**: card por automação, `Switch` + template editável;
  automações avançadas mostram cadeado e abrem `UpgradeModal` se o toggle
  vier 403.
- **Assistente IA**: chat simples com contador "X/limite mensagens este
  mês", input desabilitado ao bater o limite.
- **Relatórios**: `summary` sempre visível (StatCards + barra de forma de
  pagamento); `advanced` atrás de `FeatureLocked`.
- **Configurações** (`app/configuracoes/`): 5 sub-abas — Barbearia (dados +
  horário de funcionamento editável), Unidades (`FeatureLocked`,
  Avançado), Plano (cards comparativos + trocar + faturas), Preferências,
  **Calculadora de preço** (`FeatureLocked`, Avançado). A calculadora mora
  aqui e NÃO em Serviços & Produtos — ver decisão técnica.
- **Minha Página**: link público + copiar, slug editável, sobre, 4 toggles
  reais (serviços/avaliações/fotos/horário), galeria de fotos (URL simples,
  sem upload).
- **`components/feature-locked.tsx` + `components/upgrade-modal.tsx`**: o
  padrão `openUpgradeModal` do protótipo, novo nesta fase (nenhuma tela
  anterior precisava) — ver decisão técnica sobre como ele detecta o gate.
- **`lib/nav.ts`**: as 9 rotas desta fase viraram `ready: true` — as 13
  rotas de fases 06+07 do dashboard estão todas clicáveis, só falta o
  Super Admin (fase 08, app separado).
- **Verificação**: `tsc --noEmit` e `eslint` limpos em TODO `apps/dashboard`
  (não só os arquivos novos), as 9 rotas responderam 200 sem erro no log do
  `next dev`. **Sem captura de tela** — mesmo padrão de verificação da fase
  06 (ver dívida "verificação visual" abaixo).

## O que a fase 08 entregou

- **Sem `.dc.html` de referência nesta fase** — fidelidade foi ao design
  SYSTEM (`packages/ui`: `AppShell`, `Drawer`, `ResponsiveTable`, `Card`,
  `StatCard`, `Badge`, `Tabs`), não a um layout de protótipo específico. As 4
  telas (`/tenants`, `/planos`, `/billing`, `/metricas`) seguem a mesma
  gramática visual das telas de `apps/dashboard`.
- **Schema**: `TenantSubscription.failedAttempts Int @default(0)` (contador
  de recusa de cobrança pro auto-suspend) e `SaasInvoice.externalId
  String?` (referência ao `PAYMENT_ADAPTER` mock). Migration à mão
  `20260818000000_super_admin`, mesmo motivo de sempre (auto-diff quebra a
  coluna gerada `Appointment.timeRange`).
- **`packages/types/src/admin.ts`** (novo): todos os contratos do super
  admin — `AdminPlanItem`, `AdminTenantListItem`/`Detail`, `ImpersonateResultDto`,
  `AdminInvoiceItem`, `AdminMetricsResponse`, etc.
- **`TENANT_SUSPENDED`** — código de erro novo (`packages/types/src/errors.ts`)
  e `ApiException.tenantSuspended()`. Enforçado em TRÊS pontos, porque
  suspender precisa bloquear tanto quem ainda não tem token quanto quem já
  tem um válido: `EstablishmentAuthService.pickTenant()` (login novo, com ou
  sem `tenantId` explícito), `.switchContext()` (troca de contexto de quem já
  está logado em outra barbearia do mesmo usuário) e `TenantGuard.resolveTenant()`
  (token JÁ emitido antes da suspensão — backstop pra sessão não sobreviver
  até expirar sozinha).
- **Módulo novo** (`apps/api/src/admin/`): `plans/`, `tenants/`, `billing/`,
  `metrics/` — cada um com seu `.service.ts`/`.controller.ts`, registrados em
  `admin.module.ts` (importa `AuthModule` só por causa de
  `EstablishmentAuthService`, reusado pela impersonação).
- **Impersonação reusa `EstablishmentAuthService.issueSessionForUser()`** —
  o MESMO método que a fase 06 já usa pra logar o convite de funcionário
  aceito direto. Devolve `{ session, refreshToken, refreshExpiresAt }`; a
  impersonação expõe só `session` (que carrega o `accessToken` de vida
  curta) e DESCARTA `refreshToken` deliberadamente — sessão de impersonação
  nunca deveria sobreviver a um refresh, só ao tempo do token.
- **Hand-off entre origens** (`apps/admin` :3003 → `apps/dashboard` :3002,
  sem cookie compartilhado): query string pro que não é sensível
  (`?tenant=&slug=`) + FRAGMENTO da URL (`#token=`) pro `accessToken` — nunca
  vai pra log de servidor nem `Referer`. `apps/dashboard/app/impersonar/page.tsx`
  lê o fragmento no client, chama `/auth/me` com um `createApiClient()`
  AVULSO (não o client do provider — evitar corrida com o refresh silencioso
  que o `EstablishmentAuthProvider` já dispara ao montar) e só então `adopt()`
  a sessão.
- **Banner de impersonação é estado de UI, não semântica do JWT** — o token
  emitido é IDÊNTICO ao de um login normal de OWNER (deliberado: nenhuma
  rota do dashboard precisa saber que está impersonando). O "estou
  impersonando" mora só em `sessionStorage` (`apps/dashboard/lib/
  impersonation.ts`), lido por `components/impersonation-banner.tsx` — barra
  fixa com "Sair da impersonação" (desloga + redireciona pro admin).
- **`AuditService`**: 9 ações novas (`ADMIN_PLAN_UPSERTED/ARCHIVED`,
  `ADMIN_TENANT_SUSPENDED/REACTIVATED/PLAN_CHANGED/IMPERSONATED`,
  `ADMIN_BILLING_CYCLE_RUN/INVOICE_APPROVED/REJECTED`). Impersonar grava
  `targetOwnerUserId`/`targetOwnerName` no `metadata`.
- **`site` (`apps/site`) ganha o desvio de login**: `login-form.tsx`, depois
  do `adopt(session)`, checa `session.user.isSuperAdmin` e redireciona pra
  `NEXT_PUBLIC_ADMIN_URL` — super admin nunca vê o painel de uma barbearia
  pelo fluxo de login normal.
- **Front-end** (`apps/admin`, novo app Next.js): `admin-guard.tsx` (checa
  `isSuperAdmin`, não reusa `RequireEstablishmentAuth` do dashboard porque a
  regra é outra), `admin-shell.tsx` (nav Tenants/Planos/Billing/Métricas),
  `lib/api/{plans,tenants,billing,metrics}.ts` (TanStack Query, mesmo padrão
  de `apps/dashboard`), `tenant-detail-drawer.tsx` (suspender/reativar/trocar
  plano/impersonar num só `Drawer`), `plan-modal.tsx` (checkbox por
  `FEATURE_KEYS`, tier, `maxBarbers`/ilimitado). `/` redireciona pra
  `/tenants` — sem visão geral própria.
- **Testes novos**: `test/admin.e2e-spec.ts` (8 casos — acesso só
  `SUPER_ADMIN`, troca de plano refletindo em `FeatureGuard` na hora,
  suspender bloqueia login de TODOS os `Membership`, impersonar gera
  identidade real de OWNER sem cookie + `AuditLog`, não impersona tenant
  suspenso, CRUD de plano rejeita feature desconhecida, recusar cobrança 3x
  suspende automaticamente, aprovar reseta `failedAttempts` e avança o
  período). Total do projeto: 80 unit + 91 e2e + 52 isolamento, todos verdes.
- **Verificação ao vivo desta fase** (além dos testes automatizados): com
  `db`+`redis`+`api`+`admin`+`dashboard` de pé, confirmado por `curl` —
  login super admin, as 4 rotas do admin respondendo 200, troca de plano
  derrubando `GET /commissions/rules` de 200 pra 403 na hora (e voltando ao
  restaurar o plano), suspender tenant derrubando login do OWNER com
  `TENANT_SUSPENDED` (403) e reativar devolvendo o acesso, impersonar
  devolvendo token que resolve em `/auth/me` como o OWNER de verdade. Banco
  reseedado ao final.

## O que o agente 30 (configuração inicial obrigatória) entregou

Alvo: o wizard `/app/configurar`, nascido na fase 03 e nunca auditado desde
então. A fase parte de uma regra de produto — **concluir a configuração inicial
é obrigatória para acessar o painel** — e de quatro problemas que o dono trouxe
do navegador em 2026-09-03.

### Bloco A — Obrigatoriedade: nos DOIS lados ✅

1. **Cliente — já estava certo, e foi conferido.** Toda rota de
   `(dashboard)/app/*` monta `DashboardChrome`, que monta o `DashboardGuard`:
   `/app/agenda`, `/app/clientes` e `/app/configuracoes` digitadas na barra
   caem no wizard, conferido no navegador. As únicas rotas que passam com
   onboarding pendente são as que não pertencem ao painel — `/app/configurar`,
   `/app/selecionar-barbearia`, `/app/aceitar-convite`, `/app/impersonar` — mais
   o `/app/playground`, que é a galeria de componentes da fase 02, não tela de
   produto.

   O que estava errado era **o que acontecia durante o redirect**: o guard
   decidia num `useEffect` e devolvia `children` no MESMO passo, então a tela do
   painel chegava a montar e a disparar requisições antes de a navegação
   acontecer. Agora o guard não renderiza o filho enquanto o destino não é
   "ficar".

2. **Servidor — a barreira que não existia.** `POST /onboarding/complete`
   marcava `onboardingDoneAt` sem conferir nada. Agora recusa com 409
   `ONBOARDING_INCOMPLETE` (`details.missingSteps`) enquanto faltar passo
   obrigatório, e a verificação olha o **dado gravado**, não o contador
   `onboardingStep` — "Pular etapa" o faz subir sem salvar, e confiar nele
   deixaria passar o caso exato que a verificação existe para pegar.

   Os obrigatórios são 1 (nome + telefone), 2 (rua, número, cidade, UF), 4 (ao
   menos um serviço ativo) e 6 (ao menos um dia de expediente) — o complemento
   de `SKIPPABLE_STEPS`, que segue `[3, 5]`. Na prática o cadastro já satisfaz o
   1 e o 6 (o registro grava nome, telefone e `DEFAULT_BUSINESS_HOURS`), então a
   recusa real é sobre 2 e 4 — que é justamente o que falta a quem tentaria
   pular o wizard.

3. **`BARBER` num tenant pendente — tela de espera honesta.** O guard manda
   TODO membro de um tenant pendente para `/app/configurar`, e o wizard é
   `@Roles('OWNER','MANAGER')`: um barbeiro convidado antes de o dono terminar
   caía numa tela que fazia `GET /onboarding`, tomava 403 e mostrava "Não foi
   possível carregar o wizard" — um erro técnico para uma situação que não tem
   nada de errado. `OnboardingEntry` bifurca ANTES de qualquer requisição:
   `TenantSetupPending` diz que a barbearia ainda está sendo configurada pelo
   responsável e oferece a única ação possível, "Sair".

4. **O wizard não reabre depois de concluído.** Reabria: quem digitasse
   `/app/configurar` com tudo pronto voltava à tela de conclusão. O guard agora
   devolve ao painel — mas **olhando o estado de ENTRADA**, não o de agora.
   Sem essa distinção, o `refresh()` do fim do passo 6 arrancaria o dono da
   tela onde está o link público que ele veio buscar.

   A decisão do guard virou `resolveGuardAction`, função PURA em
   `packages/ui/src/auth/require-auth.tsx` — a suíte de frontend roda em `node`,
   sem DOM, e regra de produto sem teste é regra que volta a quebrar.

### Bloco B — Passo 0: fora o "Pular e explorar o painel" ✅

O link navegava para `/app`, que o guard devolvia para `/app/configurar`:
girava em falso. Removido, com o `Link` que só ele usava.

O subtítulo dizia **"Você pode pausar a qualquer momento"**, que deixou de ser
verdade. O que continua verdade — e é o que tira a ansiedade de quem está
começando — é que o progresso mora no banco por passo (fase 03): *"Se fechar o
navegador, você retoma de onde parou."*

**O vocativo.** O título mostrava `rafael`, minúsculo, e o enunciado supunha que
viesse do e-mail. **Não vinha:** `User.name` é sempre o que a pessoa digitou no
cadastro (`RegisterEstablishmentDto.name`, mínimo 3 caracteres), e a conta em
questão tem `name = "rafael vetrano"` — conferido no banco. O que existia era
`.split(' ')[0]` cru. Agora `greetingName` (em `onboarding.service.ts`) devolve
o primeiro nome com a inicial em maiúscula e **vazio** — sem vocativo — quando o
nome não é de gente: contém `@`, é igual ao pedaço local do e-mail, ou não tem
letra nenhuma. O contrato renomeou `ownerFirstName` → `ownerGreetingName`, para
o nome do campo dizer o que ele é.

### Bloco C — Passos 1 a 6: fora o "×" ✅

O botão "continuar depois" do topo direito não existe mais, com o handler e a
rota de saída (`router.push('/app')`) que ele usava. **Nenhum atalho o
substituiu.** O cabeçalho ficou com o logo, "Configurar barbearia · N de 6" e a
barra de progresso — mais um espaçador `aria-hidden` do lado direito, sem o
qual o título centrado no espaço restante sairia do eixo da barra de progresso.

### Bloco D — Passo 2: Cidade e UF viraram seletores com busca ✅

- **UF**: `GET /onboarding/ufs`, lista estática de `BRAZIL_UFS`
  (`@barbervp/types`). 27 itens que não mudam desde 1988 — uma chamada externa
  para servi-los seria latência sem ganho.
- **Cidade**: `GET /onboarding/cities/:uf`, proxy do IBGE
  (`/localidades/estados/{UF}/municipios`) com cache no Redis por 30 dias e o
  mesmo throttle do CEP. **Mesmo arranjo da ViaCEP, pelas mesmas três razões**
  (fase 03): o CSP das apps não libera host externo, o cache serve toda a base,
  e trocar de fonte não toca frontend. Os 5.570 municípios NÃO entram no
  bundle: seriam ~150 kB carregados por todo dono para escolher um item.
- **Degradação**: IBGE fora do ar → lista vazia (sem gravar cache, senão um
  minuto ruim viraria 30 dias de lista vazia para todo mundo) → a cidade volta
  a ser campo de texto, com aviso. Um provedor externo fora do ar não pode
  travar um passo que agora é obrigatório.
- **O CEP seleciona os dois combos casando pelo CÓDIGO IBGE**, não pelo nome —
  "Ribeirão Preto" com e sem acento é o mesmo município, e comparar texto seria
  uma armadilha silenciosa. A ViaCEP devolve o código no campo `ibge`; quando
  não devolve, cai no nome normalizado (sem acento, sem caixa), que é o melhor
  esforço possível. Conferido no navegador com 14015-000: os dois combos abrem
  em "São Paulo" e "Ribeirão Preto".
- **Trocar a UF limpa a cidade** — São Paulo/SP e São Paulo/MG não são a mesma
  coisa.
- **Dois ramos de render, não `disabled`**: sem UF escolhida não existe lista de
  cidade para oferecer, e um controle apagado não diz o que falta.
- **Contrato**: `PUT /onboarding/location` recebe `cityIbgeCode` e grava
  `TenantSettings.addressCityIbge` (migration
  `20260904120000_onboarding_obrigatorio`). A linha única `address` não mudou de
  forma.

**`Combobox` nasceu aqui** (`packages/ui/src/components/combobox.tsx`), e o
registro é este. Não havia seletor pesquisável no design system: o `Select` é o
`<select>` nativo, de propósito (abre a roda do sistema no celular), e resolve
dezenas de opções — não 5.570 municípios, onde a única navegação viável é
digitar. Herda inteiras as convenções de overlay da fase 02: portal (para não
ser recortado por `overflow-hidden` de card ou diálogo), trava de scroll, ESC
fecha e devolve o foco ao gatilho, clique fora fecha, bottom-sheet abaixo de
768px. Teclado com ↑/↓, Enter e `aria-activedescendant`; abre posicionado no
item já escolhido. **A aba Configurações e a Minha Página também têm endereço e
vão querer o mesmo controle.**

### Bloco E — Passo 3: upload de verdade e o link certo ✅

- **Os dois campos de URL saíram.** Eram "URL do logo" e "URL da foto de capa",
  com o aviso "O upload direto chega na fase de integrações" — que **mentia
  desde o agente 25**. Agora são dois `ImageSlot` **reusados** de
  `components/dashboard/my-page/image-slot.tsx` (não copiados), subindo por
  `POST /my-page/images/:slot`. Nenhuma rota nova: o campo de destino é o mesmo
  `TenantSettings.logoUrl`/`coverUrl`, e uma rota própria do onboarding seria um
  segundo caminho de escrita para o mesmo dado. Pelo mesmo motivo,
  `PUT /onboarding/identity` **recusa** `logoUrl`/`coverUrl` — com dois donos
  para o campo, uma URL digitada apagaria o arquivo que o dono acabou de subir.
- **O `ImageSlot` ganhou `error`** (prop opcional, os três usos existentes
  seguem iguais): a recusa do SERVIDOR aparece embaixo do próprio quadro, não em
  toast. A validação local (formato, 5 MB) continua em toast — ela acontece
  antes de qualquer requisição e some sozinha.
- **As restrições estão escritas onde o dono vê antes de tentar**: formato,
  5 MB, e o tamanho mínimo em português de gente ("imagem quadrada, a partir de
  400 por 400 pontos"; "foto deitada, a partir de 1200 por 400 pontos — é a
  faixa larga do topo da sua página", medida do `ShopHero` real).
- **Prévia** abaixo dos slots: capa, logo sobreposto, nome do passo 1 e endereço
  do passo 2, montados com o `OnboardingState` que a API já devolveu. É o que
  transforma "capriche" em algo que o dono consegue julgar.
- **O link público deixou de levar a 404** — dívida da fase 11, fechada.
  `onboarding.service.ts` interpolava `{base}/agendar/{slug}` e o wizard fazia o
  caminho inverso (`replace(/\/agendar\/.*$/, '')`); a página da barbearia é
  `{base}/{slug}`. Os dois lados mudaram juntos, e a base agora vem do contrato
  (`publicBaseUrl`), o MESMO valor que `GET /my-page` devolve. Conferido no
  navegador: `/{slug}` responde 200 e `/agendar/{slug}`, 404.
- **Slug sugerido** a partir do nome da barbearia na primeira visita ao passo,
  usando `GET /onboarding/slug` (a sugestão da fase 03). O dono edita se quiser.
- **Disponibilidade com debounce de 500 ms** e três estados visíveis
  (verificando / disponível / indisponível), com a sugestão da API a um clique.
- **Slug reservado tem mensagem própria.** `SlugService` já bloqueava, mas a
  tela dizia "já está em uso" para `entrar`, `cadastro`, `admin` — e o dono
  ficava esperando o dia em que a outra barbearia soltasse o nome. Agora
  `SlugAvailability.reserved` separa os dois, e a API responde
  409 `SLUG_RESERVED`.
- **O link completo fica visível e clicável para copiar**, abaixo do campo.
- **"Pular etapa" continua** (o passo é pulável desde a fase 03), agora com o
  custo escrito: "Você pode adicionar logo e capa depois em Minha Página".

### As 7 pendências responsivas que a medição encontrou

`/app/configurar` **nunca tinha sido medido**. Duas razões somadas: o dono do
seed já concluiu o onboarding (e desde esta fase o guard o devolve ao painel),
e o passo é estado do CLIENTE — abrir a rota cinco vezes mediria cinco vezes o
passo 1. Ao medir de verdade:

| Passo | O que apareceu |
|---|---|
| 3 | Campo do slug de 48px renderizado com **19px** de altura a 360/390 |
| 4 | Nome do serviço idem; `Select` de duração com 40px; campo de preço com 20px |
| 6 | Dois `Select` de horário por linha com 40px; botão "Aplicar estes horários…" com **365px** numa tela de 360, empurrando a página inteira |

A causa dos campos espremidos é uma só, e é uma armadilha que a Minha Página já
documentava no campo gêmeo dela: **`flex-1` num contêiner `flex-col`** cresce e
encolhe no eixo VERTICAL — abaixo de `sm` os três campos tinham `flex-1` sem
prefixo de breakpoint, e o `h-12` virava 19px. Corrigido para `sm:flex-1` +
`w-full`. Os seletores foram para 44px no dedo (`sm:` volta a 40 onde há
ponteiro), e o botão longo passa a quebrar em duas linhas abaixo de `sm`.

> O "culpado" que a varredura apontava para o botão de 365px era o **rodapé**,
> porque ele é `inset-x-0` e se estica junto com a página. Vale a nota para a
> próxima leitura de saída da varredura: o primeiro culpado da lista é o que
> importa.

### Como a varredura passou a medir os 6 passos

- **`?passo=N`** em `/app/configurar` abre direto num passo (1..6), em vez de
  retomar do último gravado. Não pula validação nenhuma — cada passo continua
  salvando pelo seu endpoint e `complete` recusa o que falta — e serve também ao
  dono que quer voltar a um passo por link, o que o wizard já permitia por
  "Voltar"/"Continuar". Foi necessário porque **trocar a viewport RECARREGA a
  página** (o Chrome refaz a emulação ao ligar/desligar `isMobile`): um passo
  alcançado por clique não sobrevive, e a medida de 360 mostraria o passo 3
  enquanto a de 768 mostraria as boas-vindas.
- **Fixture `barbearia-configuracao`** no `make seed`
  (`dono@barbeariaconfiguracao.com.br` / `BarberVP@2026`): barbearia no passo 0,
  sem endereço e sem serviço, com nome de dona em minúscula de propósito (é o
  caso que o vocativo tem de tratar). Registrar uma conta a cada varredura não
  serviria: `POST /auth/register` é limitado a **5 por hora**, e a varredura
  passaria a depender de quantas vezes rodou.
- `responsive-sweep.mjs` ganhou a superfície `wizard`
  (`node scripts/responsive-sweep.mjs --app=wizard`) e teve o miolo de medição
  extraído para `MEASURE`/`measureViewports`, reusado pelas duas varreduras.

### Testes (+29)

| Suíte | Antes | Depois |
|---|---|---|
| Unitários (`apps/api`) | 97 | 97 |
| Unitários (`apps/web`) | 14 | **25** |
| E2E | 349 | **364** |
| Isolamento | 180 | **183** |

- **`test/onboarding.e2e-spec.ts` (15 casos, novo)** — o wizard não tinha
  cobertura e2e nenhuma. Cobre, em ordem de importância: `complete` recusando
  com todos os passos faltando e com o último faltando; "Pular etapa" não
  enganando a verificação (o dado é apagado e o 409 volta); `publicUrl` sem
  `/agendar/` e igual ao de `GET /my-page`; slug reservado com código próprio;
  `identity` recusando `logoUrl` digitada; o upload gravando o MESMO campo que a
  Minha Página lê; as 27 UFs; `cities/:uf` servindo do cache na segunda chamada
  (com o cache marcado por um município impossível — se ele volta, veio do
  Redis); o código IBGE gravado; o vocativo; e o `BARBER` recusado em três
  rotas.
- **`test/isolation/auth-tenancy.isolation-spec.ts` (+3)** — as duas rotas novas
  são dados de referência sem superfície de tenant, e o caso REGISTRA isso: no
  dia em que alguém recortar cidades por barbearia, ele reprova e cobra o
  escopo. Mais o endereço com código IBGE de A não chegando a B, e as duas rotas
  exigindo sessão.
- **`apps/web/test/dashboard-guard.spec.ts` (11 casos, novo)** — a regra de
  produto do lado do navegador, sobre `resolveGuardAction`.

### O que esta fase decidiu NÃO fazer

- **Trocar o `LocalStorageDriver` por S3/R2** — decisão de deploy (fase 12).
- **Redimensionar/otimizar imagem no servidor** — dívida conhecida, segue.
- **Redesenhar os passos 1, 4, 5 e 6.** Só entraram as correções que a régua
  responsiva cobrou (alvos de 44px e o `flex-1` no eixo errado), porque o
  critério de aceite pede a varredura verde nos 6 passos.
- **Mexer no `disabled` do "Continuar"** — ele reflete campo obrigatório vazio,
  não regra de negócio, e é o padrão do wizard desde a fase 03.

## O que o agente 29 (reparos transversais) entregou

Fase concluída — as seis camadas fechadas, na ordem do enunciado.

### Camada 0 — fechamento do agente 15 (aba Agenda) ✅

**Faixa real do protótipo, confirmada por grep** (nenhum agente anterior a
anotara): `Dashboard.dc.html` **l.395–563** — toolbar l.396–440, visão Dia
l.441–479, Semana l.481–498, Mês l.500–531, **Timeline l.533–563**. A aba
Clientes começa em l.565. O recorte do barbeiro é `DashboardFuncionario.dc.html`
**l.240–?**: mesma toolbar SEM o filtro de barbeiro (ele só vê a própria
agenda), mesmas 4 visões, mesmos 3 botões à direita.

**O achado que muda a leitura desta camada:** o trabalho não commitado do
agente 15 estava MUITO mais completo do que as dívidas registradas por outros
agentes faziam supor. Das 9 correções previstas no enunciado, **cinco já
estavam feitas** e ninguém sabia, porque o registro nunca foi escrito:

| # | Defeito previsto | Estado real |
|---|---|---|
| 1 | `gap-4.5` não existe no Tailwind | **Real** — corrigido (`gap-4`) |
| 2 | 5 alvos de toque < 44px | **Parcial** — data e filtro já estavam em `h-11`; `‹`/`›` e "Hoje" corrigidos |
| 3 | `Service.color` não é lido | **Real** — corrigido (ver decisão) |
| 4 | Sem caminho para `NO_SHOW` | **Já feito** — `PATCH /staff-agenda/:id/no-show` + drawer + caso e2e |
| 5 | `TIMELINE` renderiza igual a `DAY` | **Já feito** — `agenda-timeline.tsx` tem o desenho próprio da l.533–563 |
| 6 | Mover só troca a hora do mesmo dia | **Já feito** — a remarcação reusa o modal, com data E barbeiro |
| 7 | Modal de remarcação não extraído | **Parcial** — o modal existe; faltava o consumidor do Dashboard |
| 8 | Modal assume fuso do navegador | **Já feito** — o `startsAt` vem de `/slots`, instante UTC do servidor |
| 9 | `Appointment.unitId` nasce nulo | **Real** — corrigido nos 3 caminhos de escrita |

**Corrigido de fato:**

- **`gap-4.5` → `gap-4`** em `agenda/page.tsx` (l.122 e l.272). A classe não
  gerava regra nenhuma (a escala do Tailwind 3.4 vai de `4` a `5`, sem `4.5`),
  então o gap era **zero** — as duas únicas ocorrências do repositório.
- **Alvos de toque da barra de data.** `‹` e `›` eram `h-9 w-9` (36px) e "Hoje"
  não tinha altura nenhuma (~20px de conteúdo). Viraram `h-11`/`h-11 w-11` no
  mobile, mantendo `md:h-7` — o protótipo desenha 28px, que só vale no desktop.
- **`Service.color` chega à agenda.** `StaffAppointmentItem.services[]` ganhou
  `color`; o bloco da grade desenha uma **faixa de acento** de 4px com ela.
- **`Appointment.unitId` deixa de nascer nulo.** A unidade do agendamento é a
  do barbeiro que o atende, gravada nos três caminhos: `POST /staff-agenda`,
  o booking público (`AppointmentsService.persist`) e `PATCH /:id/move` (trocar
  de profissional pode trocar de unidade). **Era a causa de o filtro por
  unidade dos Relatórios — entregue funcionando pelo agente 20 — devolver zero
  para sempre.** Caso e2e novo cobre a gravação.
- **"Remarcar" do Dashboard remarca de verdade.** O menu ⋯ de "Próximos
  atendimentos" navegava para `/app/agenda` e largava o operador lá. Agora abre
  o MESMO `AppointmentFormModal` da aba Agenda, carregado por
  `GET /staff-agenda/:id`. **Fecha a dívida 2 da fase 13** sem uma segunda
  implementação da regra de disponibilidade.

**Decisões conscientes desta camada:**

1. **Cor do bloco: status, com o serviço como acento.** O enunciado dizia "o
   protótipo colore por serviço" — **não colore**. `Dashboard.dc.html` l.5055,
   l.5071 e l.5091 mapeiam `color: STATUS_COLORS[a.status]` nas TRÊS visões.
   Mas o catálogo tem um campo chamado literalmente "Cor na agenda" (l.1993)
   que não fazia nada — botão sem função, regra 2. Resolvido honrando os dois:
   o TOM do bloco continua sendo o do status (fidelidade + legibilidade do
   estado), e `Service.color` entra como faixa lateral de 4px. Serviço sem cor
   não desenha faixa.
2. **Timeline fica.** A decisão que o enunciado pedia já estava tomada pelo
   código não registrado: `agenda-timeline.tsx` porta o desenho da l.533–563
   (faixa horizontal por barbeiro, régua de horas, almoço e bloqueios como zona
   morta). Nada a remover do seletor.

**Testes:** `agenda.e2e-spec.ts` 10/10, com o caso novo do `unitId`.

### Camada 1 — defeitos que atingem o produto inteiro ✅

1. **O deadlock do refresh** — o defeito mais grave que a fase 11 deixou em
   aberto, descrito no cabeçalho deste arquivo. A correção é uma guarda em
   `packages/ui/src/lib/api-client.ts`: o interceptor **não tenta renovar um
   401 vindo da PRÓPRIA rota de refresh** (`/auth/refresh` e
   `/client-auth/refresh`), porque esse 401 significa "não há sessão para
   renovar" e precisa propagar até o `catch` do provider, que então chama
   `clearSession()` e libera o guarda a redirecionar.

   **O teste foi conferido REPROVANDO antes do conserto** — é o que separa um
   teste de regressão de um teste decorativo. Sem a guarda, três dos quatro
   casos morrem no timeout de 5s, inclusive o do anônimo em rota protegida. O
   quarto (sessão renovável) passa nos dois estados, e existe para provar que
   a guarda não quebrou o caminho de quem TEM sessão.

   Conferido também no navegador, que é o critério de aceite: `/app` e
   `/admin` anônimos caem em `/entrar`.

2. **Suíte unitária de frontend, nova** (`apps/web/test`, 14 casos). Nasceu
   porque as duas defesas mais caras do produto não tinham nada que
   reprovasse no CI: o deadlock acima e **a guarda de host do super admin**,
   verificada até então só à mão com `curl -H "Host: ..."` — é ela que
   compensa a perda dos quatro deploys separados na fase 11. Ambiente `node`,
   sem jsdom: nenhum dos dois toca no DOM, e testar componente React continua
   dívida aberta.

3. **Alvos de toque abaixo de 44px.** O `Tabs` e o `Switch` compartilhados JÁ
   estavam corrigidos (`h-11 md:h-9` e o `<label>` de 44px dentro do próprio
   componente) — outra dívida que descrevia um estado anterior. O que sobrou:
   o **remendo local** da aba WhatsApp, um `<label>` de 44×44 em volta do
   `Switch`, removido — além de redundante, `<label>` dentro de `<label>` é
   HTML inválido; e a paginação de `/admin/mensagens`, em 79×34.

4. **A barra de data da Agenda** (a única rota que a varredura do agente 27
   ainda reprovava): `‹`/`›` de 36px e "Hoje" sem altura viraram 44px no
   mobile, mantendo os 28px do protótipo no desktop.

5. **`DashboardGuard` — reavaliado e MANTIDO** com navegação dura. A dívida da
   fase 11 dizia para reavaliar depois de corrigido o deadlock; feito isso,
   apareceu um motivo próprio para mantê-la: `(dashboard)`, `(admin)` e
   `(marketing)/(auth)` montam cada um o SEU `EstablishmentAuthProvider`, e
   cada provider dispara um refresh ao montar. Numa navegação suave entre
   grupos as duas árvores coexistem por um instante, e duas POSTs simultâneas
   em `/auth/refresh` rotacionam o cookie e fazem a segunda cair na detecção
   de reuso, que revoga a família inteira — o incidente que a auditoria da aba
   Comandas já pagou uma vez. A navegação dura não tem essa janela.

6. **"Clientes" no nav do barbeiro: desvio consciente, escrito no código.** O
   `DashboardFuncionario.dc.html` tem o item; aqui ele não aparece. A base de
   clientes é `@Roles('OWNER','MANAGER')` no servidor desde a fase 06,
   seguindo o `SPEC.md` → RBAC. Mostrar o item levaria a uma tela que responde
   403; abrir `/clients` para `BARBER` afrouxaria o RBAC, o que a regra 3
   desta fase proíbe. O que o barbeiro precisa do cliente ele já tem no
   recorte certo — o drawer do agendamento traz nome, telefone, faltas e
   últimas visitas. Reabrir a decisão exige antes decidir o RECORTE no
   servidor, que é fase de produto.

**`make responsive` fechou sem pendência em nenhuma das 35 rotas**, nos 5
tamanhos — o que exigiu, na Agenda, duas decisões de desenho e não só de
classe (ver Camada 5, "o que ficou decidido").

### Camada 2 — recursos que existiam e a interface não alcançava ✅

1. **O programa de pontos ganhou tela**, em `/app/configuracoes` →
   **Preferências**. Foi para lá, e não para Barbearia, porque é uma REGRA DE
   OPERAÇÃO da casa — vizinha do bloqueio por faltas, da antecedência mínima e
   do prazo de cancelamento; a aba Barbearia guarda dado cadastral. Traz o
   mesmo gate da rota (`fidelidadePontos`, Profissional+) e mostra o upsell
   com benefícios visíveis para quem está no Essencial, nunca um campo morto.
   Programa desligado **esconde** a calibragem em vez de desabilitá-la (regra
   4: dois ramos de render).

2. **Meta mensal** (`TenantSettings.monthlyGoalCents`): o agente 26 NÃO a
   incluíra. O campo entrou em Preferências. A linha tracejada do gráfico do
   Dashboard só aparecia para quem editasse o banco à mão.

3. **`POST /admin/tenants/:id/deletion/cancel`.** `/admin/tenants` filtra por
   `deletedAt`, que na exclusão AGENDADA é nulo: a barbearia seguia na lista
   com aparência de normal, e o super admin não tinha como sequer VER que ela
   estava na fila da faxina. A lista e o detalhe passaram a devolver `purgeAt`
   (pílula vermelha com a data), e o drawer ganhou o bloco de desfazer. Volta
   para `TRIAL`, não `ACTIVE`, pelo mesmo motivo do caminho do dono: a
   assinatura foi cancelada no gateway e não se ressuscita cobrança
   recorrente por conta própria.

4. **Kill-switch da impersonação** (`POST /admin/tenants/:id/impersonate/revoke`).
   Exigiu uma coluna nova, `AuthSession.impersonatedBy`: sem ela a sessão de
   impersonação é **indistinguível de um login normal do OWNER**, e revogar
   "a impersonação" derrubaria o dono junto. A revogação vale NA HORA,
   inclusive para o access token já emitido — o `JwtAuthGuard` confere
   `sessions.isActive(claims.sid)` a cada requisição —, e há caso e2e provando
   exatamente isso: o mesmo token que respondia 200 passa a 401. Outro caso
   prova que o login normal do dono NÃO é derrubado junto.

5. **`GET|PUT /barbers/:id/work-schedule` REMOVIDAS.** Decisão: nenhuma tela
   as reivindicou, e o modal da aba Equipe grava a escala junto com o resto
   num `PATCH :id`, em transação única, enquanto `GET :id` já devolve a semana
   em `workSchedule`. Dois caminhos de escrita para o mesmo dado é convite a
   divergirem, e rota que ninguém chama não tem quem perceba quando quebra. Os
   dois casos de isolamento que as cobriam foram REESCRITOS para o caminho que
   sobrou, não apagados — a escala continua isolada.

### Camada 3 — links que levavam a lugar nenhum ✅

1. **`/privacidade` e `/termos` escritas.** Eram três pontos de entrada para
   um 404 (cadastro do estabelecimento, registro do cliente e "Privacidade e
   dados" de Meu perfil). Grupo `(marketing)/(legal)`, layout próprio — sem a
   nav de vendas, que aqui não serve para nada. **O texto afirma só o que o
   produto faz:** exportação e exclusão dos dois lados com os caminhos de tela
   reais, a janela de 30 dias do `purgeAt`, e os prazos exatos de
   `RETENTION_DAYS` (OTP 7 dias, sessão 30, mensagens 30, auditoria 365).
   Nenhuma cláusula sobre integração que o v1 não tem.

2. **O *soft 404* de `/{slug}` resolvido, e a causa era outra.** Não é
   comportamento do `notFound()` no Next 14.2.16: era o **`loading.tsx`
   daquela pasta**. Ele cria um limite de Suspense, o Next despeja a casca com
   status 200 e só então resolve o `fetch` — quando o `notFound()` dispara, o
   cabeçalho já foi enviado. Medido: com o arquivo, 200; sem ele, 404. Removê-lo
   custou nada, e isso também foi medido: `generateMetadata` JÁ aguarda o mesmo
   `fetchBarbershop` antes de qualquer byte sair, o `fetch` tem
   `revalidate: 60` (a segunda chamada é leitura de cache na mesma
   requisição), e nenhuma navegação interna aponta para `/{slug}` — é sempre
   ponto de entrada de link externo, então o esqueleto nunca chegava a
   aparecer.

3. **Título da landing** não duplica mais a marca (`title: { absolute }`).

4. **Slugs reservados atualizados contra as rotas REAIS.** O bloqueio já
   existia e funcionava; a LISTA é que estava velha — faltavam `cadastro`,
   `recuperar-senha` e `privacidade`, e uma barbearia com esses slugs nunca
   abriria (no Next a rota estática ganha da dinâmica). O que faltava mesmo era
   alguém reprovar quando nascesse rota nova: o teste novo **lê o diretório de
   rotas de verdade** e falha se alguma escapar da lista. Conferido reprovando.

5. ~~**Link do fim do onboarding** (`{base}/agendar/{slug}` → 404)~~ —
   **RESOLVIDA pelo agente 30**: os dois lados mudaram juntos, e a base passou a
   vir do contrato (`publicBaseUrl`). Era: não tocado aqui por ser escopo do
   agente 30; ficava de pé em `onboarding.service.ts:443` e no
   `onboarding-wizard.tsx:195` (que fazia o caminho inverso).

### Camada 4 — dado, schema e testes ✅

1. **`make seed` — já estava certo.** O tenant demo (`barbearia-central`)
   nasce com `onboardingDoneAt` preenchido desde o agente 14, com comentário
   explicando o porquê. Só `barbearia-isolamento` fica pendente, e ele existe
   para os testes, não para navegar. Os roteiros deste arquivo estão corretos
   como estão.

2. **`LoyaltyRaffle`/`LoyaltyRaffleEntry` derrubadas** (migration
   `20260903200000_drop_loyalty_raffles`), junto com o enum `RaffleStatus` no
   schema e em `packages/types`. Conferido antes: nada no código as
   referenciava e as duas estavam vazias. Se sorteios voltarem, voltam como
   fase própria com desenho novo.

3. **Resgate de pontos protegido contra concorrência.** O saldo é a SOMA de um
   ledger, não uma coluna — não há linha única contra a qual fazer o débito
   condicional que a quota de assinatura usa. A trava é consultiva
   (`pg_advisory_xact_lock` por tenant+cliente), com reconferência do saldo
   dentro da transação e 409 (`LOYALTY_BALANCE_CHANGED`) se ele mudou. **Não é
   a linha do `ClientProfile`**: nem todo cliente com pontos tem perfil naquela
   barbearia, e uma trava que às vezes não tranca é pior que nenhuma.

4. **Editar o teto de um PLANO reprocessa os tenants dele.** `applyPlanLimit`
   só rodava na troca de plano DO TENANT. Agora a varredura acontece também
   ao editar `maxBarbers` em `/admin/planos`, com uma transação POR TENANT (e
   não uma gigante: o erro num tenant não pode desfazer o conserto dos
   outros), só quando o teto de fato mudou, e com `AuditLog` próprio. Caso e2e
   cobre encolher E crescer.

5. **`revenueByBarber` vira `LEFT JOIN`.** Comanda sem barbeiro — a venda de
   balcão — ficava fora do detalhamento, e a soma das linhas não batia com o
   card de faturamento logo acima: dois números discordando na mesma tela, sem
   nada explicando. Agora há linha "Sem barbeiro" e a soma fecha. O rateio por
   item continua fora: é decisão de produto, não defeito.

6. **O teste flaky de `generateBookingCode` já estava consertado** — foi
   reescrito para medir ENTROPIA (colisões ≤ 2 em 2 mil sorteios, com a
   matemática do paradoxo do aniversário no comentário) mais um caso de
   cobertura de alfabeto. Nada a fazer.

7. **`NODE_ENV=production` forçado** nos três alvos de build do `Makefile` e
   nos três passos de build do CI. Não é dívida de código: é a pegadinha de
   rodar `next build` de dentro dos containers de dev, que definem
   `development` e fazem o Next misturar os runtimes — 35 páginas quebram na
   pré-renderização com um erro que parece de código (`Cannot read properties
   of null (reading 'useContext')`) e é de ambiente.

### Camada 5 — infraestrutura pronta, faltando plugar ✅

1. **Foto do barbeiro deixou de ser campo de URL.** O `image-slot` do
   protótipo (l.2166) virou `ImageSlot` de verdade sobre
   `POST /barbers/:id/avatar`, com o `StorageAdapter` do agente 25 — que já
   resolvia o servidor desde então; faltava o consumidor. O contrato não mudou
   (`Barber.avatarUrl` continua sendo o destino), então agenda, comanda e
   página pública seguem lendo o mesmo campo.

   Dois detalhes que a troca revelou: no modo CONVITE o campo antigo **nem
   chegava ao servidor** (`useCreateStaffInviteMutation` não manda `avatarUrl`)
   — era um controle que não fazia nada; e `avatarUrl` **saiu do
   `UpdateBarberDto`**, porque aceitá-lo no `PATCH` seria um segundo caminho
   de escrita para a mesma coluna, esse sem validação de tipo nem de tamanho.
   Dois ramos de render: quem já é `Barber` envia foto, quem ainda é convite vê
   as iniciais e a explicação.

2. **Onboarding passo 3 (logo e capa):** escopo do agente 30, não tocado.

3. **As automações de calendário do WhatsApp passaram a disparar** — o maior
   item da fase. `BIRTHDAY`, `REACTIVATION` e `REVIEW` guardavam `enabled` e
   `enabledAt`, a tela dizia "ativa", e **nada acontecia, nunca**: o
   `BookingNotificationsService` só cobre confirmação, lembrete e cancelamento,
   que são REAÇÕES a um agendamento; estes três são disparos por calendário e
   não tinham executor. Três interruptores prometendo um recurso inexistente.

   Fila própria (`automations`, a quinta), job diário às 9h por padrão
   (`QUEUE_AUTOMATIONS_HOUR` — e não de madrugada como a faxina: são mensagens
   que uma PESSOA recebe), pelo mesmo `NotificationAdapter` de todo o resto.
   As quatro decisões que fazem o job ser seguro rodar todo dia:

   - **Idempotência**, que é o ponto delicado — job diário que reenvia é pior
     que job que não roda. Cada evento consulta o próprio `NotificationOutbox`
     antes de enfileirar, com a janela apropriada: aniversário uma vez por ano,
     reativação uma vez por janela de inatividade, avaliação uma vez por
     AGENDAMENTO (a chave é o `appointmentId` do payload, porque um cliente
     pode ser atendido duas vezes no mesmo dia).
   - **A janela de reativação é a CONFIGURADA** (`offsetMinutes`), não 30 dias
     fixos — o agente 22 tornou o `<select>` configurável e a faixa dourada da
     aba já o respeitava; o job usa a mesma pergunta.
   - **A avaliação tem limite inferior de 24h.** Sem ele, ligar a automação
     hoje dispararia pedido para todo atendimento concluído na história da
     barbearia: a primeira rodada mandaria milhares de mensagens.
   - **O gate de plano é reconferido NO JOB.** `enabled` sobrevive a um
     downgrade: o dono liga no Avançado, cai para o Essencial, e a linha
     continua `true`. Sem a checagem, o job entregaria um recurso que a
     barbearia deixou de pagar — e o gate deixaria de ser server-side.

   O dia do aniversário é o do FUSO DO TENANT, não o do servidor: um tenant em
   Rio Branco recebendo o job às 21h de Brasília ainda está na véspera, e
   "feliz aniversário" um dia antes é pior que nada.

### O que esta fase decidiu NÃO corrigir, e por quê

- **Navegação dura do `DashboardGuard`** — reavaliada e mantida, com motivo
  próprio novo (ver Camada 1, item 5).
- **"Clientes" no nav do barbeiro** — desvio consciente; corrigir exigiria
  afrouxar o RBAC (Camada 1, item 6).
- **Rateio de faturamento por item** entre barbeiros de uma mesma comanda —
  decisão de produto, não defeito. A linha "Sem barbeiro" já fecha a soma.
- **Alvos de clique em slot vago da Agenda, no celular** — a faixa de um slot
  tem a altura do próprio slot (15 min ≈ 17px), e esticá-la para 44px
  desalinharia o horário que ela representa, que é a única coisa que ela
  significa. No celular ela não é renderizada; o caminho é o "+ Novo
  agendamento", que abre o mesmo modal com chips de tamanho de dedo.
- **Tabela `Notification` de verdade, provedores reais, multi-unidade de fato,
  paginação de volume e performance** — escopo declarado fora do v1, como o
  enunciado desta fase determinou.

### O que continua em aberto depois desta fase

Em uma tela, porque é isto que quem abrir a próxima sessão precisa ver:

| O que | Estado |
|---|---|
| **Fase 12 — Deploy** | ⬜ A ÚNICA fase pendente. Vercel (`apps/web`) + Railway (`apps/api` + Postgres + Redis); `make build-web`/`make build-api` já rodam o contrato de cada uma, e o CI os verifica em passos dedicados. |
| ~~**Agente 30 — passo 3 do onboarding**~~ | ✅ **Feito** (2026-09-04), e com escopo maior do que a linha previa: além do link público e do upload, a fase estabeleceu que **concluir a configuração inicial é obrigatório** e fez isso valer na API. |
| **Provedores reais** (WhatsApp oficial, Asaas, Google OAuth, LLM do Assistente) | Fora do v1 por decisão de escopo. Os mocks fazem o que prometem, e `docs/INTEGRACOES.md` tem os 3 passos de troca — validados seguindo os próprios passos na fase 09. |
| **Multi-unidade de fato** | Fora do v1. O `unitId` agora É GRAVADO na escrita (agente 29), então o filtro dos Relatórios funciona; falta o `AvailabilityService` respeitar unidade e escopar `Client`/`Product`. |
| **Tabela `Notification`, paginação de volume, performance** | Fora do v1. Nada quebrado; é otimização para volume que ainda não existe. |
| **Teste de componente React** | Dívida aberta desde a fase 02. A suíte de frontend nasceu nesta fase, mas em ambiente `node` — falta jsdom + testing-library para cobrir interação. |

**O produto está inteiro. O que falta é publicar.**

## O que o agente 15 (auditoria 1:1 da aba Agenda) entregou

> Registro escrito pelo **agente 29** (2026-09-03). O trabalho é do 15, que o
> deixou no working tree sem commit e sem registro; o 29 o auditou contra o
> protótipo, corrigiu o que faltava e fechou a linha. Ver a nota na tabela de
> fases.

Rota: `/app/agenda`. **Faixa do protótipo, confirmada por grep** (nenhum agente
anterior a anotara): `Dashboard.dc.html` **l.395–563** — a aba Clientes começa
em l.565. Dentro dela: toolbar l.396–440, visão **Dia** l.441–479, **Semana**
l.481–498, **Mês** l.500–531, **Timeline** l.533–563. O recorte do barbeiro é
`DashboardFuncionario.dc.html` a partir de l.240: mesma toolbar **sem o filtro
de barbeiro** (ele só vê a própria agenda), mesmas 4 visões, mesmos 3 botões à
direita.

### Tabela de desvios

Fechada com **um desvio consciente**, e não zerada — ver a última linha.

| Bloco do protótipo | Estado | Regra de negócio | Papéis |
|---|---|---|---|
| Navegador `‹ Hoje ›` + campo de data | presente | passo de 1 dia (7 na semana, 1 mês no mês) | todos |
| Seletor de 4 visões | presente | Semana e Timeline só ≥ `lg`; abaixo, aviso e volta ao Dia | todos |
| Filtro multi-seleção de barbeiro | presente | some para `BARBER`; vazio = todos | OWNER/MANAGER |
| "Bloquear horário" | presente | `BARBER` bloqueia só a própria agenda | todos |
| "Copiar link de agendamento" | presente | usa o slug real do tenant | todos |
| "+ Novo agendamento" | presente | walk-in ou cliente cadastrado | todos |
| Grade do Dia (colunas por barbeiro) | presente | régua vem de `gridStartMinutes`/`End` da API, não de 08:00–20:00 cravado | todos |
| Faixa de almoço hachurada | presente | sai da `WorkSchedule` do barbeiro | todos |
| Linha "agora" | presente | só no dia de hoje, no fuso do tenant | todos |
| ⚠ "cliente com 2+ faltas" | presente | limiar 2 é o do desenho; o BLOQUEIO usa `bloquearFaltasQtd` | todos |
| Visões Semana / Mês / Timeline | presente | Mês tem endpoint próprio (contagem + ocupação) | todos |
| Drawer do agendamento | presente | confirmar, remarcar, falta, cancelar, últimas visitas | todos |
| Modal de agendamento/remarcação | presente | horários vêm de `/slots`; o mesmo modal remarca | todos |
| Seletor de recorrência do modal (l.5113) e `↻` no bloco | **ausente** | ver decisão 5 | — |

### Backend

`staff-agenda`: `GET /` (dia/semana/timeline), `GET /month`, `GET /slots`,
`GET /:id` (drawer + histórico), `POST /`, `POST /blocks`, `DELETE /blocks/:id`,
`PATCH /:id/move`, `/confirm`, `/no-show`, `/cancel`. O recorte por papel é do
`StaffScopeService`, dentro do serviço — `BARBER` entra pelas MESMAS rotas, e
não por rota duplicada. Migration `agenda_time_block` para os bloqueios.

### Frontend

`components/dashboard/agenda/`: toolbar, as quatro grades, drawer, modal de
agendamento/remarcação e modal de bloqueio, sobre `lib/dashboard/api/agenda.ts`.
Quatro pontos de entrada externos, todos por query string: `?novo=1` (CTA da
topbar), `?date=` (busca global), `?cliente=` (o "Agendar" da aba Clientes, que
o agente 16 acrescentou) e `?barbeiro=` (o "Ver agenda" do card da Equipe).

### Decisões conscientes

1. **Cor do bloco: STATUS, com o serviço como acento.** O protótipo colore por
   status nas três visões (`STATUS_COLORS`, l.5055/5071/5091) — a suposição de
   que colorisse por serviço estava errada. Mas o catálogo tem um campo
   literalmente chamado "Cor na agenda" (l.1993) que não fazia nada. Os dois
   foram honrados: o TOM do bloco é o do status, e `Service.color` entra como
   faixa lateral de 4px. Serviço sem cor não desenha faixa.
2. **Timeline tem desenho próprio** (l.533–563): faixa horizontal por
   barbeiro, régua de horas, almoço e bloqueios como zona morta. Nada a
   remover do seletor.
3. **Semana e Timeline só ≥ `lg`.** Abaixo disso não cabem; a tela mostra o
   aviso com o botão de voltar ao Dia, em vez de uma grade ilegível.
4. **Escala vertical maior no celular** (1.6 px/min contra 1.1): o bloco é um
   alvo de toque, e a 1.1 um atendimento de 30 min rendia 31px. A grade fica
   mais alta e rola mais — é o preço de um alvo que o dedo acerta.
5. **Recorrência ficou de fora, e é o único desvio da tabela.** O protótipo tem
   o seletor "Não repete / Toda semana / A cada 15 dias / Todo mês" (l.5113) e
   o `↻` no bloco da grade. Portá-lo NÃO é um campo: exige série de
   agendamentos no modelo (o que é "cancelar só esta ocorrência"? e mover uma
   do meio? e quando a escala do barbeiro muda no meio da série?), e cada uma
   dessas perguntas é regra de produto. Deixar o seletor na tela gravando um
   campo que ninguém lê seria exatamente o botão decorativo que a regra 2
   proíbe — melhor ausente e escrito aqui do que presente e mentindo.

### Testes

`agenda.e2e-spec.ts`, 10 casos: a grade sai da ESCALA (não do horário da casa
nem de valor fixo), as 4 visões respondem, o almoço não é oferecido e o horário
oferecido é aceito, bloqueio fecha a agenda interna E a grade pública, falta
conta na ficha e **bloqueia o cliente no booking ao atingir o limite**, o
`unitId` nasce preenchido, e remarcar passa pelo motor de disponibilidade.
Isolamento: `dashboard-operation.isolation-spec.ts` cobre tenant e papel.

### Dívidas que a aba deixa

- **Sem teste de frontend da grade em si.** A varredura responsiva mede
  layout; a interação (arrastar, clicar em slot) segue conferida a olho.
- **A visão Mês não filtra por barbeiro na contagem** — mostra a ocupação da
  casa inteira. O protótipo também.
- **Recorrência de agendamento não existe** (decisão 5 acima). É a única
  ausência da tabela de desvios, e entra como fase própria — com modelo de
  série —, nunca como campo solto no modal.

## O que o agente 28 (auditoria da aba Assistente IA) entregou

Rota: `/app/assistente-ia`. O protótipo é `Dashboard.dc.html` l.2818–3000.
A aba existia desde a fase 07 como um chat cru — header genérico, balões sem
geometria, campo com botão "Enviar" textual. O desenho tem MUITO mais: cartões
estruturados ao lado das respostas, medidor de cota, banner de upsell, chips e
microfone.

### Desvios encontrados (18 blocos conferidos)

| # | Bloco do protótipo | Situação anterior |
|---|---|---|
| 1–2 | Header 64px (selo, "Navalha — seu assistente", "online") + botão de ícone | `h1` genérico; botão inexistente |
| 3–5 | Área de 760px, balão do usuário `14/14/4/14`, balão do assistente `4/14/14/14` com avatar | `Card` sem largura máxima, raio uniforme, cor errada |
| 6 | Cartão de MÉTRICA (número + delta + sparkline) | inexistente |
| 7 | Cartão "agendamento criado" + "Ver na agenda"/"Desfazer" | inexistente |
| 8 | Balão de ÁUDIO (play + waveform + duração) | inexistente |
| 9 | Cartão "bloqueio criado" | inexistente |
| 10 | Cartão de clientes inativos + "Enviar reativação para todos" | inexistente |
| 11 | Medidor de uso (rótulo + barra) | só o rótulo, sem barra |
| 12 | Link "simular limite" | inexistente — e **não portado de propósito** |
| 13 | Banner de limite + "Fazer upgrade" | inexistente |
| 14 | Chips de sugestão | inexistente |
| 15–16 | Microfone 44px + campo + seta dourada 44px | botão "Enviar" textual |
| 17–18 | Badge "IA" no nav · recorte do BARBER | já corretos (agente 22 e fase 07) |

Ao final, tabela zerada — com as três decisões de recorte registradas abaixo.

### Backend

- **`AiChatMessage.card` (JSONB)** — a resposta não é só texto: o cartão vai
  gravado ao lado dela. Sem coluna, o histórico reabria como texto morto e o
  bloco desenhado só existia no instante da resposta.
- **`AiChatMessage.hiddenAt`** — "limpar conversa" ESCONDE, não apaga. A cota
  do mês é contada nestas linhas: um `DELETE` zeraria o contador, e quem
  estourasse o limite ganhava 50 mensagens novas clicando no botão. É a brecha
  que o próprio botão criava, fechada antes de existir.
- **A cota virou do TENANT** (era `count` por `userId`). A cota é do PLANO;
  contar por usuário multiplicava o limite pelo número de donos e gerentes da
  casa — exatamente o que o tier deveria limitar. O histórico continua por
  usuário; só o contador mudou de recorte.
- **`AssistantInsightsService`** — as consultas reais por trás dos cartões
  (faturamento de 7 dias com série diária e variação, ticket médio de 30 dias,
  inativos com o MESMO `CLIENT_INACTIVE_DAYS` da aba Clientes, agenda do dia).
  Mora separada porque é a camada de FERRAMENTAS que o driver enxerga
  (`AssistantInsightsPort`): quando o provedor real entrar, é este objeto que
  vira o conjunto de tools do LLM, sem que o driver ganhe Prisma.
- **`AiAssistantAdapter` passou a devolver `{ text, card }`** e a receber
  `insights` já amarrado ao tenant — o driver não escolhe de quem é o número.
  Ganhou também `suggestions()`: os chips saem do DRIVER, porque sugerir o que
  ele não sabe responder seria um chip morto.
- **`DELETE /assistant/messages`** (limpar conversa) — endpoint novo.
- **Seed**: `resetDemoExtras` passou a limpar `aiChatMessage` do tenant demo.
  `seedAssistant` é `createMany` puro; sem isso cada reseed empilhava outras 24
  mensagens no mês e — com a cota agora por tenant — o contador subiria sozinho
  até fechar a porta no tenant de demonstração.

| Método | Rota | Observações |
|---|---|---|
| GET | `/assistant/messages` | Histórico (100 últimas, `hiddenAt IS NULL`) + uso do mês + sugestões. |
| POST | `/assistant/messages` | 403 `AI_MESSAGE_LIMIT_REACHED` ao estourar a cota do tenant. |
| DELETE | `/assistant/messages` | Esconde a conversa do usuário. A cota do mês PERMANECE contada. |

### Frontend

`components/dashboard/assistant/`: `chat-header`, `chat-message`,
`assistant-card` (um render por `kind`, molduras com o `min-width` do
protótipo: 220/280/320px), `sparkline`, `chat-composer`, `use-speech-input`.
Ícones `ArrowRightIcon` e `MicIcon` portados dos `path` do bundle.

- Nenhum valor do protótipo no front: número, nome de cliente, data e rótulo
  de variação vêm todos do cartão que a API devolve.
- Estados: skeleton com a SILHUETA da conversa (balão à direita, balão à
  esquerda) para não empurrar layout; vazio próprio; erro com retry local;
  turno otimista enquanto o assistente responde.
- O botão "Enviar reativação para todos" NAVEGA para `/app/whatsapp`, onde
  moram o gate de plano, a contagem e a confirmação — o assistente não
  reimplementa envio em massa.

### Três recortes deliberados (não são pendências de execução)

1. **"Simular limite" (l.2943) não foi portado.** É afordância de demo do
   protótipo (`toggleAssistantLimit`, l.4883), da mesma família do
   `minhaPaginaLocked` que o agente 25 classificou como código morto. Um link
   que mente sobre o estado do servidor não vai para produção.
2. **O microfone virou DITADO, não gravação.** O balão de áudio do protótipo
   (l.2884–2900) exigiria armazenamento de mídia e provedor de transcrição,
   que esta fase não tem. O que dá para entregar de verdade é a Web Speech API
   do navegador: a fala vira texto no campo e o dono revisa antes de enviar.
   Onde a API não existe (Firefox), o botão SOME — microfone que não escuta é
   o botão morto que a regra 2 proíbe.
3. **Os cartões de ESCRITA ("agendamento criado", "bloqueio criado") ficaram
   para o provedor real.** Produzi-los exige entender "agende o João amanhã às
   14h com o Diego" — NLU, não classificador de palavra-chave. Criar
   agendamento a partir de `includes('agenda')` seria pior que não criar. A
   moldura do cartão de agenda já é a mesma geometria (ícone, título, linhas
   de detalhe, botões), então o dia em que o driver real souber produzi-los o
   desenho já está de pé.

### Verificação

- 12 e2e novos (`assistant.e2e-spec.ts`) e 4 de isolamento novos. Suítes
  completas: **95 unit · 333 e2e · 177 isolamento**, todas verdes.
- Um caso e2e pegou bug de verdade durante a escrita: `revenueThisWeek`
  devolvia cartão zerado em vez de `null` num tenant sem comanda fechada, e a
  frase de estado vazio do driver nunca aparecia.
- Varredura responsiva: `/app/assistente-ia` passa nos 5 tamanhos.
- Conferido no navegador como OWNER (demo, Avançado → "∞ Mensagens
  ilimitadas"), no tenant secundário (Essencial → "12/50" com a barra em 24%),
  com a cota cheia (banner vermelho + campo desabilitado + chips escondidos) e
  como BARBER (nav sem o item; URL forçada explica o recorte em vez de
  oferecer um retry que nunca passa).

### Desvio visto de passagem, FORA desta aba (para o agente da área)

Conferindo o nav do BARBER, o item **Clientes** não aparece — mas o
`DashboardFuncionario.dc.html` (l.1614) TEM `clientes` em `NAV_DEFS`.
`lib/dashboard/nav.ts` marca a rota como `roles: ['OWNER','MANAGER']`, e o
`ClientsController` recusa o barbeiro. Ou o protótipo do funcionário está
sendo contrariado, ou a decisão de restringir foi tomada e não ficou escrita.
Não toquei: a aba Clientes é do agente 16. Fica anotado porque foi a única
divergência de nav que a conferência por papel desta sessão levantou.

## O que o agente 27 (auditoria da tela Meu perfil) entregou

Rota: `/app/meu-perfil`, fora do nav, alcançada pelo menu do avatar. O agente
26 a tirou de Configurações e a entregou de pé, com o que já tinha endpoint
(dados da sessão + troca de senha); esta fase a completou.

**Uma tela, dois desenhos.** `Dashboard.dc.html` l.2737–2817 é a do dono/gerente
e `DashboardFuncionario.dc.html` l.776–845 é a do barbeiro — e a segunda NÃO é
outra página: é a mesma, com o nome travado, sem "Alterar foto", com "Solicitar
exclusão dos meus dados" no lugar de "Excluir minha conta" e sem o bloco
vermelho. Quem decide isso são os `can*` de `GET /me`.

O **gerente** é a UNIÃO dos dois: ele usa o painel do dono (nome editável,
foto, link da Política de Privacidade), mas não exclui a barbearia — então
ganha o "Solicitar exclusão dos meus dados" do desenho do funcionário. Por isso
os recortes são por CAMPO (`canEditName`, `canUploadAvatar`,
`canDeleteAccount`) e não por "qual dos dois desenhos renderizar": tratar o
gerente como funcionário o deixaria sem a foto; como dono, com um botão de
exclusão que o servidor recusa.

### A tabela de desvios (o passo 1 da fase)

| Bloco do protótipo | Existia? | Layout igual? | Botões funcionavam? |
|---|---|---|---|
| "‹ Voltar ao dashboard" (l.2740) | ❌ | — (havia um `<h1>` que o desenho não tem) | — |
| Avatar 56px com borda dourada (l.2748) | ❌ | — | — |
| Nome + selo do papel (l.2751) | ❌ | papel virava item de `<dl>` | — |
| "Alterar foto" (l.2754) | ❌ | — | protótipo: toast "em breve" |
| Nome / E-mail / WhatsApp editáveis (l.2758–2769) | ⚠️ | texto read-only; WhatsApp inexistente | — |
| "Salvar alterações" (l.2772) | ❌ | — | sem endpoint |
| "Segurança": 3 campos (l.2777–2789) | ⚠️ | 2 de 3, em grid de 2 colunas | ✅ |
| Erro inline `mpSenhaErro` (l.2790) | ❌ | só toast | — |
| "Privacidade e dados" + "Baixar meus dados" (l.2797–2805) | ❌ | — | — |
| "ATENÇÃO" + "Excluir minha conta" (l.2807–2813) | ❌ | — | — |
| `modalExcluirConta`, 2 passos (l.3511–3546) | ❌ | — | — |
| BARBEIRO: nome travado + a frase (func. l.796) | ❌ | — | — |
| BARBEIRO: "Solicitar exclusão" + modal (func. l.840/1212) | ❌ | — | — |

### Os quatro achados

1. **"Excluir minha conta" não existia — nem tela, nem endpoint.** A ação mais
   destrutiva do produto (barbearia, unidades, equipe, agenda, histórico de
   clientes, assinatura) estava desenhada e não implementada em lugar nenhum.
2. **O "30 dias para reativar" do modal não tinha como ser cumprido.** Não
   havia coluna de prazo nem faxina. `Tenant.deletedAt` não servia: ele já
   significa "apagado" e é filtrado pelo login e pelo `TenantGuard` — marcá-lo
   no pedido trancaria o dono para fora exatamente na janela em que ele deveria
   poder desistir. Nasceu `Tenant.purgeAt`.
3. **A foto do usuário não tinha onde morar.** `avatarUrl` só existia em
   `Barber`, que é o profissional da agenda: um gerente sem ficha de barbeiro
   não tinha onde guardar a própria foto. O protótipo respondia com um toast
   "será habilitado em breve" — com o `StorageAdapter` do agente 25 já de pé,
   isso não é limitação, é botão morto (regra 2).
4. **O recorte do BARBEIRO não existia.** A tela do funcionário tem quatro
   diferenças deliberadas, e nenhuma estava lá. Pior: sem o 403 no servidor,
   o nome do barbeiro seria editável por ele — o que troca o dono da agenda e
   da comissão pelas costas de quem administra a barbearia.

### Schema (migration `20260825120000_meu_perfil_auditoria`)

- `User.avatarUrl` — a foto da PESSOA, separada da foto do BARBEIRO.
- `Tenant.purgeAt` (+ índice) — a data da faxina. `null` = nenhuma exclusão
  agendada; `deletedAt` continua significando "apagado".

### Backend

- Módulo novo `apps/api/src/account/` com `MyProfileController`/`Service`. Fora
  de `SettingsModule` de propósito: aquele é da barbearia e é OWNER/MANAGER.
- `PATCH /me` grava em `User` **e** nas fichas `Barber` deste usuário (e-mail e
  telefone). É `Barber.phone` que o WhatsApp da barbearia usa para falar com o
  profissional: gravar só em `User` deixaria a tela e o envio divergindo.
- `GET /me` cai para `Barber.phone` quando `User.phone` é nulo — quem entra
  pelo convite da Equipe não tem telefone próprio, e o campo vazio parecia dado
  perdido enquanto a aba Equipe mostrava o número.
- `MaintenanceService.purgeScheduledTenants` — a faxina cumpre o prazo. Uma
  barbearia por vez (um erro numa não derruba as outras), `ON DELETE CASCADE`
  leva o resto, e o `AuditLog` fica (`tenantId` é `SetNull`) como prova.
- Seis ações novas de auditoria: `user.profile_updated`, `user.avatar_updated`,
  `user.data_exported`, `user.data_deletion_requested`,
  `account.deletion_requested`/`_canceled` e `account.purged`.

### Frontend

- Os quatro cards na ordem do desenho, coluna de 720px centrada, com o link de
  volta ACIMA deles (o `<h1>` que existia saiu — o protótipo não o tem).
- "Segurança" virou coluna única com os TRÊS campos e o erro sob o último. A
  régua da mensagem é a `isPasswordValid` compartilhada, a mesma que a API
  aplica: prometer menos do que o servidor exige daria um 400 sem explicação.
- `DeleteAccountModal` — dois passos no mesmo diálogo, "Excluir permanentemente"
  só acende com a palavra exata, e o fundo NÃO fecha (`dismissOnOverlayClick`).
- O bloco "ATENÇÃO" tem DOIS estados: o do desenho e o de exclusão agendada,
  com a data e "Cancelar exclusão". Sem o segundo, os 30 dias seriam uma frase
  sem botão — é o mesmo bloco, no mesmo lugar, em outro estado.
- A foto entrou no menu do avatar da topbar; por isso o `PATCH`/upload renova a
  sessão (`refresh()`), que é de onde aquele componente lê.
- O formulário só reidrata quando os valores do SERVIDOR mudam, comparados por
  conteúdo: reagindo à identidade do objeto, trocar a foto no meio de uma
  edição apagaria o nome digitado e ainda não salvo.

### Decisões e desvios conscientes do protótipo

- **"Baixar meus dados" entrega o arquivo NA HORA.** O protótipo prometia
  e-mail "em até 48h"; não há nada a processar em lote, e mandar a pessoa
  esperar dois dias por uma consulta de meio segundo é fricção sem
  contrapartida.
- **"Alterar foto" virou upload de verdade**, contra o toast "será habilitado
  em breve" do desenho. A regra 2 vence aqui porque a infraestrutura já
  existia (`StorageAdapter`, agente 25).
- **Nada de "preferências pessoais" nesta tela.** O enunciado da fase as
  menciona, o protótipo NÃO as desenha, e as que existem no produto
  (antecedência, faltas, cancelamento, meta) são da BARBEARIA e já moram em
  Configurações → Preferências (agente 26). Inventar um bloco pessoal seria
  criar uma configuração que ninguém lê.
- **Durante a janela de 30 dias a barbearia continua funcionando com o plano
  atual.** `Tenant.planId` não é limpo no pedido: o dono precisa do produto de
  pé para exportar os dados e para poder desistir. O que para na hora é a
  COBRANÇA (assinatura `CANCELED`), que é o que o modal promete.
- **Desistir volta o tenant a `TRIAL`, não a `ACTIVE`.** A assinatura foi
  cancelada no gateway e não se ressuscita cobrança recorrente por conta
  própria — reativar é escolher plano em Configurações → Plano e cobrança,
  caminho que já passa pelo `PAYMENT_ADAPTER`.
- **Contorno vermelho é classe local, não variante do design system.** O
  `Button` tem `danger` só na versão sólida (usada nos modais); o contorno que
  o desenho pede aparece em dois botões desta tela e foi resolvido com
  `DANGER_OUTLINE` no arquivo. Virar variante compartilhada mexeria em telas já
  auditadas sem necessidade.

### Testes

- `test/profile.e2e-spec.ts` — 25 casos: o recorte dos três papéis, a
  normalização do WhatsApp, a queda para `Barber.phone`, o 403 do nome do
  barbeiro (e o "reenviar o mesmo nome não é edição"), o 409 de e-mail em uso,
  o upload real (e o PDF disfarçado tomando 415), a exportação sem token, o
  pedido de exclusão chegando ao dono, os 403 de gerente/barbeiro na exclusão
  da conta, o agendamento que NÃO apaga nada, o 409 de duplicidade, a
  desistência e a faxina cumprindo o prazo.
- 5 casos novos na suíte de isolamento (`full-coverage`): o perfil de A sem
  nada de B, o header de slug de B não trocando o tenant, a exportação sem a
  barbearia vizinha e — os dois que mais importam — a exclusão e o pedido de
  exclusão não caindo sobre B nem com o slug dela no header.
- Suíte: **95 unit · 321 e2e · 173 isolamento**.

### Conferido no navegador

Dono, gerente e barbeiro em 1440, e o dono em 390: ordem dos blocos, selo do
papel, nome travado com a frase no barbeiro, o gerente com os TRÊS controles de
privacidade (exportar, solicitar exclusão, política), os dois passos do modal (bottom-
sheet no celular, modal no desktop), o estado "Exclusão agendada para
24/09/2026 — faltam 30 dias para desistir" e a desistência. Varredura
responsiva nos 5 tamanhos: `/app/meu-perfil` limpa nos cinco (o alvo de toque
de "Alterar foto" nasceu com 16px de altura e foi para 44px no dedo).

### Dívidas que a tela deixa

- ~~**`/privacidade` não existe.**~~ — **RESOLVIDA pelo agente 29**:
  `/privacidade` e `/termos` escritas no grupo `(marketing)/(legal)`. Era: O link "Política de Privacidade" (l.2804)
  aponta para a mesma rota que o cadastro do estabelecimento e o registro do
  cliente já apontam desde as fases 03/05 — e ela nunca foi escrita. Não é
  dívida desta tela, mas agora são TRÊS pontos de entrada para um 404. Escrever
  a página (e a de termos) é trabalho de conteúdo, não de código.
- **Reativar depois da exclusão é só pelo caminho do dono.** Se ele perder o
  acesso ao login dentro dos 30 dias, não há rota de super admin que desfaça o
  agendamento — `/admin/tenants` filtra por `deletedAt`, que aqui é nulo, então
  a barbearia continua na lista, mas sem botão para limpar o `purgeAt`. Um
  `POST /admin/tenants/:id/deletion/cancel` fecha isso em poucas linhas.
- **A foto do usuário é gravada na pasta do tenant ATIVO.** Funciona (a URL é
  pública como a do logo), mas um usuário que serve duas barbearias deixa a
  foto na pasta daquela de onde subiu o arquivo. Se um dia o storage passar a
  ter ciclo de vida por tenant, a foto pessoal precisa de um espaço próprio.
- **A exportação LGPD não cobre o que o usuário produziu como OPERADOR.** Traz
  perfil, vínculos, fichas de barbeiro, sessões e a trilha das próprias ações —
  não as comandas que ele fechou nem as comissões que ganhou, que são dado da
  BARBEARIA. É a leitura correta da LGPD, mas vale registrar a escolha.

## O que o agente 26 (auditoria da aba Configurações) entregou

Fonte: `Dashboard.dc.html` l.2466–2736 (as 4 sub-abas) + `modalUpgrade`
(l.3461) e `modalTrocarPlano` (l.3483). Rota: `/app/configuracoes`.

### A tabela de desvios (o passo 1 da fase)

| Bloco do protótipo | Existe? | Layout igual? | Botões funcionam? | Ação tomada |
|---|---|---|---|---|
| Barra de 4 sub-abas | ⚠️ 5 | ❌ rótulo "Plano"; aba extra "Meu perfil" | ✅ | 4 abas, rótulos do desenho; Meu perfil virou tela própria |
| Barbearia → dados (5 campos) | ⚠️ | ❌ grid 2 col., **sem Fuso**, card partido | ✅ | Card único, 1 coluna, seletor de fuso |
| Barbearia → horário com **Almoço** | ⚠️ | ❌ almoço não existia nem no schema | ✅ | `lunchStart`/`lunchEnd` em `TenantBusinessHour` + linha 1:1 |
| Barbearia → "Salvar alterações" | ✅ | ❌ fora do card | ✅ | Rodapé do card, à direita |
| Unidades → banner de Relatórios | ❌ | — | — | Criado, com link real |
| Unidades → "+ Nova unidade" com cadeado | ⚠️ | ❌ a aba inteira virava paywall | ⚠️ | Gate movido para a ESCRITA; cadeado no botão |
| Unidades → tabela de 4 colunas | ❌ grade de cards | ❌ | ✅ | `ResponsiveTable` + status derivado |
| Unidades → modal "Nova unidade" | ✅ | ❌ campo Telefone a mais | ✅ | Só Nome e Endereço |
| Unidades → "Sincronização entre unidades" | ❌ | — | — | **Desvio consciente** (abaixo) |
| Plano → card atual + "Mudar de plano" | ⚠️ | ❌ sem selo "Ativo", sem botão | ⚠️ `renewsAt` caía em hoje | Reconstruído 1:1 |
| Plano → grade de comparação | ⚠️ | ❌ **sem lista de recursos** | ✅ | `marketing` exposto no `SaasPlanOption` |
| `modalTrocarPlano` (GANHOS/PERDAS) | ❌ | — | ❌ `window.confirm()` | Modal real + `GET /plan/preview/:planId` |
| Plano → histórico de faturas + **PDF** | ⚠️ `<ul>` | ❌ | ❌ PDF inexistente | Tabela + endpoint de recibo |
| Preferências → 3 seletores + toggle | ⚠️ | ❌ inputs numéricos | ✅ | `<Select>` com as opções do desenho |
| Preferências → "Tema escuro" | ❌ | — | — | **Desvio consciente** (abaixo) |
| `modalUpgrade` | ✅ | ✅ | ✅ | — |
| Papéis | ❌ | — | — | Plano e cobrança viraram OWNER-only |
| Horário → motor de disponibilidade | ❌ | — | — | `closed` zera o dia; almoço da casa subtrai |

Ao final, zerada — salvo os dois desvios conscientes registrados abaixo.

### Os cinco achados

1. **O gerente trocava o plano da barbearia.** `/settings/plan`,
   `/plan/change` e as faturas eram `@Roles('OWNER','MANAGER')` (herdado do
   controller) quando o `SPEC.md` é explícito: "MANAGER: dashboard completo
   EXCETO configurações de billing/plano do SaaS". Não era uma imprecisão de
   permissão: um gerente podia fazer downgrade e, com isso, desligar barbeiros
   da equipe. Agora as quatro rotas de plano são `@Roles('OWNER')` (o
   `RolesGuard` faz `getAllAndOverride` com o handler antes da classe, então o
   decorator do método vence) e a sub-aba some do menu para quem não é dono.
2. **"Fechado" não chegava ao motor de disponibilidade.** O
   `AvailabilityService.planFor` fazia `if (business && !business.closed)` —
   isto é, o dia fechado apenas deixava de RECORTAR o expediente do barbeiro,
   em vez de zerá-lo. Um barbeiro com `WorkSchedule` no domingo enchia de
   horários uma barbearia que não abre domingo. O interruptor mais visível da
   aba não tinha efeito nenhum.
3. **O "Almoço" do horário de funcionamento não tinha onde morar.** O desenho
   desenha um toggle de almoço por dia (l.2521), mas só o `WorkSchedule` de
   cada barbeiro tinha `lunchStart`/`lunchEnd` — a CASA não fechava para
   almoço. Nasceram as duas colunas em `TenantBusinessHour`, com duas `CHECK`
   no banco (par completo, janela dentro do expediente) e recusa 400 antes
   disso, com o dia no texto.
4. **A troca de plano era um `window.confirm()`.** Os blocos "Você vai ganhar"
   e "Você vai perder" são a razão de o `modalTrocarPlano` existir, e não
   existiam. Também não existia a lista de recursos nos cards de comparação:
   a grade mostrava nome e preço, nada mais.
5. **O link "PDF" de cada fatura era `href="#"`.**

### Schema (migration `20260824120000_configuracoes_auditoria`)

- `TenantBusinessHour.lunchStart` / `.lunchEnd` (`Int?`), com
  `tenant_business_hour_lunch_pair` (os dois nulos ou os dois preenchidos) e
  `tenant_business_hour_lunch_window` (dentro de `opensAt`/`closesAt`). Um
  intervalo pela metade viraria `NaN` silencioso na grade.

### Backend

- **Papéis**: `@Roles('OWNER')` em `/settings/plan`, `/plan/preview/:planId`,
  `/plan/change` e `/plan/invoices/:id.pdf`.
- **Gate de unidade movido**: `GET /settings/units` perdeu o
  `@RequireFeature`; `POST`/`PATCH` mantêm. O protótipo mostra a lista e tranca
  o botão — esconder a aba inteira ensinava menos e vendia pior.
- **`GET /settings/plan/preview/:planId`** monta o modal: percorre
  `FEATURE_KEYS` comparando o `features` REAL dos dois planos (editável pelo
  super admin — trocar uma flag lá muda o texto do modal sem deploy), soma o
  ganho/perda de assentos e devolve os NOMES dos barbeiros que caem, na MESMA
  ordem em que `PlanLimitsService.applyPlanLimit` vai desligá-los. As duas
  contas precisam bater: o modal não pode prometer uma coisa e a troca fazer
  outra.
- **A troca passa pelo `PAYMENT_ADAPTER`**: `createCharge` → `CONFIRMED` →
  `RECEIVED`, e a `SaasInvoice` nasce com `externalId`. Era a única
  movimentação financeira do SaaS que o gateway nunca via — a rota gravava uma
  fatura `PAID` direto no banco.
- **`GET /settings/plan/invoices/:id.pdf`**: recibo em pdfkit, mesma paleta
  clara do export de Relatórios e do relatório de comissões. Busca por `id`
  **e** `tenantId`.
- **`renewsAt` virou nulo** sem assinatura (era `new Date().toISOString()`, e
  a tela anunciava que o plano renovava HOJE para todo tenant sem
  `TenantSubscription`).
- **"Atrasado"** não é status novo: é `PENDING` mais `BILLING_DUE_DAYS` (env
  nova, padrão 5), calculado na API e devolvido como `overdue`.
- **`SaasPlanOption.marketing`**: os bullets do card saem da MESMA coluna que
  a landing consome. O dono lê a mesma promessa antes e depois de assinar.
- **`UnitItem.status`** derivado: `INACTIVE` \| `SETUP` (ligada, zero
  barbeiro) \| `ACTIVE`. Nunca digitado.
- **Disponibilidade**: `business.closed` zera o dia; o almoço da casa é
  subtraído ANTES do almoço do barbeiro (duas janelas independentes). Na
  agenda interna o almoço da casa entra como bloqueio `wholeShop` com id
  sintético — é faixa desenhada, não `ScheduleException` que alguém apague.
- **Validação**: fuso contra `TENANT_TIMEZONES`; preferências por FAIXA
  (`bloquearFaltasQtd` ≤ 10, `antecedenciaMinima` ≤ 7 dias, `cancelamentoHoras`
  ≤ 168) — e não pela lista do seletor, ver decisão abaixo.

### Frontend

- `/app/configuracoes` com as QUATRO sub-abas do desenho, `?tab=` sincronizado
  com a URL (é o destino de todo `UpgradeModal` da casca).
- `BusinessHoursEditor` novo: dia, interruptor, entrada–saída, "Almoço" com as
  duas horas, "Fechado". Semana em ordem de produto (segunda → domingo,
  `WEEK_ORDER_MONDAY_FIRST`), rótulo curto (`WEEKDAY_SHORT_LABELS`).
- `PlanChangeModal` novo: título com o preço real, os dois blocos condicionais
  e "Confirmar" desabilitado até o impacto chegar — aprovar uma troca cujo
  cálculo está em voo é assinar em branco.
- Telefone com o par `formatPhone` + `maskPhoneInput` do cadastro de barbeiro
  (mostrava `551133334444` cru).
- A troca de plano invalida `settings-plan`, `dashboard-shell`,
  `settings-units`, `barbers` e `team-plan-usage` — invalidar só a aba deixava
  a topbar anunciando o plano antigo.
- `BARBER` que digita a URL recebe a frase e um caminho de saída, não quatro
  sub-abas com "Tentar de novo" que só sabe repetir um 403.

### "Meu perfil" saiu de Configurações

O protótipo tem uma TELA própria para ela (`isMeuPerfilScreen`, l.2737–2817),
fora do nav, alcançada pelo menu do avatar. Ela vivia como quinta sub-aba de
Configurações — uma aba que o desenho não tem. Agora é `/app/meu-perfil`, com
o MESMO conteúdo que já existia (dados da sessão + troca de senha), e o item do
menu aponta para lá. **"Privacidade e dados", "Baixar meus dados" e a exclusão
de conta em dois passos (`modalExcluirConta`, l.3512) eram do agente 27**, dono
desta tela — ele recebeu a rota de pé, não em branco, e **já a completou**: ver
"O que o agente 27 entregou".

### Decisões e desvios conscientes do protótipo

- **"Sincronização entre unidades" (l.2576) NÃO foi portada.** Os dois toggles
  ("Clientes", "Produtos") descrevem exatamente as duas entidades que o schema
  NÃO escopa por unidade: `Client`/`ClientProfile` e `Product` não têm
  `unitId` (quem tem é `Barber`, `Appointment`, `Order`, `CashRegister`).
  Persistir as flags seria um par de interruptores sem efeito nenhum — a regra
  2 ("todo botão tem função real") é mais forte aqui do que a regra 1. Fazer
  valer exige escopar catálogo e base de clientes por unidade, o que atravessa
  as abas Clientes (ag. 16) e Serviços & Produtos (ag. 23). Fica como dívida.
- **"Tema escuro" (l.2730) NÃO foi portado.** O `SPEC.md` → Design system
  fecha a questão: "tema escuro em todas as superfícies, sem alternância
  claro/escuro no produto real". Não existe paleta clara no design system;
  o interruptor seria decorativo.
- **Os seletores de preferência validam por FAIXA, não pela lista.** A tela
  oferece as opções do desenho (1–5 faltas, 30min–12h, 1h–24h), mas um valor
  gravado fora dela continua válido: o seed nasce com `cancelamentoHoras: 2`, e
  o desenho não oferece "2h antes". `optionsWithCurrent` injeta o valor atual
  no `<select>` em tempo de render — sem isso, abrir a aba e salvar qualquer
  outro campo trocaria, em silêncio, a política de cancelamento da barbearia.
- **A coluna "Barbeiros" está alinhada à direita**, não centralizada como no
  desenho: `TableColumn.align` do design system só tem `left`/`right`, e
  número alinhado à direita é o padrão das outras tabelas do produto.
- **O horário da casa continua NÃO repropagando para o `WorkSchedule`** dos
  barbeiros (decisão da fase 07, mantida): o expediente da casa RECORTA o do
  barbeiro no motor, que é o efeito que importa, sem sobrescrever a escala que
  o dono montou na aba Equipe.

### Achado fora do escopo (corrigido, porque aparecia na tela)

**Suíte de teste interrompida deixava `SaasPlan` no banco para sempre.** O
`reset()` do seed só apagava os três códigos do seed, então uma execução que
morre antes do `teardown` deixava `iso-avancado-…`/`e2e-iso-d2-…` vivos — e a
grade de comparação da aba Plano (e a landing, que lê a mesma tabela) listava
"Avançado (isolamento)" e "profissional (iso e2e)" ao lado dos planos de
verdade. `reset()` agora varre por prefixo, a mesma defesa já usada em
`Client.phone`.

### Seeds

- `UNITS` (3 unidades do tenant demo, endereços coerentes com a barbearia
  semeada, não os do desenho) + lotação dos barbeiros: matriz 3, Zona Sul 1,
  Norte 0. A terceira nasce sem barbeiro de propósito — é ela que produz o
  status "Em configuração", que nenhum ambiente exercitaria de outro jeito.
  Também é o que dá conteúdo ao seletor de unidade da topbar.

### Testes

- `test/settings.e2e-spec.ts` novo — 24 casos: papéis (gerente barrado nas 4
  rotas de plano, liberado no resto), ganhos/perdas do downgrade e do upgrade,
  409 no plano atual, downgrade desligando os excedentes e upgrade trazendo de
  volta, fatura com `externalId`, `marketing` no payload, "Atrasado", PDF de
  verdade (`%PDF`) e 404 na fatura do vizinho, almoço da casa gravado/recusado
  em três formas, fuso fora da lista, tenant recém-criado servindo as 4
  sub-abas vazias com `renewsAt` nulo, e **o expediente chegando ao motor**
  (domingo fechado zera o dia com o barbeiro escalado; o almoço da casa some
  da grade pública).
- Isolamento: `saasInvoiceId` no `tenant-fixture`, mais dois casos em
  `full-coverage` (recibo do vizinho e histórico sem id de B) e o caso do gate
  movido em `dashboard-ii` (Profissional LÊ as unidades, mas não cria nem
  edita).
- Suíte: **95 unit · 296 e2e · 168 isolamento**, tudo verde.

### Conferido no navegador

Owner, gerente e barbeiro, nos 5 tamanhos (360/390/768/1024/1440), com a
varredura `scripts/responsive-sweep.mjs` estendida para as 4 sub-abas e para
`/app/meu-perfil`. Duas correções de responsividade saíram daí, as duas em
`packages/ui` e valendo para todo mundo: **a pílula `segmented` do `Tabs`
tinha 36px** (agora 44 abaixo de `md`, 36 no desktop) e **o `Switch` sem
rótulo visível tinha alvo real de 44×24** — o trilho continua com 24px, mas
agora mora dentro de um `<label>` de 44 que é o que o dedo acerta.

Gate conferido de olho: com o tenant no Essencial, a lista de unidades continua
visível, "+ Nova unidade" ganha o cadeado e abre o upsell, e o `POST` responde
403 (suíte de isolamento).

### Dívidas que a aba deixa

1. **Sincronização entre unidades** não existe (acima). Enquanto `Client` e
   `Product` não tiverem `unitId`, catálogo e base de clientes são sempre
   compartilhados — o que hoje é verdade, mas ninguém escolheu.
2. **O filtro "Todas as unidades" de Relatórios não tem UI.** A API aceita
   `unitId` (`ReportPeriodQuery`), mas a página manda `unitId: null` fixo. O
   banner da aba Unidades leva para Relatórios, e lá não há seletor de unidade.
   **Para o agente dono de Relatórios (ag. 20).**
3. **`Appointment.unitId`/`Order.unitId` continuam nulos no seed**, mesmo com
   os barbeiros lotados. Filtrar relatórios por unidade hoje devolveria zero.
   Amarrar a unidade no fechamento da comanda e no agendamento é dos agentes
   de POS e Agenda.
4. **`/app/agenda` reprova a régua de toque** em 360/390 (`‹`/`›`/"Hoje" da
   barra, 36×36 e 49×20). Não é desta aba — é o trabalho não registrado do
   agente 15. **Para quem fechar o registro do 15.**
5. **`/admin/mensagens` reprova a régua de toque** ("Anterior"/"Próxima",
   79×34). Super admin, fase 09.
6. O `<input type="time">` é nativo: em navegador com locale en-US mostra
   AM/PM. É o mesmo controle do protótipo; trocar por um seletor próprio é uma
   decisão de design system, não desta aba.

## O que o agente 25 (auditoria da aba Minha Página) entregou

Alvo: `Dashboard.dc.html` l.2240–2465, rota `/app/minha-pagina`.

### Tabela de desvios (preenchida no início, zerada no fim)

| # | Bloco do protótipo | Existia? | Layout igual? | Botões OK? | Resolução |
|---|---|---|---|---|---|
| 1 | Cabeçalho + subtítulo (l.2242) | sim | subtítulo divergente | — | texto do protótipo |
| 2 | Grid `1fr / 380px` (l.2247) | **não** | era `lg:grid-cols-2`, coluna direita = galeria | — | grid refeito |
| 3 | "Link de agendamento" (l.2250) | sim | botão Copiar inline | sim | botão em linha própria, `self-start` |
| 4 | "URL personalizada" (l.2259) | sim | prefixo `/` no lugar do domínio | sim | prefixo vem de `publicBaseUrl` |
| 5 | "Logo e capa" (l.2267) | **não** | — | — | bloco criado + upload real |
| 6 | "Sobre" (l.2283) | sim | sim | — | — |
| 7 | "Exibir no site" (l.2288) | sim | sim | **Fotos e Horário não faziam nada** | passaram a valer em `/{slug}` |
| 8 | Instagram/Endereço (l.2309) | sim | header "Contato" a mais | sim | header removido |
| 9 | Overlay `minhaPaginaLocked` (l.2319) | não | — | — | **nenhuma** — dead code, ver decisão |
| 10 | "Preview ao vivo" + iPhone (l.2340) | **não** | — | — | criado, com dados reais |
| 11 | "Avaliações recebidas" (l.2429) | **não** | — | — | criada + 2 endpoints |
| 12 | Botão "Salvar alterações" | extra | — | — | protótipo não tem: virou autosave |
| 13 | loading/vazio/erro | parcial | erro travava em skeleton eterno | — | skeleton fiel, retry, vazios por bloco |

### Backend

- **`StorageAdapter` (`src/adapters/storage/`) — dívida de upload de arquivo
  fechada.** Mesmo padrão de `NOTIFICATION_ADAPTER`/`PAYMENT_ADAPTER`: símbolo
  `STORAGE_ADAPTER`, driver `LocalStorageDriver` (grava em disco, serve como
  estático por `useStaticAssets` em `main.ts`), factory em `AdaptersModule`.
  Trocar por S3/R2 é um `case`. Nome do arquivo é aleatório (16 bytes hex) e a
  chave começa SEMPRE pelo `tenantId`; `resolveKey` recusa `..`. Env novas:
  `STORAGE_DRIVER`, `STORAGE_LOCAL_DIR`, `STORAGE_PUBLIC_BASE_URL`.
- **`GET /my-page/preview`** reusa `PublicPageService.getBySlug` — o preview
  serve o MESMO payload de `/{slug}`, não uma segunda montagem.
- **`GET|PATCH /my-page/reviews(/:id)`** — a tabela do protótipo. O toggle é
  `Review.published`, que já governava a página pública e a média da nota.
- **`showPhotos`/`showBusinessHours` chegaram ao público.** Existiam desde a
  fase 07 e NUNCA eram lidos por `PublicPageService`: o dono desligava e a
  página continuava mostrando. `PublicBarbershop` ganhou `photos: PublicPhoto[]`
  e `sections.photos`/`sections.businessHours`; `businessHours` volta `[]`
  quando desligado.
- **`publicUrl` passou a sair de `urls.publicBooking`** (era `urls.booking`) e
  o erro de slug em uso virou `ErrorCode.SLUG_IN_USE` (era a string solta
  `'SLUG_TAKEN'`, que o front não tinha como reconhecer).
- **Isolamento**: fixture ganhou `reviewId` e `photoId` por tenant; 4 casos
  novos em `full-coverage.isolation-spec.ts` (preview, lista de avaliações,
  despublicar avaliação alheia, remover foto alheia). 86/86 verdes.

### Frontend

- `app/(dashboard)/app/minha-pagina/page.tsx` reescrita na ordem do protótipo:
  Link de agendamento → URL personalizada → Logo e capa → **Fotos** → Sobre →
  Exibir no site → Instagram/Endereço, com a coluna de preview de 380px à
  direita (`xl:grid-cols-[minmax(0,1fr)_380px]`, `sticky`).
- `components/dashboard/my-page/`: `phone-frame.tsx` (o `IOSDevice` do
  protótipo, 320×660, rolando por dentro), `page-preview.tsx`,
  `image-slot.tsx` (upload com validação de tipo/tamanho, drag-and-drop e
  remoção), `reviews-table.tsx` (`ResponsiveTable` → cards < `md`).
- **Autosave** no lugar do botão "Salvar alterações": o protótipo não tem
  botão — os campos chamam `updMp*` no `onChange`. 700ms de debounce, toggles
  salvam na hora, selo "Salvando… / Salvo automaticamente / Alterações não
  salvas" no cabeçalho, e 409 `SLUG_IN_USE` vira erro no próprio campo.
- **`/app/api/revalidate-minha-pagina`** (route handler): `fetchBarbershop`
  marcava `barbershop:{slug}` com ISR de 60s e NINGUÉM invalidava a tag —
  salvar só aparecia em `/{slug}` até um minuto depois. A rota repassa o
  `Authorization` recebido para `GET /my-page` e revalida o slug que a API
  devolver, então ninguém invalida a barbearia alheia.
- `PhotosSection` nova na página pública e o horário de funcionamento agora
  atrás de `sections.businessHours`.

### Verificação

- `pnpm turbo run typecheck lint` limpo no monorepo.
- API: 95 unit + 272 e2e + 86 de isolamento, todos verdes.
- Varredura responsiva: `/app/minha-pagina` ✓ nos 5 tamanhos (360/390/768/
  1024/1440). Fechou a rolagem horizontal de +59px/+30px e os 2 inputs abaixo
  de 44px que estavam anotados como dívida.
- Papel BARBER: 403 em `GET /my-page`, `/preview`, `/reviews`, `PATCH
  /my-page` e `POST /my-page/images/logo` (o item já não aparecia no nav).
- Ponta a ponta no navegador: clicar em "Fotos"/"Horário" no painel muda
  `/barbearia-central` na hora; upload de logo e de foto de galeria gravam,
  aparecem no preview e na página pública, e o estático responde 200 com
  `Cross-Origin-Resource-Policy: cross-origin`.
- Tenant vazio (sem sobre/logo/fotos/avaliações) renderiza a aba inteira sem
  quebrar, com o vazio próprio de cada bloco.

### Desvios deliberados (alimentam as próximas auditorias)

1. **Preview em tema ESCURO, não claro.** O protótipo desenha a página do
   cliente em `#FAF9F7`; o projeto unificou as 4 superfícies no tema de
   produto (README → Design system) e `/{slug}` é escura de verdade. Preview
   claro mostraria uma página que não existe.
2. **Sem o bloco "mapa estático"** do preview (l.2417): é placeholder de um
   mapa que a página pública não tem. O preview não inventa seção.
3. **Card "Fotos" no editor.** O protótipo mostra fotos no preview mas não
   desenha onde enviá-las — um toggle "Fotos" sem galeria não teria o que
   exibir.
4. **Sem paywall.** Confirmado o que a fase 07 já havia decidido: o overlay
   "Disponível no plano Avançado" (l.2319) tem `minhaPaginaLocked: false`
   fixo na l.6990 do protótipo e nunca liga, e `minhaPagina` não está em
   `FEATURE_KEYS` do SPEC. Toda barbearia edita a própria página, em qualquer
   plano — regra 3 do enunciado não se aplica a bloco que o protótipo nunca
   renderiza.

### Dívidas que a aba deixa

- **Driver `local` não escala horizontalmente**: o arquivo fica na máquina que
  recebeu o POST. `docker-compose.prod.yml` mapeia o volume `api-uploads` e
  documenta isso; produção com mais de uma réplica exige trocar para bucket.
- **Sem redimensionamento/otimização de imagem** — o que o dono envia é o que
  a página serve (até 5 MB). Entra junto com o driver de bucket.
- **`next/image` continua fora**: a URL pode ser do storage próprio OU um
  endereço digitado à mão desde a fase 03, e o loader exigiria allowlist de
  domínio. Com o domínio conhecido (bucket/CDN), o `<img>` cru sai.
- **Galeria sem reordenação** — `TenantPhoto.sortOrder` existe e é respeitado,
  mas não há arrastar-e-soltar; a ordem é a de envio.
- ~~**`onboarding.service.ts` continua gravando `logoUrl`/`coverUrl` por URL
  digitada** (passo 3 do wizard)~~ — **RESOLVIDA pelo agente 30**: o passo 3
  usa o `ImageSlot` desta aba e `POST /my-page/images/:slot`, e
  `PUT /onboarding/identity` passou a RECUSAR `logoUrl`/`coverUrl`, para não
  haver segundo caminho de escrita no mesmo campo.

## O que o agente 24 (auditoria da aba Equipe) entregou

Fase 24 ✅. A `/app/equipe` foi reconstruída contra `Dashboard.dc.html`
**l.2023–2239** e o modal de barbeiro (l.2159–2237).

### A tabela de desvios (o passo 1 da fase)

| # | Bloco do protótipo | Existia? | Layout igual? | Botões funcionavam? |
|---|---|---|---|---|
| 1 | Banner de downgrade + "Fazer upgrade" (l.2025) | ❌ | ❌ | ❌ |
| 2 | Pílulas Equipe / Escala semanal / Convites enviados (l.2032) | ⚠️ rótulos "Time/Escala/Convites" | ❌ contador nas 3, o desenho só na 3ª | ✅ |
| 3 | "Barbeiros: X de Y" + barra de uso (l.2043) | ❌ | ❌ | — |
| 4 | "+ Novo barbeiro" no corpo, à direita (l.2050) | ⚠️ na topbar, "Convidar barbeiro" | ❌ | ✅ |
| 5 | Card do barbeiro (l.2054–2087) | ⚠️ | ❌ sem WhatsApp, chips, dias nem comissão | ❌ só um kebab |
| 6 | Matriz barbeiros × 7 dias + ícone de férias (l.2092) | ❌ era 1 barbeiro por vez num `Select` | ❌ | ⚠️ |
| 7 | Linha de convite (l.2121–2147) | ⚠️ era tabela | ❌ | ⚠️ faltava a 3ª ação |
| 8 | Vazio de convites com envelope (l.2149) | ⚠️ | ❌ sem ícone nem o texto do desenho | — |
| 9 | Modal único de barbeiro (l.2159–2237) | ⚠️ eram DOIS modais | ❌ sem foto, TODAS, horários nem link de comissão | ⚠️ |

Zerada ao final: as 9 linhas viraram ✅/✅/✅, com os desvios conscientes
listados adiante.

### Os quatro achados

**1. O downgrade RECUSAVA em vez de desligar.** `SettingsService.changePlan`
respondia 400 com "Desative barbeiros antes de fazer o downgrade" — ou seja,
exigia que o dono desmontasse a equipe na mão para depois poder economizar.
O protótipo desenha o contrário (l.2027): a troca acontece e os excedentes
ficam marcados. Não existia coluna nenhuma para "marcado pelo plano", então
nem o banner nem o selo tinham de onde sair.

**2. O teto do plano não era reconferido no ACEITE.** Convite pendente já
contava na EMISSÃO, mas `InvitesService.accept` não olhava o limite. Dois
convites emitidos com uma vaga sobrando entravam os dois; um downgrade entre
o envio e o aceite também passava batido. Agora a conferência é dentro da
transação do aceite.

**3. Reativar barbeiro furava o teto.** `PATCH /barbers/:id {active:true}` não
passava por gate nenhum — o dono desfazia o efeito de um downgrade com um
clique. Reativar ocupa vaga igual a contratar, e agora responde 403.

**4. WhatsApp digitado pela metade era apagado em silêncio.**
`normalizeMobilePhone` devolve `null` tanto para "campo vazio" quanto para
"número inválido", e o serviço tratava os dois como "grave `null`". Errar um
dígito ao editar zerava o telefone sem avisar. Agora recusa com 400.

### Schema (migration `20260823180000_equipe_auditoria`)

- `Barber.inactiveByPlan` (`boolean`, default `false`) + `CHECK`
  `barber_inactive_by_plan_implies_inactive`: quem está inativo pelo plano é,
  antes de tudo, inativo. A agenda, o booking e a contagem do teto filtram por
  `active` e **não precisam conhecer o motivo** — o motivo só serve à tela e à
  reativação automática.
- `StaffInvite.schedule` (`jsonb`, nulo nos convites antigos): a semana inteira
  montada no modal. `workDays` sozinho perdia entrada, saída e almoço.

### Backend

- `PlanLimitsService` virou o dono da regra de teto, e passou a ser
  **exportado** pelo `TeamModule` — Configurações e Super Admin usam o mesmo
  código na troca de plano em vez de duplicá-lo (agentes 24 e 26 compartilham).
  - `usage()` — a fonte única do "X de Y", da barra e do banner.
  - `assertCanAcceptInvite(tx, …)` — o teto no aceite, dentro da transação.
  - `applyPlanLimit(tx, …)` — desliga do fim da fila para o começo (maior
    `sortOrder` primeiro), **nunca** o barbeiro-dono, e no upgrade reativa só
    quem o PLANO desligou. Quem o dono desativou na mão continua desativado:
    upgrade compra vaga, não desfaz decisão de ninguém.
- `SettingsService.changePlan` e `AdminTenantsService.changePlan` chamam
  `applyPlanLimit` dentro da própria transação da troca.
- `BarberListItem` ganhou `serviceNames`, `commissionRuleId`,
  `commissionLabel` e `inactiveByPlan`. A regra por FAIXAS sai como
  "Por faixas", e não como a primeira faixa: mostrar um número daria a
  impressão de que o barbeiro ganha aquilo sempre. Sem regra sai `null` — a
  tela escreve "Sem regra", e não um `0%` que seria mentira.
- `PATCH /barbers/:id` aceita `avatarUrl` e `schedule`. A semana é validada
  INTEIRA antes de qualquer escrita (fim depois do início, almoço coerente e
  **dentro** do expediente): meia semana salva e meia recusada deixaria a
  escala num estado que ninguém pediu.
- `POST /team/invites/:id/link` reemite o token e devolve a URL sem mandar
  e-mail — ver adiante.

### "Simular cadastro concluído" virou "Gerar link de cadastro"

A terceira ação da linha de convite (l.2145) era o atalho de DEMONSTRAÇÃO do
protótipo. Fingir o aceite criaria um `Membership` que ninguém pediu, o que a
regra 2 do enunciado proíbe. Ela ficou na mesma posição e com o mesmo peso
visual, fazendo a coisa real: reemitir o link do `CadastroFuncionario` para o
dono concluir o cadastro com o barbeiro ao lado. O token vive em hash, então
não é recuperável — é reemitido, e o anterior morre na hora (a tela avisa).

### A matriz da escala é de LEITURA, e a semana tem data

No desenho não há campo editável na matriz; clicar numa célula abre o mesmo
modal do "Editar" do card, para a escala ter **um** lugar de edição em vez de
dois que podem discordar.

O ícone de férias (l.2110) sai das `ScheduleException` que caem dentro da
semana mostrada — por isso o cabeçalho diz "Semana de X a Y". Uma matriz de
"dias da semana" sem data não teria como marcar férias nenhuma. O desenho
também não desenha por onde a folga é cadastrada, então a visão ganhou um
botão "Registrar folga ou férias" — sem ele a coluna nunca se preencheria.

### Frontend

- `app/(dashboard)/app/equipe/page.tsx` reescrita: pílulas com `?tab=`
  (mesmo padrão do catálogo), banner de downgrade, "Barbeiros: X de Y" com
  barra (vermelha ao encostar no teto; sem barra no plano ilimitado, porque
  barra sem teto não representa nada) e "+ Novo barbeiro" no corpo.
- `components/dashboard/team/`: `barber-card.tsx`, `week-schedule-matrix.tsx`,
  `invite-row.tsx`, `schedule-exception-modal.tsx` e `barber-modal.tsx`
  (unificado). `invite-modal.tsx` e `work-schedule-editor.tsx` foram
  **removidos** — o modal único cobre os dois casos, como no desenho.
- O modal é UM só para os dois modos: "+ Novo barbeiro" emite convite
  (`POST /team/invites`), "Editar" faz `PATCH /barbers/:id` com dados,
  serviços e semana na MESMA requisição. O e-mail trava na edição de quem já
  tem login — trocá-lo trocaria o login do barbeiro por baixo.
- `?barbeiro=` na Agenda é o contrato do "Ver agenda" do card (mesmo padrão do
  `?cliente=` que o agente 16 criou).
- `useUpdateWorkScheduleMutation` saiu do front (o modal salva por `PATCH`);
  o `PUT /barbers/:id/work-schedule` continua no contrato e coberto pelo
  isolamento.

### Seeds

`BARBERS` ganhou `phone` (faixa 9880xxxx, separada da dos clientes 9876xxxx):
o card do protótipo mostra o WhatsApp sob o nome, e sem o dado os cinco cards
do tenant demo abriam com "Sem WhatsApp cadastrado".

### Testes

- `test/team.e2e-spec.ts` (13 casos): rótulos do card, teto contando convite
  pendente na emissão E no aceite, downgrade marcando excedentes, upgrade
  devolvendo só quem o plano desligou, reativação barrada por 403, semana
  salva junto com o resto do modal, almoço fora do expediente recusado sem
  gravar nada, WhatsApp quebrado recusado, e o `BARBER` fora das três rotas.
- 8 casos novos na suíte de isolamento (`full-coverage`), incluindo o mais
  sensível: `POST /team/invites/:id/link` do tenant B, onde um 200 entregaria
  um token de cadastro válido dentro do outro tenant. O fixture ganhou
  `staffInviteId`.
- Varredura responsiva: as três visões entraram no `responsive-sweep.mjs` e
  passam nos 5 tamanhos (15/15), sem rolagem horizontal e com alvo ≥ 44px.

### Conferido no navegador

Tenant demo cheio (5 barbeiros, 1 convite pendente), tenant recém-registrado
(1 barbeiro, sem serviço, sem convite — a aba inteira renderiza com os estados
vazios próprios), papel `BARBER` (a aba some do menu e a URL direta mostra a
mensagem restrita, sem bloco de erro), e o cenário de downgrade forçado, com o
banner citando o barbeiro pelo nome e a barra em "2 de 2" vermelha.

## O que o agente 23 (auditoria da aba Serviços & Produtos) entregou

Fase 23 ✅. A `/app/servicos-produtos` foi reconstruída contra
`Dashboard.dc.html` **l.1723–2022** e o modal de serviço (l.1949–2016).

### A tabela de desvios (o passo 1 da fase)

| # | Bloco do protótipo | Existia? | Layout igual? | Botões funcionavam? |
|---|---|---|---|---|
| 1 | Barra de 3 sub-abas (l.1725) | ⚠️ só 2 | ❌ tinha contadores que o desenho não tem | — |
| 2 | `+ Novo serviço` à direita (l.1733) | ⚠️ | ❌ estava na topbar, não no corpo | ✅ |
| 3 | Tabela de serviços, 6 colunas (l.1737) | ⚠️ tinha 4 | ❌ | — |
| 4 | Kebab `Editar`/`Excluir` (l.1766) | ⚠️ | ❌ | ❌ `Excluir` não existia |
| 5 | Tabela de produtos, 7 colunas (l.1786) | ⚠️ tinha 4 | ❌ | — |
| 6 | Kebab `Repor estoque`/`Excluir` (l.1815) | ❌ | ❌ | ❌ nenhum dos dois |
| 7 | Paywall da calculadora (l.1836) | ❌ na aba | ❌ | ❌ |
| 8 | "Custos e parâmetros" (l.1858) | ❌ | ❌ | ❌ |
| 9 | KPIs rateio + preço mínimo (l.1910) | ⚠️ só o preço | ❌ | — |
| 10 | Ponto de equilíbrio com barra (l.1922) | ❌ | ❌ | ❌ |
| 11 | Simulação de lucro (l.1935) | ❌ | ❌ | ❌ |
| 12 | Modal de serviço (l.1949) | ⚠️ | ❌ | ⚠️ |

Zerada ao final: as 12 linhas viraram ✅/✅/✅, com os desvios conscientes
listados adiante.

### Os quatro achados

**1. A calculadora de preço estava na aba errada — e era o desenho, não o
dado.** O protótipo desenha a calculadora como a TERCEIRA sub-aba do catálogo
(l.1856). A implementação tinha uma aba "Calculadora de preço" em
**Configurações** — uma aba que o protótipo não tem — com um `POST
/settings/price-calculator` sem estado: cinco campos, um botão "Calcular", um
número, nada persistido. Pior: os valores iniciais do formulário eram os do
protótipo hardcodados (`fixos = '3459'`, que é `2500+450+120+89+300` da fixture
l.4762; `atendimentos = '480'`; `comissao = '40'`). A regra 1 do enunciado
proíbe exatamente isso, e aqui ela estava violada dentro de um `useState`.

**2. Serviço não tinha cor nem comissão no schema.** O protótipo pinta uma
bolinha colorida ao lado do nome e cobra uma coluna "Comissão padrão"; o
`Service` do Prisma não tinha nenhuma das duas. A tabela na tela mostrava 4
colunas onde o desenho mostra 6, e as duas que faltavam eram justamente as que
não tinham de onde sair.

**3. "Excluir" não existia em lugar nenhum do catálogo.** Nem para serviço, nem
para produto. Só havia `activate`/`deactivate`. "Repor estoque", o outro item
do kebab de produto, também não existia — o estoque só descia (fechamento de
comanda) e nunca subia por dentro do produto.

**4. O "Ativo" era um selo, não um interruptor.** No desenho é um toggle na
linha: um clique tira o serviço do site. A implementação mostrava um `Badge`
"Ativo"/"Inativo" e escondia a ação dentro do kebab — a operação mais
frequente da tela custava dois cliques e uma descoberta.

### Schema (migration `20260823120000_catalogo_auditoria`)

- `Service.color` (`text?`) e `Service.commissionBps` (`int?`, `CHECK` 0–10000).
- `PriceCalculatorConfig` (1:1 com o tenant) — custo variável, comissão média,
  atendimentos/mês, margem, preço praticado. `CHECK price_calc_ranges` grava no
  banco as faixas dos dois sliders do protótipo (100–1200 e 0–60%).
- `PriceCalcFixedCost` (N por tenant) — a lista "Custos fixos mensais". Linha
  própria, e não `Json`: o dono renomeia, remove e reordena item a item.

### Backend

- `DELETE /services/:id` e `DELETE /products/:id` — **soft-delete**, com o nome
  carimbado para liberar o `@@unique([tenantId, name])` (senão o dono não
  recadastraria "Corte Masculino" depois de excluí-lo). Cada um recusa quando o
  estrago seria real: serviço com agendamento FUTURO (409, com "desative" na
  mensagem) e produto com estoque > 0 ou item em comanda ABERTA.
- `POST /products/:id/restock` — `increment`, nunca `SET` absoluto: duas
  reposições simultâneas perderiam uma. O protótipo repunha para
  `estoqueMin + 10`, um número que ninguém escolheu; agora a quantidade é de
  quem está guardando a mercadoria.
- `GET|PUT /price-calculator` — `@RequireFeature('calculadoraPreco')` no
  **controller inteiro**. A LEITURA é gated também, porque no desenho o cadeado
  está na aba, não num botão de calcular.
- `ServiceListResponse` ganhou `defaultCommissionBps` no envelope, e cada linha
  ganhou `color`/`commissionBps`/`effectiveCommissionBps`. `ProductListItem`
  ganhou `marginBps` (`null` sem custo — dividir por zero na tela daria
  "Infinity%").
- `CommissionCalcService.recordServiceEntry` passou a receber `serviceId` e a
  honrar `Service.commissionBps`: o override do serviço vence a faixa/regra do
  barbeiro. O acumulado do mês continua somando o serviço — o faturamento do
  barbeiro é um só.
- `/settings/price-calculator` foi **removido** (controller, service, DTO,
  tipos e a aba de Configurações que o consumia).

### A fórmula mora em um lugar só

`computePriceCalculator` é uma **função pura em `@barbervp/types`**, importada
pela API e pela página. Os dois sliders precisam de resposta imediata (o front
recalcula a cada pixel) e o valor gravado precisa ser autoritativo (o gate é
server-side). Duas implementações da mesma fórmula divergiriam no primeiro
arredondamento; esta é a única, e o e2e compara a resposta da API com ela.

### Os valores iniciais saem do tenant, não do protótipo

No primeiro acesso o `PriceCalculatorService` deriva a **comissão média** das
`CommissionRule` ativas, os **atendimentos/mês** dos `Appointment` `DONE` dos
últimos 30 dias (com clamp na faixa do slider, para uma barbearia nova não
abrir travada num valor que o controle não representa) e o **preço praticado**
da média do catálogo. A lista de custos fixos começa **vazia**, com estado
vazio próprio: não há de onde deduzir o aluguel de alguém, e inventá-lo daria
um preço mínimo convincente e falso. Os seis custos do protótipo entraram no
**seed demo** (`DEMO_PRICE_CALC_FIXED_COSTS`), que é o lugar deles.

### Frontend

- `app/(dashboard)/app/servicos-produtos/page.tsx` reescrita: 3 sub-abas com
  `?tab=` (o sino da home aponta para `?tab=produtos`), pílulas feitas à mão em
  vez de `<Tabs>` para o cadeado caber no rótulo **sem** desabilitar a aba,
  tabela de serviços com bolinha de cor / comissão efetiva / toggle "Ativo", e
  tabela de produtos com estoque + selo `Repor`, mínimo, custo, venda e margem.
- `catalog/service-modal.tsx` reescrito: stepper de duração ±5, Preço +
  Comissão padrão lado a lado, toggle de comissão específica, os 6 swatches de
  cor e a lista de barbeiros com iniciais.
- `catalog/restock-modal.tsx` e `catalog/price-calculator.tsx` novos.
- `MinusIcon`, `TrashIcon` e `BoxIcon` portados para `packages/ui` a partir dos
  paths do protótipo.
- **Invalidação de cache**: salvar serviço invalida `services`, `staff-agenda`
  (+ `-month`/`-detail`), `pos-catalog`, `orders` e `barbers` — mudar duração
  ou preço muda a grade da agenda e o preço que o balcão puxa. Produto invalida
  ainda `dashboard-notifications` e `dashboard-overview`, para repor estoque
  apagar o alerta do sino na mesma hora. (O booking público não entra: é SSR,
  lê o banco a cada requisição.)

### Desvios conscientes do protótipo (e por quê)

- **"Comissão padrão" no modal virou leitura.** No desenho é um `input` por
  serviço que abre em 40% para todos e nunca salva. Editável, seriam dois
  campos de percentual na mesma ficha disputando o mesmo significado. Aqui ele
  mostra a regra da casa (definida em Comissões, um lugar só) e o toggle
  "Comissão específica" — que no protótipo descartava o valor — é o que grava.
- **A sub-aba Produtos ganhou `+ Novo produto`.** O desenho não desenha esse
  botão, e também não desenha nenhum outro caminho para cadastrar um produto:
  uma barbearia nova ficaria com a lista permanentemente vazia.
- **`Repor` acende em `stock <= estoqueMin`, não em `<`.** O protótipo usa `<`
  no selo, mas o sino da home diz "está no estoque mínimo", que exige `<=`. Com
  `<` os dois blocos discordariam sobre o produto que acabou de encostar no
  mínimo — e encostar no mínimo é a hora de repor. Um caso de e2e trava os dois
  no mesmo predicado.
- **Margem negativa sai em vermelho.** O protótipo pinta a coluna inteira de
  `#3FB68B`; vender abaixo do custo passaria por lucro.
- **Ponto de equilíbrio inexistente ganhou explicação.** O desenho mostra "—" e
  uma barra vazia quando a contribuição marginal é ≤ 0. Um traço não conta que
  o preço praticado não paga nem a comissão do corte.
- **A calculadora tem "Salvar".** O protótipo não salvava nada, então também
  não tinha o botão.

### Papéis

`BARBER` não vê o item no nav (já era assim) e, chegando pela URL, vê uma
mensagem clara em vez de três blocos de erro genérico com um "Novo serviço" que
só sabe devolver 403. As rotas novas (`DELETE`, `restock`, `price-calculator`)
entraram no caso de papel da suíte de isolamento.

### Estados e responsividade

Skeleton na altura da tabela (sem empurrar layout), erro POR BLOCO com "Tentar
de novo" (a sub-aba não derruba a página), e estado vazio próprio em cada uma
das três — inclusive na lista de custos fixos. Tenant recém-registrado abre as
três sub-abas sem quebrar. Varredura responsiva: **15/15 verdes**
(3 sub-abas × 360/390/768/1024/1440), sem rolagem horizontal; tabelas viram
cards abaixo de `md`. Os swatches de cor ganharam alvo de 44px com a bolinha
de 26px desenhada dentro — no protótipo o alvo É a bolinha, o que no celular
vira um botão de 26px que ninguém acerta.

### Testes

`test/catalog.e2e-spec.ts` novo — 21 casos. Além do CRUD, travam: o
soft-delete preservando o agendamento passado, os dois 409, o nome liberado
para recadastro, a margem `null` sem custo, o `increment` da reposição, o
alerta do sino contando os mesmos produtos do selo, a comissão específica
chegando no `CommissionEntry` (70% do serviço, não 40% da regra) e a
calculadora gated na leitura e na gravação. `src/catalog-admin/price-calculator.spec.ts`
cobre a fórmula pura (7 casos, incluindo o piso do divisor e o ponto de
equilíbrio inexistente). Isolamento: 4 casos novos.

**Suíte: 95 unit · 259 e2e · 153 isolamento — toda verde.**

### Achados fora do escopo (para os agentes donos)

- **`/app/equipe` @ 360/390** — rolagem horizontal (+77px) na barra de
  sub-abas e três `button` de 36px de altura (Time/Escala/Convites).
- **`/app/configuracoes` @ 360/390** — cinco `input` abaixo de 44px
  (dois 42×44, dois 117×36, um 42×44).
- **`/app/minha-pagina` @ 360/390** — rolagem horizontal (+59px em 360, +30px
  em 390) e dois `input` de 40px de altura.

Nenhum dos três foi tocado: são de outras abas, com agentes próprios.

### Dívidas do agente 23

- **Reposição de estoque não gera lançamento financeiro.** Repor mercadoria é
  uma compra, e o protótipo não desenha isso em lugar nenhum. Fica como
  `AuditLog` e nada mais — quem for auditar a aba Financeiro decide se o
  `AccountPayable` deve nascer daqui.
- **Regra de comissão por FAIXAS na coluna "Comissão padrão".** Faixa depende
  do faturamento acumulado do barbeiro no mês, que a tela do catálogo não
  conhece; a coluna mostra a faixa mais baixa como piso. O cálculo real segue
  correto no fechamento.
- **`Service.color` não é lido pela agenda ainda.** A coluna existe, o seed
  planta e a tabela mostra, mas os blocos de `components/dashboard/agenda/`
  continuam colorindo por status. É trabalho do agente da aba Agenda (o 15,
  cujo registro segue em aberto).
- **A lista de custos fixos não importa de Contas a Pagar.** Seria a evolução
  natural (o dono já cadastrou aluguel e energia lá), mas está fora do desenho.

## O que o agente 22 (auditoria da aba WhatsApp) entregou

Auditoria 1:1 da aba **WhatsApp** (`/app/whatsapp`) contra
`Dashboard.dc.html` l.1624–1722 e os dois modais pendurados nela: "Editar
mensagem" (l.4285) e "Enviar reativação em massa" (l.4318).

> **A decisão que define a fase.** O protótipo desenha um pareamento por QR
> code ("🟢 Conectado como (54) 9 9918-8533", com um toggle "Demonstração:
> conectado" e um QR gerado por fórmula — `qrCells`, l.6044). Isso é
> cenografia: o toggle existe para o revisor ver os dois estados, e o QR não
> codifica nada. Enquanto o `NOTIFICATION_ADAPTER` estiver no driver mock, o
> card diz "Modo de demonstração" e mostra a trilha REAL (quantas mensagens já
> foram para o outbox). Fingir um número pareado seria a única mentira possível
> numa tela cujo assunto é justamente se as mensagens saem.

### A tabela de desvios (o passo 1 da fase)

| Bloco do protótipo | Existia? | Layout igual? | Botões funcionavam? | Ação |
|---|---|---|---|---|
| Card "Conexão com WhatsApp" (l.1626) | ❌ | — | — | Criado + `GET /whatsapp-config/connection` |
| Estado conectado / QR + 3 passos (l.1636–1656) | ❌ | — | — | Estado honesto do adapter no mesmo slot (ver decisão acima) |
| Card "Automações" — UMA lista, 6 linhas com `border-bottom` (l.1659) | ⚠️ grid de 6 cards 2-col | ❌ | parcial | Reconstruído como lista num painel só |
| Ordem lembrete→confirmação→cancelamento→aniversário→reativação→avaliação | ❌ ordem do `findMany` | ❌ | — | `WHATSAPP_EVENT_ORDER` ordena no servidor |
| Link "editar mensagem" → modal (l.1667) | ❌ textarea inline + "Salvar template" | ❌ | sim, mas errado | Link + modal do protótipo |
| Lembrete: `Enviar [1h/3h/24h/48h] antes` | ❌ input de texto livre | ❌ | — | `<select>` com `options` da API |
| Aniversário: `às [HH:MM]` | ❌ | ❌ | — | `<input type=time>`, persiste em `offsetMinutes` |
| Reativação: `Após [15/30/45/60] dias` | ❌ | ❌ | — | `<select>`; é a janela da faixa dourada |
| 🔒 no título + toggle `not-allowed` sem plano (l.6023) | ⚠️ cadeado solto, toggle clicável | ❌ | abria upsell só DEPOIS do 403 | Cadeado antecipado; toggle trancado abre upsell |
| Os 6 eventos sempre presentes | ❌ **tenant novo = bloco vazio** | — | — | `list()` com padrão de fábrica; `update()` virou upsert |
| Faixa dourada "N clientes inativos há 30+ dias" (l.1688) | ❌ | — | — | Criada + `GET /whatsapp-config/reactivation` |
| Botão "Enviar mensagem de reativação agora" | ❌ | — | — | Criado + `POST .../reactivation/send` com 403 server-side |
| Tabela "Histórico de envios" (l.1695) | ❌ | — | — | Criada + `GET /whatsapp-config/history` sobre o `NotificationOutbox` |
| Status ✓✓ Entregue / ✓ Enviado / ⚠ Falhou (l.6071) | ❌ | — | — | Derivado de `OutboxStatus` + `sentAt` |
| Modal "Editar mensagem" com chips no cursor e preview (l.4285) | ❌ | — | — | Criado |
| Modal "Enviar reativação em massa" (l.4318) | ❌ | — | — | Criado |
| `?evento=REACTIVATION` / `?evento=BIRTHDAY` do Dashboard | ❌ **ignorado** | — | ❌ | Lidos; evento trancado abre o upsell, não o editor |
| Cadeado do nav: WhatsApp NÃO é trancado | ✅ | ✅ | ✅ | — |
| `BARBER` não tem a aba | ✅ | ✅ | ✅ | Coberto por teste |
| Loading / vazio / erro por bloco | ❌ um `Skeleton` genérico | ❌ | — | Esqueleto na altura real, vazio próprio e retry local por bloco |
| `<h1>WhatsApp</h1>` acima do conteúdo | ⚠️ existia, o protótipo NÃO tem | ❌ | — | Removido |

Ao final da fase, zerada.

### O conflito interno do protótipo (fica registrado, não foi "resolvido")

`LOCKED_AUTOMACOES` (l.6015) inclui `cancelamento` entre os eventos trancados,
mas o `FEATURE_LABELS` do MESMO arquivo (l.4370) descreve o recurso como
"WhatsApp completo (aniversário, reativação, avaliação)" e os bullets do
upgrade modal desta aba (l.6035) repetem exatamente esses três. Dois sinais
contra um. **Mantivemos `CANCELLATION` no básico** — é também o contrato que o
servidor já tinha e o que o e2e da fase 07 cobria. Se o produto quiser o
cadeado no cancelamento, é uma linha em `WHATSAPP_BASIC_EVENTS`
(`packages/types/src/whatsapp-config.ts`) e dois casos de teste.

### Backend

- **`GET /whatsapp-config` devolve `{ items, sample }`, não mais um array.**
  Único consumidor é esta aba. `items` traz os SEIS eventos sempre, na ordem do
  desenho, com padrão de fábrica (`WHATSAPP_DEFAULT_TEMPLATES` /
  `WHATSAPP_DEFAULT_OFFSET_MINUTES`) para quem nunca configurou — **a leitura
  não escreve nada**, a linha nasce no primeiro `PATCH`.
- **`PATCH` virou `upsert`.** Antes era `update` + `notFound`, e como o
  `register` da fase 03 nunca criou as linhas, toda barbearia nova via a aba
  vazia e não conseguia sair do lugar.
- **`offsetMinutes` ganhou unidade por evento** (`WHATSAPP_CONTROL`): o mesmo
  campo carrega antecedência, hora do dia e janela de inatividade. As opções
  aceitas viajam na resposta (`options`) e são validadas no servidor — mandar
  7h de antecedência é 400, e o `<select>` da tela nunca fica sem opção
  correspondente selecionada.
- **A janela da reativação é a da automação, não 30 dias fixos.** A faixa
  dourada conta pelo `offsetMinutes` do evento `REACTIVATION`; mexer no
  `<select>` muda a contagem. É a mesma pergunta feita uma vez só.
- **O corpo do disparo em massa sai do TEMPLATE, não do `preview`.** O preview
  já teve `{barbeiro}`/`{servico}` resolvidos com o exemplo da casa; mandar
  isso ao cliente diria o serviço errado para quase todo mundo. Só `{nome}` é
  trocado, cliente a cliente.
- **O gate cobre a linha inteira.** Editar o template de uma automação fora do
  plano também é 403 — senão o dono ajusta a mensagem de aniversário e fica
  achando que comprou o recurso.
- **`GET /whatsapp-config/history` é do TENANT.** `/admin/outbox` já existia,
  mas é do super admin e cruza todas as barbearias. O nome do cliente sai de
  UMA consulta a mais sobre os telefones da página (nunca N+1), porque o
  `NotificationOutbox` guarda o destino e não o `clientId` — ele também serve a
  mensagens de quem ainda não é cliente. **Telefone sem cliente na base sai
  mascarado**: a tela não é lugar de despejar número inteiro.
- **`eventOf` aceita três formatos de `templateKey`** que já convivem no
  outbox: `appointment.reminder` (fase 07), `whatsapp.reactivation` (esta aba)
  e o nome cru do evento (`CONFIRMATION`), que é o que o seed de demonstração
  grava.
- **Fonte única de template padrão.** O `FALLBACK_TEMPLATES` local do
  `BookingNotificationsService` foi trocado por `WHATSAPP_DEFAULT_TEMPLATES`:
  duas cópias divergiriam no primeiro ajuste de texto, e a mensagem ENVIADA
  deixaria de ser a que o dono leu na tela.
- **Nenhuma chamada externa.** Tudo passa pelo `NOTIFICATION_ADAPTER`; com o
  driver mock cada mensagem vira uma linha no `NotificationOutbox` e reaparece
  no "Histórico de envios" logo abaixo. É o que torna a aba verificável sem
  provedor nenhum ligado.

### Frontend

- A ordem dos blocos é a do desenho: conexão → automações → faixa de reativação
  → histórico. **Cada bloco tem consulta, esqueleto e retry próprios** — o
  histórico cair não leva as automações junto.
- **A pré-visualização usa dado REAL do tenant.** O protótipo resolve o balão
  com um cliente inventado (`SAMPLE`, l.6053: "João Pedro", "Corte + Barba",
  "Diego"). O `sample` do servidor sai de um serviço do catálogo, de um
  barbeiro da equipe, de um cliente da base e do link público de verdade.
  Barbearia recém-cadastrada não tem nada disso: aí o placeholder fica visível,
  que é honesto — não há o que pré-visualizar.
- **A faixa dourada some quando não há ninguém inativo.** O protótipo a desenha
  como alerta, e alerta de "0 clientes" é ruído.
- **O "Desconectar" (l.1639) não foi renderizado.** Só existe com provedor real
  do outro lado, e o endpoint que o desfaria nasce junto com ele; um botão
  desligado ali seria decoração (regra 2).
- **O modal do editor usa `className="md:w-[720px]"`** — é a largura do diálogo
  no protótipo (l.4287). Com os 480px padrão do `Modal`, os chips quebram em
  três linhas e o preview fica espremido.
- **O alvo de toque do interruptor.** O trilho do protótipo tem 44×22 e
  reprovava a varredura no celular. O `Switch` compartilhado ficou intocado (é
  de todas as abas): aqui ele vai dentro de um `<label>` de 44×44, que é o que
  a `responsive-sweep` mede quando o checkbox tem rótulo associado.

### Seeds

`WHATSAPP_TEMPLATES` ganhou `offsetMinutes` real em BIRTHDAY (9×60 = 09:00) e
REACTIVATION (30×1440 = 30 dias), que antes eram `null` — sem isso o
`<input type=time>` e o `<select>` da tela mostrariam o padrão de fábrica em
vez do que a barbearia demo tem configurado.

### Testes

- `apps/api/test/whatsapp.e2e-spec.ts` — **14 casos novos**: tenant sem
  configuração alguma, `sample` de dado real, upsert, opção inválida (400),
  evento inexistente (400), gate do Essencial na leitura/no template/no
  disparo, `BARBER` 403 nas quatro rotas, driver mock na conexão, contagem por
  janela + `skipped` de quem recusou, e o envio reaparecendo no histórico.
- `full-coverage.isolation-spec.ts` — 4 casos novos: a linha criada pelo upsert
  nasce no tenant certo; o histórico de A não traz a mensagem de B; o disparo
  em massa de A não alcança cliente de B; a conexão de A conta só o outbox de A.
  A fixture ganhou uma linha de `NotificationOutbox` por tenant.
- **Um teste antigo foi corrigido, não afrouxado**: o caso de isolamento de
  WhatsApp mandava `offsetMinutes: 120`, que a validação nova (correta) recusa —
  2h não é uma das opções do desenho. Passou a mandar 180 (3h).
- Suíte: **88 unit · 238 e2e · 148 isolamento**, tudo verde.
- `responsive-sweep --app=dashboard`: `/app/whatsapp` ✅ nos 5 tamanhos, sem
  erro de console. Continuam vermelhas `/app/configuracoes` e
  `/app/minha-pagina` — **não foram tocadas**, são dos agentes 25 e 26.

## O que o agente 21 (auditoria da aba Fidelidade) entregou

Auditoria 1:1 da aba **Fidelidade** (`/app/fidelidade`) contra
`Dashboard.dc.html` l.1497–1623, o modal `modalNewPlano` (l.3323, modos em
l.3364) e os dois diálogos pendurados nele: "Impacto nos assinantes" (l.3376) e
"Excluir plano" (l.3384).

> **A decisão que define a fase.** O protótipo foi editado antes desta sessão
> para deixar SOMENTE a sub-aba Assinaturas (`isLoyaltyAssinaturas`, l.1523):
> "Pontos" e "Sorteios" saíram do desenho. O enunciado manda **remover da
> implementação, não completar** — e foi o que se fez, inclusive no backend.

### A tabela de desvios (o passo 1 da fase)

| Bloco do protótipo | Existe? | Layout igual? | Botões funcionam? | Ação |
|---|---|---|---|---|
| Sub-aba única "Assinaturas" (l.1501) | ✗ — havia 3 sub-abas (Pontos/Sorteios/Assinaturas) | ✗ | — | Removidas Pontos e Sorteios; sobrou o título "Assinaturas" |
| Paywall INLINE "Disponível no plano Avançado" (l.1503) | ~ — existia, mas atrás do gate errado | ~ | ✓ | Gate passou a ser `fidelidadeAssinaturas` na aba INTEIRA |
| Botão "+ Novo plano" (l.1525) | ✓ | ✓ | ✓ | — |
| Grid de cards `auto-fit minmax(260px)` (l.1527) | ~ — grid fixo 1/2/3 colunas | ✗ | — | Trocado pelo `auto-fit` do desenho |
| Card: selo "Arquivado" + opacidade 0.6 (l.1533) | ✗ — arquivado sumia da lista | ✗ | — | `listPlans` passou a trazer arquivados, no fim |
| Card: preço `R$ x/mês` em ouro 22px (l.1537) | ~ | ✗ | — | Tipografia e cor do desenho |
| Card: "N assinantes" + **MRR** (l.1540) | ✗ — MRR não existia | ✗ | — | `mrrCents` novo, calculado no servidor |
| Card: botão "Editar" (l.1549) | ✓ | ✓ | ✓ | — |
| Card: botão "Reativar" no arquivado (l.1544) | ✗ | ✗ | ✗ | `PATCH /plans/:id/reactivate` criada |
| Tabela de assinantes, 6 colunas (l.1553) | ~ — 4 colunas | ✗ | — | Reconstruída com as 6 |
| Coluna "Usos no mês" com barra (l.1571) | ✗ — texto corrido `Corte 3/4 · Barba 1/2` | ✗ | — | `usedTotal`/`quotaTotal` + a barrinha de 70px |
| Coluna "Pagamento" Pago/Pendente/Atrasado (l.1580) | ✗ — mostrava `ACTIVE`/`PAST_DUE` cru | ✗ | — | `paymentStatus` derivado, com as cores do desenho |
| Coluna "Próxima cobrança" (l.1581) | ✗ | ✗ | — | `nextChargeAt` já vinha da API, faltava a coluna |
| Menu ⋯ da linha: Pausar / Cancelar (l.1583) | ✗ | ✗ | ✗ | Duas rotas novas + "Retomar" (ver desvios conscientes) |
| Modal `modalNewPlano` (l.3323) | ~ | ✗ | ~ | Refeito: título e CTA por modo, "Excluir plano" no rodapé |
| Modal: "Dia de cobrança", 28 opções (l.3355) | ~ — `input type=number` | ✗ | ✓ | Virou `select` de 1 a 28, com `@Max(28)` no DTO |
| Diálogo "Impacto nos assinantes" (l.3376) | ✗ | ✗ | ✗ | Criado — só dispara se preço/serviços mudaram e há assinante |
| Diálogo "Excluir plano" com 2 variantes (l.3384) | ✗ — só existia "Arquivar" solto no card | ✗ | ✗ | Criado; `DELETE /plans/:id` nova, com 409 quando há histórico |
| Sub-aba "Pontos" | ✗ no desenho, ✓ na implementação | — | — | **Removida** (tela, hooks e `GET /loyalty/clients`) |
| Sub-aba "Sorteios" + `modalNewSorteio` (l.3414) | ✗ no desenho, ✓ na implementação | — | — | **Removida** (tela, modal, hooks, rotas e seed) |
| Cadeado do item no nav | ~ — apontava para `fidelidadePontos` | — | — | Passou a `fidelidadeAssinaturas` |
| Item "Fidelidade" no nav do BARBER | ✗ no `DashboardFuncionario` (l.1612), ✓ na implementação | — | — | Restrito a OWNER/MANAGER |

Ao final da sessão a tabela está **zerada**.

### Os quatro achados

1. **A aba inteira estava trancada pelo gate errado.** O item do nav acendia o
   cadeado por `fidelidadePontos` (Profissional) e a sub-aba de Assinaturas por
   `fidelidadeAssinaturas` (Avançado). Com Pontos fora do desenho, o único
   conteúdo da aba é do Avançado — um tenant Profissional via a aba "aberta" no
   menu e o paywall só depois de entrar. Gate unificado em
   `fidelidadeAssinaturas`, no nav e na tela.

2. **Metade dos botões do desenho não tinha endpoint.** "Reativar", "Excluir
   plano", "Pausar" e "Cancelar" existem no protótipo; no produto, nenhum deles
   existia. Entraram quatro rotas. O par pausar/cancelar **delega ao
   `ClientSubscriptionService` da fase 05** de propósito: a regra de retomada
   (ciclo vencido reinicia, ciclo vivo só destrava) e a de cancelamento (perde
   os usos, sem estorno) não podem divergir conforme quem clicou.

3. **Excluir um plano é quase sempre errado, e a tela não sabia disso.** O
   `ClientSubscription` tem FK obrigatória para o `ClientPlan`: apagar um plano
   com histórico apagaria a assinatura junto. O protótipo já resolve isso
   trocando o CTA do diálogo por "Arquivar plano"; faltava o servidor concordar.
   Agora `canDelete` vem calculado (zero assinaturas, **canceladas inclusive**) e
   o `DELETE` devolve 409 quando não pode.

4. **A coluna "Pagamento" não tinha de onde sair.** O desenho pede
   Pago/Pendente/Atrasado; o banco só tem `SubscriptionStatus`
   (ACTIVE/PAST_DUE/PAUSED/CANCELED), que é outra coisa. A situação de pagamento
   passou a ser derivada do `Payment` do ciclo corrente cruzado com o
   `nextChargeAt` (`paymentStatusOf`, com teste unitário próprio) — e o seed
   demo ganhou um assinante em cada estado, porque um seed com os três
   "Pendente" não exercita a tela.

### Backend

- `loyalty.service.ts` reescrito. Saíram `clientBalances`, `listRaffles`,
  `createRaffle`, `announceRaffle` e `drawRaffle`; entraram `reactivatePlan`,
  `deletePlan`, `pauseSubscriber`, `resumeSubscriber`, `cancelSubscriber` e a
  função pura `paymentStatusOf`.
- `listPlans` ganhou `mrrCents` (preço × assinantes que **faturam** — ACTIVE e
  PAST_DUE; pausado não entra) e `canDelete`, e passou a ordenar
  `active desc, sortOrder asc` para o card arquivado cair no fim.
- `upsertPlan` ganhou três recusas que antes viravam 500 ou dado torto: serviço
  repetido no mesmo plano, contagem de serviços por `length` em vez de `Set`
  (deixava passar id duplicado) e **nome repetido**, que batia na
  `@@unique([tenantId, name])` e subia como erro de chave.
- `billingDay` ganhou `@Max(28)` — o `select` do modal tem 28 opções porque o
  dia 29+ não existe em fevereiro, e o DTO aceitava 31.
- `ClientSubscriptionService.pause/resume/cancel` ganharam um 4º parâmetro
  opcional `actorUserId`. Sem ele o log registra `actorClientId` (cliente na
  `MinhaConta`), com ele registra `actorUserId` (dono no painel) — as duas
  portas da mesma operação ficam distinguíveis na auditoria.
- `AuditAction`: saíram `RAFFLE_CREATED`/`RAFFLE_DRAWN`, entraram
  `CLIENT_PLAN_REACTIVATED`/`CLIENT_PLAN_DELETED`.
- `LoyaltyModule` passou a importar `ClientAccountModule`.

### Frontend

- `app/(dashboard)/app/fidelidade/page.tsx` reescrita: uma tela só, cards
  `auto-fit` e a tabela de 6 colunas com menu por linha.
- `components/dashboard/loyalty/client-plan-modal.tsx` refeito com os dois
  modos e os dois diálogos de confirmação; `raffle-modal.tsx` **apagado**.
- `components/booking/minha-conta/confirm-dialog.tsx` promovido a
  `components/shared/confirm-dialog.tsx` — o mesmo diálogo serve os quatro
  confirmes desta aba e os quatro da área do cliente.
- `lib/dashboard/api/loyalty.ts` enxugado: sumiram os cinco hooks de pontos e
  sorteios, entraram reativar, excluir e a ação de assinante. Toda escrita
  invalida os DOIS blocos (mexer no plano muda a linha do assinante e
  vice-versa).
- `lib/dashboard/nav.ts`: Fidelidade restrita a OWNER/MANAGER.
- `dashboard-chrome.tsx`: `NAV_FEATURE.fidelidade` → `fidelidadeAssinaturas`.
- `clients/client-drawer.tsx`: a mensagem "Ligue o programa na aba Fidelidade"
  mandava para uma tela que não liga mais nada — trocada pelo efeito real.

### Desvios conscientes do protótipo (e por quê)

- **O serviço do plano é um `<select>` do catálogo, não texto livre.** A quota
  é abatida do saldo do cliente (`SubscriptionUsage`) contra um `Service` real;
  texto livre não teria em que descontar.
- **"Retomar" no menu da linha, que o desenho não tem.** Os dados de exemplo do
  protótipo não têm assinatura pausada, então o menu dele só precisa de
  Pausar/Cancelar. Pausar pelo painel CRIA esse estado — sem "Retomar" a ação
  seria um beco sem saída.
- **Selo "Pausado" na coluna Pagamento.** Mesma razão: o estado existe, precisa
  ter como aparecer. Cinza neutro, fora da escala verde/amarelo/vermelho, porque
  pausado não é uma situação de cobrança.
- **`MRR` e `canDelete` vêm do servidor**, embora o protótipo calcule MRR na
  tela (`preço × assinantes`). Na tela a conta ignoraria que assinatura pausada
  não fatura.
- **`GET /loyalty/program` continua de pé sem tela.** Apagá-lo deixaria o
  resgate de pontos da comanda e o saldo da aba Clientes sem interruptor
  nenhum. Ver dívida.

### Papéis

- `BARBER`: item some do nav (o `DashboardFuncionario.dc.html` l.1612 não tem
  Fidelidade) e, na URL direta, a tela explica e aponta para as Comandas — que
  é onde a assinatura aparece de fato para ele, no débito do uso. As duas
  queries ficam `enabled: false` para não render dois blocos de erro genérico.
- `OWNER`/`MANAGER`: tela completa.

### Estados e responsividade

- Loading: skeleton dos cards com a MESMA altura (214px) e da tabela, sem
  deslocamento de layout.
- Vazio: mensagem própria por bloco — "Nenhum plano de assinatura ainda" com
  CTA de criar, e "Nenhum assinante ainda" explicando de onde ele vem. Tenant
  novo renderiza a aba inteira.
- Erro: `BlockError` com "Tentar de novo" por bloco; um bloco quebrado não
  derruba o outro.
- `node scripts/responsive-sweep.mjs --app=dashboard`: `/app/fidelidade` passa
  nos 5 tamanhos (360/390/768/1024/1440), sem rolagem horizontal e sem alvo de
  toque abaixo de 44px. Tabela vira cards abaixo de `md`; modais viram
  bottom-sheet.

### Testes

- `test/loyalty.e2e-spec.ts` **novo**, 16 casos — inclusive dois que guardam a
  decisão da fase (`/loyalty/raffles` e `/loyalty/clients` devem continuar 404).
- `src/loyalty/loyalty.service.spec.ts` **novo**, 7 casos sobre
  `paymentStatusOf`.
- Isolamento: os casos de sorteio deram lugar a reativar, excluir, pausar,
  retomar e cancelar; a fixture trocou o `raffleId` por um
  `clientSubscriptionId` real. `dashboard-ii.isolation-spec` ganhou um caso para
  as ESCRITAS da aba — sem ele, um gate esquecido em `reactivate`/`pause`
  passaria batido com a leitura trancada e a escrita aberta.
- Suíte: **88 unit · 224 e2e · 144 isolamento**, toda verde.

### Achados fora do escopo (para os agentes donos)

- **Agente 20 (Relatórios) — defeito real, corrigido aqui porque deixava a
  suíte vermelha.** `wednesdayOffset()` em `test/reports.e2e-spec.ts` escolhia a
  quarta-feira por `getUTCDay()` enquanto `localAt()` monta as datas em São
  Paulo. Das 21h à meia-noite local o UTC já virou o dia seguinte e o caso caía
  numa terça — flaky de três horas por dia. Passou a medir no mesmo relógio.
- **Agente 16 (Clientes).** `nav.ts` restringe "Clientes" a OWNER/MANAGER, mas o
  `DashboardFuncionario.dc.html` (l.1615) TEM o item no nav do barbeiro. Ou o
  item volta com recorte próprio, ou o desvio precisa ser registrado como
  consciente.
- **Agente 15 (Agenda).** `app/agenda/page.tsx` usa `gap-4.5` duas vezes
  (l.113 e l.263); a escala padrão do Tailwind 3.4 não tem `4.5` — a classe não
  gera nada e o gap fica zero.
- **Agentes 22 (WhatsApp), 25 (Minha Página) e 26 (Configurações).** A varredura
  responsiva reprova essas três abas: alvo de toque abaixo de 44px nas três e
  rolagem horizontal de +59px/+30px na Minha Página, a 360 e 390.

### Dívidas do agente 21

- **O programa de pontos ficou sem tela.** `GET|PATCH /loyalty/program` existe e
  é o único interruptor de um recurso vivo (resgate na comanda, saldo na aba
  Clientes, coluna "Pontos" da lista), mas nenhuma tela o edita desde que a
  sub-aba saiu do desenho. **Ninguém consegue LIGAR o programa pela interface.**
  O lugar natural é Configurações — é do **agente 26**.
- **As tabelas `LoyaltyRaffle`/`LoyaltyRaffleEntry` continuam no schema** sem
  nenhum consumidor: rotas, serviço, tipos, frontend e seed foram removidos,
  mas derrubar tabela é migration destrutiva e não cabia decidir aqui. Fica para
  uma limpeza de schema, com o `RaffleStatus` de `packages/types/src/enums.ts`
  junto.
- **`pauseSubscriber` resolve a assinatura pelo `clientId`**, porque é essa a
  assinatura do `ClientSubscriptionService`. O invariante "uma assinatura não
  cancelada por cliente" é garantido na venda (fase 05); se algum dia ele cair,
  as rotas do painel passam a agir na assinatura errada.
- **Não há paginação em `/loyalty/subscribers`.** Uma barbearia com centenas de
  mensalistas devolve tudo de uma vez. O protótipo também não pagina, mas a
  tabela pede o mesmo `Pager` das outras abas quando o volume crescer.
- **A cobrança recorrente segue no driver mock.** "Próxima cobrança" mostra a
  data real, mas quem cobra de verdade é a fase 12/gateway.

### Como conferir o agente 21 rodando

```bash
docker compose up -d db redis      # a stack inteira não cabe em 7,5 GB
cd apps/api && pnpm dev            # api em :3333
cd apps/web && pnpm dev            # web em :3000
```

1. `dono@barbeariacentral.com.br` / `BarberVP@2026` → **Fidelidade**. Três
   cards com MRR (R$ 120 / R$ 150 / R$ 220) e três assinantes, um em cada
   situação: **Daniel Prado — Pendente**, **André Martins — Pago**, **Gustavo
   Teixeira — Atrasado**.
2. "Editar" num plano, muda o preço, "Salvar alterações" → aparece **"Impacto
   nos assinantes"** com a contagem real. "Voltar" mantém o modal aberto.
3. "Editar" → "Excluir plano" → como o plano tem histórico, o diálogo vem como
   **"Arquivar plano"**. Crie um plano novo e repita: aí sim vem "Excluir plano"
   em vermelho, e o nome volta a ficar livre depois.
4. Arquive um plano: o card fica esmaecido, com selo "Arquivado", vai para o fim
   da grade e troca o botão por "Reativar".
5. Menu ⋯ de um assinante → "Pausar". O MRR do card daquele plano cai (pausado
   não fatura) e a linha vira "Pausado", com "Retomar" no menu.
6. `carlos@barbeariacentral.com.br` (BARBER): **Fidelidade não aparece no nav**;
   em `/app/fidelidade` na mão, a tela explica e oferece as Comandas.
7. Um tenant Profissional vê o paywall inline "Disponível no plano Avançado"
   com os três bullets do desenho.

## O que o agente 20 (auditoria da aba Relatórios) entregou

Auditoria 1:1 da aba **Relatórios** (`/app/relatorios`) contra
`Dashboard.dc.html` l.1229–1496 e a versão restrita do barbeiro em
`DashboardFuncionario.dc.html` l.667–775 (nav em l.1617).

### A tabela de desvios que abriu a sessão

| # | Bloco do protótipo | Existia? | Layout igual? | Botões funcionavam? |
|---|---|---|---|---|
| 1 | Pílulas de período (Hoje/7d/30d/Este mês/Personalizado) | ❌ | — | — |
| 2 | Intervalo personalizado (`isRelCustom`, l.1238) | ❌ | — | — |
| 3 | Filtro de barbeiros (multi, checkbox + iniciais) | ❌ | — | — |
| 4 | Filtro de unidade | ❌ | — | — |
| 5 | Exportar PDF | ❌ | — | — |
| 6 | Exportar CSV | ❌ | — | — |
| 7 | Faturamento por período (total + Δ + área + eixos) | ⚠️ 3 `StatCard` | ❌ | — |
| 8 | Faturamento por barbeiro | ⚠️ **trancado por plano** | ❌ | — |
| 9 | Faturamento por serviço 🔒 | ✅ | ❌ | — |
| 10 | Forma de pagamento (rosca + legenda %) | ⚠️ eram barras | ❌ | — |
| 11 | Taxa de retorno 🔒 | ⚠️ faixas erradas, sem headline | ❌ | — |
| 12 | Heatmap de horários de pico 🔒 | ❌ nem na API | — | — |
| 13 | Taxa de faltas por mês 🔒 + marcador do WhatsApp | ❌ (só um escalar) | — | — |
| 14 | Ticket médio por barbeiro 🔒 (l.1465) | ❌ | — | — |
| 15 | Cadeado POR BLOCO (véu + upsell) | ❌ a página inteira caía num `FeatureLocked` | ❌ | — |
| 16 | KPIs "Ocupação"/"No-show" | ⚠️ existiam e **não estão no protótipo** | ❌ | — |
| 17 | Papel `BARBER` | ❌ fora do nav e 403 no controller | — | — |
| 18 | Período no fuso da barbearia | ❌ resolvido em UTC | — | — |
| 19 | Estados (loading/vazio/erro por bloco) | ⚠️ um `Skeleton` genérico | ❌ | — |

Zerada ao fim da sessão.

### Os quatro achados

1. **A aba inteira era uma página de cadeado.** O protótipo tranca CINCO dos
   oito blocos (`relatoriosLocked` embrulha serviço, retorno, heatmap, faltas e
   ticket médio) e deixa TRÊS servindo em qualquer plano: faturamento por
   período, por barbeiro e por forma de pagamento. A implementação anterior
   punha `revenueByBarber` dentro de `/reports/advanced` e, ao ver o 403,
   substituía metade da tela por um cartaz único. O Essencial via paywall onde
   o desenho mostra números. `revenueByBarber` mudou de rota; o cadeado passou
   a ser por bloco (véu + `UpgradeModal` com os três benefícios de l.6916), e
   o `dashboard-ii.isolation-spec.ts` ganhou um caso que afirma o contrário do
   desvio — "Essencial ENXERGA `/reports/summary` COM faturamento por
   barbeiro". Mesmo formato do desvio que o agente 18 achou no Financeiro:
   **trancar "por simetria" é o erro recorrente desta auditoria.**

2. **O período era resolvido em UTC.** `resolvePeriod` montava as datas com
   um literal terminado em `T00:00:00.000Z`. Uma barbearia fechando comanda às 22h
   via o faturamento de "hoje" saltar para o dia seguinte, porque o container
   roda em UTC — o mesmo defeito que a fase 13 já tinha resolvido no Dashboard
   com `dashboard-window.ts`. As janelas agora saem de `resolveWindow`, que
   usa `zonedTimeToUtc` como o resto do painel.

3. **`@Transform` de `class-transformer` roda mesmo quando o parâmetro não
   veio.** O filtro de barbeiros normaliza a query string; com `barberIds`
   ausente, `[undefined].flatMap(e => String(e).split(','))` devolvia
   `['undefined']` — e TODA consulta sem filtro passava a procurar um barbeiro
   que não existe. Efeito: a aba inteira zerava para quem não tocasse no
   filtro, enquanto filtrar por um barbeiro funcionava. Custou o tempo que
   custa qualquer bug que se manifesta ao contrário da intuição. **Vale para
   qualquer DTO do produto**: `@IsOptional()` NÃO impede o `@Transform`, e um
   `@Transform` que não trata `undefined` é uma armadilha silenciosa.

4. **O gráfico de faltas afirma uma data que o banco não guardava.** A linha
   tracejada "WhatsApp de lembrete ativado" (l.1440) diz QUANDO a automação foi
   ligada; `WhatsappAutomationConfig` só sabia se ela está ligada AGORA, e
   `updatedAt` muda a cada edição de template. Entrou
   `WhatsappAutomationConfig.enabledAt`, gravado na primeira vez que a
   automação é ligada e nunca reescrito depois (desligar não apaga o marco — o
   lembrete de fato saiu naquele período). Sem a data, o gráfico simplesmente
   não desenha o balão: anunciar uma ativação que não houve daria ao dono um
   mérito que a fila de mensagens não sustenta.

### Decisões técnicas

1. **A rosca reparte EXATAMENTE o faturamento do card acima dela.** Os
   pagamentos entram pela comanda (`JOIN "Order"`) e pela data de FECHAMENTO
   dela, não por `paidAt`. Somar por `paidAt` faria a legenda dar 100% de um
   total que não é o do card, e um pagamento de assinatura — que não tem
   comanda — apareceria numa fatia que o "Faturamento por período" não contou.
   Há um caso de e2e que soma as fatias e compara com `revenueCents`.
2. **"Atend." do ticket médio é COMANDA FECHADA**, o mesmo denominador do
   ticket médio do Dashboard e do KPI logo acima. Contar itens de serviço daria
   um número maior e um ticket menor, e as duas telas passariam a discordar.
   (É a escolha oposta à do agente 19 no extrato de comissão, onde
   `atendimentos` conta lançamentos de SERVIÇO — lá o número serve para
   conferir a comissão, aqui para dividir o faturamento.)
3. **O delta compara com a janela de MESMO TAMANHO imediatamente anterior**,
   não com "o mês passado". "Este mês" no dia 22 compara com os 22 dias
   anteriores; comparar com um mês inteiro faria todo relatório de começo de
   mês parecer uma queda. `deltaPct` é `null` — e não `0` — quando a base é
   zero, e a tela escreve "sem período anterior para comparar" em cinza.
4. **A taxa de faltas ignora as pílulas de propósito.** São sempre os 8 meses
   que terminam no mês final do período: é um bloco de TENDÊNCIA, e um
   relatório de "Hoje" com um ponto só não mostraria queda nenhuma. Mesmo
   número de pontos das sparklines do Dashboard.
5. **A taxa de retorno conta a partir do FIM do período, não de `NOW()`.**
   Olhando um mês fechado do ano passado, `NOW()` jogaria a base inteira em
   "46+ dias" e o bloco diria que ninguém volta. O filtro de barbeiros usa
   `ClientProfile.favoriteBarberId` — retorno é propriedade do cliente, e é o
   barbeiro preferido que a aba Clientes já registra.
6. **O headline "62% voltam em até 45 dias" é derivado, não um segundo
   número.** É a soma das três primeiras faixas (o próprio protótipo fecha:
   24+22+16 = 62). Os cortes 15/30/45 são definição de negócio, como as faixas
   de comissão — não valor copiado do desenho.
7. **O rótulo de pico do heatmap é calculado**: a janela de 3 horas mais cheia
   do dia mais cheio ("Pico: sábado, 9h–12h" nos dados do seed demo, contra o
   "sábado, 10h–13h" cravado no protótipo). Sem atendimento no período o bloco
   cai no vazio próprio em vez de desenhar uma grade transparente.
8. **A série de "Hoje" é por HORA e as horas saem do expediente cadastrado**
   (`TenantBusinessHour`, com recuo para 8h–22h). O protótipo cravou 08h–22h;
   uma barbearia que abre às 9h não tem por que ver uma coluna morta.
9. **O filtro de unidade é o PRIMEIRO `unitId` que o produto realmente
   filtra.** A dívida 3 da fase 13 registra que o seletor da topbar só troca o
   rótulo; aqui `Order.unitId` e `Appointment.unitId` entram no `WHERE` de
   todas as consultas da aba. O seletor da barra só aparece quando o tenant tem
   unidades (`/dashboard/shell` devolve lista vazia sem `multiUnidades`) — um
   dropdown com uma opção só seria um controle que não decide nada.
10. **`BARBER` NÃO escolhe barbeiro.** O recorte vem do `StaffScope`, venha o
    que vier na query: pedir o `barberIds` de um colega devolve os próprios
    números, e o id do colega não aparece na resposta. Há caso de e2e e de
    isolamento para os dois ângulos.
11. **Os dois botões de exportação não somem fora do plano** — ficam a 50% e
    abrem o upsell, como `exportBtnOpacity`/`exportBtnTitle` (l.6931). Esconder
    o botão esconderia o motivo. Do lado do servidor as duas rotas são 403.
12. **Os KPIs "Ocupação" e "No-show" saíram da aba.** Não estão no protótipo de
    Relatórios, ninguém mais consumia `ReportsAdvancedResponse`, e ocupação já
    é um KPI do Dashboard. O método `occupancy()` foi removido junto.

### Backend

- `src/reports/reports-period.ts` (novo) — resolve as 5 pílulas no fuso do
  tenant e a janela de comparação.
- `src/reports/reports.service.ts` — reescrito. Tudo em `$queryRaw` agregado
  (nenhum N+1); `AT TIME ZONE` faz o agrupamento por hora/dia/mês no relógio da
  barbearia; os filtros de barbeiro/unidade viram fragmentos `Prisma.Sql`.
- `src/reports/reports-export.service.ts` (novo) — CSV (`;` + BOM, que é o que
  o Excel pt-BR abre em colunas) e PDF (pdfkit, mesma paleta clara do
  relatório de comissão), ambos montados do MESMO par de respostas da tela.
- `src/reports/dto/reports.dto.ts` — `period`, `from`/`to`, `barberIds`
  (repetível ou separado por vírgula) e `unitId`.
- `src/whatsapp-config/whatsapp-config.service.ts` — grava `enabledAt` na
  primeira ativação. **Aviso para o agente 22**: é a única linha desta sessão
  fora de Relatórios.
- `prisma/schema.prisma` + migration `20260822180000_relatorios_auditoria` —
  `WhatsappAutomationConfig.enabledAt`, com `UPDATE` que herda `createdAt` para
  quem já tinha a automação ligada.
- `prisma/seed.ts` / `seed-demo.ts` / `seed-data.ts` — plantam `enabledAt`
  (`WHATSAPP_REMINDER_ENABLED_MONTHS_AGO = 3`), para o marcador cair num mês em
  que a curva de faltas de fato cai.

### Frontend

- `components/dashboard/reports/` (novo): `report-card.tsx` (a caixa com os
  quatro estados e o cadeado), `report-toolbar.tsx`, `revenue-chart.tsx`,
  `bar-list.tsx`, `payment-donut.tsx`, `return-rate-card.tsx`,
  `peak-heatmap.tsx`, `no-show-chart.tsx`, `ticket-table.tsx` e
  `reports-shared.ts`.
- `lib/dashboard/api/reports.ts` — as duas consultas com `placeholderData` (a
  troca de pílula não pode piscar a grade vazia) e a mutation de exportação,
  que baixa por blob autenticado como o PDF de comissão.
- `lib/dashboard/api/team.ts` — `useBarbersQuery({ enabled })`, para o `BARBER`
  não colecionar 403 no console.
- `lib/dashboard/nav.ts` — `relatorios` perdeu a restrição de papel.
- Nenhum componente novo entrou em `packages/ui`: `Segmented`, `Popover`,
  `Donut`, `Avatar` e `ResponsiveTable` já cobriam a barra e a tabela.

### Papéis

`BARBER` vê a aba com o desenho do `DashboardFuncionario`: três KPIs (Minha
produção / Atendimentos / Ticket médio), "Minha produção por período", "Meus
serviços realizados" e "Forma de pagamento dos meus atendimentos" — sem filtro
de barbeiro, sem filtro de unidade e sem os cinco blocos de gestão. O subtítulo
diz "· seus atendimentos" para ele não confundir a própria produção com a da
barbearia.

### Estados e responsividade

- `/app/relatorios` passa nos 5 tamanhos (`node scripts/responsive-sweep.mjs
  --app=dashboard`). Duas correções foram necessárias: o trilho do `Segmented`
  é `shrink-0` no design system e as CINCO pílulas não cabiam a 360 (a aba usa
  `shrink flex-wrap`, que é o que o protótipo faz em l.1233), e os 8 rótulos do
  eixo X viram 4 abaixo de `sm` (duas linhas por breakpoint — medir a largura
  no cliente causaria salto na primeira pintura).
- Cada bloco tem esqueleto na PRÓPRIA altura, vazio com mensagem sua e erro com
  "Tentar de novo" local: uma consulta que falha não derruba a aba.
- Bloco trancado mantém a altura do bloco liberado. Sem isso o cadeado encolhe
  até encavalar no título, e a grade se reorganiza ao trocar de plano.
- Tenant secundário (`barbearia-isolamento`, Essencial e quase vazio) abre a
  aba inteira: R$ 93,00, "sem período anterior para comparar" e os cinco
  cadeados no lugar.
- Abaixo de `md` o heatmap rola por dentro do próprio contêiner
  (`min-w-[760px]` num `overflow-x-auto`) e a tabela de ticket vira cards, com
  a unidade colada no número ("155 atend.") porque o card perde o cabeçalho.

### Dívidas técnicas desta fase

- **O bloco trancado não mostra o formato do que se está comprando.** No
  protótipo o cadeado embaça CONTEÚDO; aqui o servidor responde 403 e não há
  payload para embaçar, então o véu cobre uma caixa vazia. Inventar valores de
  exemplo seria hardcodar dado do protótipo (regra 1). A saída honesta seria o
  `/reports/advanced` devolver, no 403, uma amostra explicitamente rotulada
  como exemplo — decisão de produto, não de auditoria de tela.
- **O seletor de unidade da TOPBAR continua sem filtrar nada** (dívida 3 da
  fase 13). Relatórios tem o seu, e ele funciona; as outras 13 telas não. Agora
  há duas maneiras de escolher unidade na mesma tela dizendo coisas
  diferentes — quem fizer multi-unidade de verdade deve unificar as duas.
- **`export.csv`/`export.pdf` recalculam `summary` + `advanced`.** São 11
  consultas por download, e o usuário acabou de ver os mesmos números na tela.
  Cachear a resposta por (tenant, filtros) resolveria; não foi feito porque o
  download é raro e o cache erraria no primeiro fechamento de comanda.
- **O PDF de exportação não tem gráfico nenhum** — é tabela. As séries viram
  linhas de números. Desenhar SVG no pdfkit é possível; o valor está em cruzar
  os números, não em reproduzir a curva.
- **`revenueSeries` de um período personalizado longo devolve um ponto por
  dia** — um ano são 365 pontos numa resposta e num SVG. Acima de ~90 dias
  valeria agrupar por semana; a tela aguenta, a resposta cresce.
- **O heatmap conta agendamentos `DONE`+`CONFIRMED`, não ocupação em minutos.**
  Um atendimento de 2h pesa igual a um de 30min. É "quando o telefone toca",
  não "quando a cadeira está cheia" — as duas leituras são úteis e o protótipo
  não diz qual é.

### Achados fora do escopo (para os agentes donos)

- A varredura responsiva fecha com **20 pendências, nenhuma em
  `/app/relatorios`** — as mesmas que o agente 19 listou, menos as 2 que eram
  desta aba. O padrão continua: **quase toda barra de sub-abas do painel tem
  botões de 36px de altura**.
- **`@Transform` sem guarda de `undefined` é uma armadilha do produto inteiro,
  não desta aba.** Vale um `grep -rn "@Transform" apps/api/src` na próxima
  sessão que sobrar tempo — este agente só corrigiu o DTO de Relatórios.

### Como conferir o agente 20 rodando

**Cuidado com RAM** (7,5GB): `docker compose up -d db redis api` para os passos
1–4, e suba `web` sozinho só para olhar a tela.

1. **Os números batem com o Financeiro/POS** — `period=mes` tem de dar
   exatamente o "faturamento do mês" que o `seed:demo` imprime:
   ```bash
   TOKEN=$(curl -s -X POST http://localhost:3333/api/v1/auth/login \
     -H 'Content-Type: application/json' \
     -d '{"email":"dono@barbeariacentral.com.br","password":"BarberVP@2026"}' \
     | python3 -c 'import sys,json;print(json.load(sys.stdin)["accessToken"])')
   curl -s "http://localhost:3333/api/v1/reports/summary?period=mes" \
     -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | head -20
   ```
   A soma de `paymentDistribution[].amountCents` tem de dar `revenueCents`.
2. **Exportação de verdade**:
   ```bash
   curl -s -o /tmp/rel.pdf "http://localhost:3333/api/v1/reports/export.pdf?period=mes" -H "Authorization: Bearer $TOKEN"
   file /tmp/rel.pdf   # PDF document
   curl -s "http://localhost:3333/api/v1/reports/export.csv?period=mes" -H "Authorization: Bearer $TOKEN" | head -8
   ```
3. **Gate de plano** (baixar o tier na marra e restaurar):
   ```bash
   docker exec barbervp-db psql -U barbervp -d barbervp -c \
     "UPDATE \"Tenant\" SET \"planId\"=(SELECT id FROM \"SaasPlan\" WHERE code='essencial') WHERE slug='barbearia-central';"
   for P in summary advanced export.csv export.pdf; do
     curl -s -o /dev/null -w "$P %{http_code}\n" "http://localhost:3333/api/v1/reports/$P?period=mes" -H "Authorization: Bearer $TOKEN"
   done
   # summary 200 · advanced 403 · export.csv 403 · export.pdf 403 — e a tela
   # mantém os 3 blocos abertos com os 5 cadeados. Depois:
   docker exec barbervp-db psql -U barbervp -d barbervp -c \
     "UPDATE \"Tenant\" SET \"planId\"=(SELECT id FROM \"SaasPlan\" WHERE code='avancado') WHERE slug='barbearia-central';"
   ```
4. **Recorte do barbeiro** — entre como `carlos@barbeariacentral.com.br` e peça
   o `barberId` de um colega em `barberIds`: a resposta continua sendo a dele.
5. **Front** (`docker compose up -d web`, sozinho):
   `http://localhost:3000/app/relatorios` como
   `dono@barbeariacentral.com.br` / `BarberVP@2026` — ande pelas 5 pílulas,
   abra "Personalizado", desmarque um barbeiro, exporte os dois arquivos.
   Depois entre como `carlos@barbeariacentral.com.br` (mesma senha): 3 KPIs,
   3 blocos, sem filtro de barbeiro.
6. **Testes**: `make test` (81 unit), `pnpm --filter @barbervp/api test:e2e`
   (208), `make test-isolation` (139). Rode com a stack **parada** ou só com
   `db`+`redis` — a suíte junto do container `api` já estourou a RAM nesta
   máquina.
7. **`make seed-demo` antes de auditar a próxima aba** — o `make seed` básico
   não tem os 8 meses de histórico que o heatmap e a curva de faltas precisam.

## O que o agente 19 (auditoria da aba Comissões) entregou

Auditoria 1:1 da aba **Comissões** (`/app/comissoes`) contra
`Dashboard.dc.html` l.1089–1228, o modal de regras (l.4154, com os modos
Percentual l.4167 e Faixas l.4184) e o modal de PDF (l.4228).

### A tabela de desvios que abriu a sessão

| Bloco do protótipo | Existia? | Layout igual? | Botões funcionavam? |
|---|---|---|---|
| Toggle Semanal/Mensal | ❌ | — | — |
| Stepper `‹ período ›` | ❌ (era `<input type=month>`) | ❌ | parcial |
| KPIs Total a pagar / Período / Status | ❌ (só um selo solto) | ❌ | — |
| Tabela de 9 colunas | ❌ (era lista de `Card`) | ❌ | — |
| Col. Fat. produtos | ⚠️ vinha na API, não na tela | ❌ | — |
| Col. **Comissão produtos** | ❌ **nem no banco** | ❌ | — |
| Col. Regra aplicada (chip ✎ por barbeiro) | ❌ (lista "Regras" à parte) | ❌ | ⚠️ abria a regra global |
| Col. (−) Vales | ⚠️ só aparecia se > 0 | ❌ | — |
| Botão PDF por linha | ❌ | — | — |
| Extrato: tabela + `% aplicado` + nota | ⚠️ era lista rasa, sem % nem nota | ❌ | ✅ |
| Modal de regras por barbeiro, com % produtos, add/remover faixa e toggle de vales | ❌ (era CRUD de regra, 3 faixas fixas, sem % produtos, sem toggle) | ❌ | parcial |
| Modal de PDF | ❌ inexistente | — | — |
| Paywall com os 3 benefícios do protótipo | ⚠️ existia com outros textos | ✅ | ✅ |

Zerada ao fim da sessão.

### Os três achados

1. **Produto não gerava comissão nenhuma.** A fase 07 decidiu "comissão sobre
   o serviço, produto não gera comissão nesta regra" e o seed carregava esse
   comentário. Só que o protótipo tem uma coluna "Comissão produtos" NA
   TABELA e um campo "% produtos" nos DOIS modos do modal de regras — não é
   uma regra de negócio opcional, é metade da conta que o barbeiro confere.
   Entraram `CommissionRule.percentProdutosBps`, `CommissionEntry.kind`
   (`SERVICE`/`PRODUCT`) e `CommissionCalcService.recordProductEntry`.
   **Produto nunca progride por faixa** — o próprio protótipo rotula o campo
   como "% produtos (todas as faixas)" —, então o acumulado que escolhe a
   faixa passou a contar SÓ os lançamentos de serviço. Sem essa separação, a
   venda de pomada empurraria o barbeiro para a faixa de 50% sem nunca ser
   comissionada por ela. `percentProdutosBps` nasce em 0: quem não configurar
   não vê mudança.

2. **Período fechado exibia um total MAIOR do que o que foi pago.** `period()`
   somava vales com `settledAt: null`; `closePeriod()` quita os vales. Ou
   seja: no instante seguinte ao fechamento o vale saía da conta e o "Total a
   receber" subia — a tela contradizia o pagamento que ela mesma acabara de
   travar. O filtro passou a ser por `Vale.date` dentro do recorte,
   independente de quitação. De quebra, isso é o que faz a coluna fechar
   também na visão Semanal, já que `Vale.date` é o dia do adiantamento (a
   `referenceMonth` é derivada dele desde a fase 18).

3. **O cadeado anunciava outros benefícios.** O bloco `comissoesLocked`
   (l.1214–1216) lista "Cálculo automático por barbeiro", "Faixas progressivas
   de comissão" e "Relatório em PDF" — e o terceiro era exatamente o que NÃO
   existia. O upsell prometia um recurso inexistente; agora os três são reais.

### Decisões técnicas

1. **"Semanal" é um recorte de LEITURA; a competência continua sendo o mês.**
   A faixa da regra é escolhida pelo faturamento MENSAL (SPEC: até R$5.000 →
   40%…) e é o mês que `closePeriod` trava. Fechar semana a semana pagaria
   sempre pela faixa mais baixa. Por isso o `confirm()` do botão nomeia a
   COMPETÊNCIA ("Fechar a competência de agosto?") mesmo com a tela na visão
   semanal — é onde o usuário mais precisa ouvir isso.
2. **Numa semana que atravessa a virada do mês, a competência é a do dia
   âncora**, não a do começo da semana: é o dia escolhido no stepper que diz
   de qual fechamento aquela leitura faz parte.
3. **O extrato filtra por `Order.closedAt`, não por `CommissionEntry.createdAt`.**
   É a data que a coluna "Data" mostra, e a única que sobrevive a um seed com
   histórico retroativo — `createdAt` jogaria todo o histórico na semana em
   que o seed rodou. (O `seed.ts` também passou a gravar `createdAt: closedAt`,
   como o `seed-demo.ts` já fazia.)
4. **O modal de regras edita a regra REAL e avisa quem mais muda junto.** O
   protótipo escreve "Regras de comissão · Fulano" como se a regra fosse do
   barbeiro, mas no modelo ela é compartilhada. Duplicar a regra por barbeiro
   encheria a barbearia de regras iguais; então o modal edita a regra
   existente e mostra, em faixa dourada, "Esta regra também vale para X e Y".
   Barbeiro sem regra ganha uma nova, nomeada com o próprio nome. O `submit`
   manda `barberIds` = os antigos ∪ este, porque o endpoint SUBSTITUI a lista.
5. **`deductVales` desligado não quita o vale no fechamento.** O adiantamento
   não entrou no total pago — dar baixa nele apagaria uma dívida que ninguém
   cobrou. Na tabela o valor aparece riscado e em cinza, não em vermelho.
6. **O total nunca fica negativo, mas o saldo não some.** Quando o vale supera
   a comissão, `totalCents` é 0 (ninguém paga para trabalhar) e a nota do
   extrato diz quanto seguiu em aberto — um zero sem explicação pareceria
   quitação.
7. **O PDF é montado no servidor a partir do MESMO `CommissionPeriodResponse`
   que alimenta a tabela**, nunca de um segundo cálculo: papel e tela não
   podem divergir no dia em que uma das fórmulas mudar. O modal na tela é a
   pré-visualização (as cores claras dele são fixas de propósito — representam
   o arquivo, não o tema).
8. **`pdfkit` entrou como dependência do `apps/api`.** As fontes padrão do PDF
   são WinAnsi: acentos passam, mas o MINUS SIGN (U+2212) do "(−) Vales" sai
   como `"`. No PDF vai hífen; na tela, o sinal tipográfico.
9. **`ResponsiveTable` ganhou `expansion`** (opcional, aditivo — nenhum
   chamador existente mudou). O gatilho é um `<button aria-expanded>` numa
   coluna própria à esquerda, e não a `<tr>` inteira clicável do protótipo:
   a linha tem um botão "PDF" dentro, e um clique nele também abriria o
   extrato.
10. **`finance-blocks.tsx` virou `components/dashboard/blocks.tsx`.** Os KPIs,
    o `Panel` e o `BlockError` da fase 18 não são do Financeiro — são das abas
    de números. Os 5 importadores foram atualizados; nenhum shim de
    re-export ficou para trás.

### Papéis

`BARBER` vê só a própria linha (`scoped: true` na resposta), o KPI troca de
rótulo para "Você tem a receber", "Fechar período" some, e o chip da regra vira
selo sem o `✎` — porque `/commissions/rules` é `OWNER`/`MANAGER` e um lápis ali
levaria a um 403. O PDF do próprio extrato continua disponível; o de um colega
devolve 404, já que o extrato que alimenta o relatório já vem filtrado.

### Estados e responsividade

- `/app/comissoes` passa nos 5 tamanhos (`node scripts/responsive-sweep.mjs
  --app=dashboard`). A pendência histórica dela — rolagem horizontal de +121px
  a 360/390, registrada pelo agente 18 — está fechada.
- Abaixo de `md` a tabela vira cards, com o botão PDF em cada um (a coluna tem
  `mobile: 'meta'`; sem isso o botão sumia no celular) e o extrato rolando por
  dentro do card (`min-w-[460px]` no `overflow-x-auto`, senão "% aplicado" era
  esmagado).
- Mês sem lançamento nenhum renderiza a aba inteira com zeros e **desabilita
  "Fechar período"** — o endpoint aceitaria a chamada e não faria nada, e o
  dono ficaria achando que fechou algo. Tenant sem barbeiro cai no `EmptyState`.
- Falha de carga mostra `BlockError` com "Tentar de novo" — a página não cai.

### Dívidas técnicas desta fase

- **O extrato não pagina.** Um barbeiro com centenas de atendimentos no mês
  devolve tudo numa consulta; a tela aguenta, a resposta cresce. Mesmo caso do
  extrato de caixa da fase 18.
- **`period()` roda 3 consultas POR BARBEIRO** (lançamentos, faturamento
  agrupado, vales). Com 4 barbeiros são 12; com 40, 120. Dá para virar 3
  consultas agrupadas por barbeiro — não foi feito porque o `N` real é a
  equipe de uma barbearia.
- **O PDF não tem o logotipo da barbearia.** O protótipo desenha um bloco
  "LOGO" hachurado, e é isso que o modal e o arquivo mostram: não existe
  upload de imagem no produto (a galeria de Minha Página é URL simples).
  Quando existir, o `CommissionReportService` já tem onde encaixar.
- **`normalizeTiers` conserta faixa fora de ordem no servidor** reordenando
  pelos tetos, mas não avisa quem salvou. O modal valida antes ("Os tetos das
  faixas precisam estar em ordem crescente"), então na prática só um cliente
  fora da UI cairia nisso em silêncio.
- **`atendimentos` conta só lançamentos de SERVIÇO.** É o número que a palavra
  significa, mas quem ler o campo esperando "linhas do extrato" vai errar por
  causa das linhas de produto.

### Achados fora do escopo (para os agentes donos)

A varredura responsiva (`--app=dashboard`, com os dados de `make seed`) fecha
com **20 pendências, nenhuma em `/app/comissoes`** — todas a 360 e/ou 390:

- `/app/agenda`: 5 alvos de toque < 44px (stepper `‹ ›`, "Hoje", input).
- `/app/servicos-produtos`: rolagem horizontal (+47px / +17px) e 2 abas < 44px.
- `/app/equipe`: rolagem horizontal (+77px / +47px) e 3 abas < 44px.
- `/app/fidelidade`: 3 abas e 1 input < 44px.
- `/app/whatsapp`: 5 inputs < 44px.
- `/app/configuracoes`: 5 inputs < 44px.
- `/app/minha-pagina`: rolagem horizontal (+59px / +30px) e 2 inputs < 44px.

Note o padrão: **quase toda barra de sub-abas do painel tem botões de 36px de
altura**. Quem pegar qualquer uma dessas abas deve arrumar a barra inteira, não
só a própria — provavelmente vale um componente compartilhado, como o
`Segmented` já é.

### Como conferir a fase 19 rodando

**Cuidado com RAM** (7,5GB): `docker compose up -d db redis api` para os passos
1–3, e suba `web` sozinho só para olhar a tela.

1. **Extrato mensal e semanal**:
   ```bash
   TOKEN=$(curl -s -X POST http://localhost:3333/api/v1/auth/login \
     -H 'Content-Type: application/json' \
     -d '{"email":"dono@barbeariacentral.com.br","password":"BarberVP@2026"}' \
     | python3 -c 'import sys,json;print(json.load(sys.stdin)["accessToken"])')
   curl -s "http://localhost:3333/api/v1/commissions/period?month=$(date +%Y-%m)" \
     -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | head -40
   curl -s "http://localhost:3333/api/v1/commissions/period?type=WEEKLY&anchor=$(date +%Y-%m-%d)" \
     -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | head -20
   ```
   `comissaoProdutosCents` > 0 confirma o achado 1; a semana precisa somar
   menos que o mês que a contém.
2. **PDF de verdade** (troque `<ID>` por um `barberId` da resposta acima):
   ```bash
   curl -s -o /tmp/rel.pdf \
     "http://localhost:3333/api/v1/commissions/period/report.pdf?month=$(date +%Y-%m)&barberId=<ID>" \
     -H "Authorization: Bearer $TOKEN"
   file /tmp/rel.pdf   # PDF document
   ```
3. **Gate de plano** (baixar o tier na marra e restaurar):
   ```bash
   docker exec barbervp-db psql -U barbervp -d barbervp -c \
     "UPDATE \"Tenant\" SET \"planId\"=(SELECT id FROM \"SaasPlan\" WHERE code='essencial') WHERE slug='barbearia-central';"
   curl -s -o /dev/null -w '%{http_code}\n' "http://localhost:3333/api/v1/commissions/period?month=$(date +%Y-%m)" -H "Authorization: Bearer $TOKEN"
   # 403 — e a tela mostra o cadeado com os 3 benefícios do protótipo. Depois:
   docker exec barbervp-db psql -U barbervp -d barbervp -c \
     "UPDATE \"Tenant\" SET \"planId\"=(SELECT id FROM \"SaasPlan\" WHERE code='avancado') WHERE slug='barbearia-central';"
   ```
4. **Front** (`docker compose up -d web`, sozinho): `http://localhost:3000/app/comissoes`
   como `dono@barbeariacentral.com.br` / `BarberVP@2026` — alterne
   Semanal/Mensal, ande com `‹ ›`, abra o extrato de um barbeiro, clique no
   chip da regra (o aviso "esta regra também vale para…" aparece) e no "PDF".
   Depois entre como `carlos@barbeariacentral.com.br` (mesma senha): só a
   própria linha, sem "Fechar período" e sem o `✎`.
5. **Testes**: `make test` (81 unit), `pnpm --filter @barbervp/api test:e2e`
   (189), `make test-isolation` (133). Rode com a stack **parada** ou só com
   `db`+`redis` — a suíte junto do container `api` já estourou a RAM
   (exit 137) nesta máquina.
6. **`make seed` ao terminar** e `docker compose stop`.

## O que o agente 18 (auditoria da aba Financeiro) entregou

Auditoria 1:1 da aba **Financeiro** (`/app/financeiro`) contra
`Dashboard.dc.html` l.718–1088 e os modais l.3876 (fechar caixa), l.3914 (nova
conta a pagar), l.3990 (nova conta a receber), l.4066 (novo vale) e l.4109
(nova conta bancária).

### A tabela de desvios (o passo 1 da fase)

A aba tinha **as 6 sub-abas de nome e 2 de conteúdo**. Por sub-aba:

| Sub-aba | Desvio |
|---|---|
| Caixa (l.736) | Sem os 4 KPIs, sem os botões de entrada/sangria, sem o extrato do dia. Abrir caixa era um modal, não o card central. Fechamento sem resumo por forma nem faixa de diferença. |
| Contas a pagar (l.835) | Sem os 3 KPIs. Tabela com 5 das 8 colunas (faltavam Fornecedor e Parcela). "Marcar como pago" escondido num kebab. Modal sem recorrente/parcelado. |
| Contas a receber (l.893) | Idem, e o modal não abria por "Cliente" como no protótipo. |
| Vales (l.951) | Sem a faixa dourada. Mostrava "Mês" no lugar de "Data" — **o `Vale` não guardava o dia**, só a competência. Status genérico em vez de "Descontar na comissão de \<mês\>". |
| Contas bancárias (l.986) | **Travada por plano sem o protótipo trancar.** Cards sem tipo nem formas aceitas; faltava o bloco "forma de pagamento → conta de destino". |
| Fluxo de caixa (l.1014) | **Travada por plano sem o protótipo trancar.** Só barras, sem a linha do acumulado; grid de cards no lugar da tabela; sem o detalhe por categoria. |

### Os três achados que passam das telas

1. **O gate de plano estava largo demais.** `LOCKED_FIN_TABS` do protótipo tem
   3 chaves; a implementação trancava 5 endpoints. Um tenant Essencial abria
   Contas bancárias e Fluxo de caixa e via paywall onde o produto promete a
   tela. Corrigido no controller e cravado na suíte de isolamento com um caso
   que afirma **200**, não 403 — a assimetria é fácil de "consertar de volta"
   por simetria aparente.

2. **A conferência de caixa somava o que não está na gaveta.** O fechamento
   comparava o contado contra a soma de TODAS as movimentações. Uma barbearia
   que vende no cartão fecharia todo dia com uma "quebra" do tamanho das vendas
   na maquininha. Agora `expectedCents` é só `method = CASH`; o extrato segue
   mostrando as três formas, porque é o diário do dia — só a conferência é do
   dinheiro. O `CashMovement` ganhou `method` e `category` para isso (o POS
   passou a gravar UMA movimentação por forma de pagamento, não só as em
   dinheiro).

3. **Os KPIs somavam a página, não o conjunto.** Não existiam ainda, mas a
   armadilha estava montada: com `perPage: 50` na tela, somar
   `data.reduce(...)` daria "Total do mês" dos 50 primeiros. Os três recortes
   viraram um `FILTER (WHERE ...)` único no banco, devolvido como `summary` na
   própria listagem.

### Endpoints criados/alterados

- **`POST /finance/cash-register/movements`** (novo) — entrada avulsa e
  saída/sangria. No protótipo os dois botões só disparavam um toast.
- `GET /finance/cash-register` — devolve `entriesCents`, `exitsCents`,
  `expectedCashCents` e `byMethod[]`.
- `GET /finance/payables|receivables` — ganham `summary`; a criação
  materializa parcelas (`installments`) e recorrência (`recurrence`, 12
  ocorrências) com `seriesId` comum.
- `PATCH .../pay|receive` — liquidar de novo virou 409, não uma segunda baixa.
- `GET|POST|PATCH /finance/bank-accounts` — `type` e `acceptedMethods`
  expostos; nome único por tenant; **sem gate de plano**.
- `GET /finance/cash-flow` — agregação em SQL com categorias e acumulado;
  **sem gate de plano**.

### Schema (migration `20260822120000_financeiro_auditoria`)

- `CashMovement.method` (`PaymentMethod?`) e `.category` (`String?`).
- `AccountPayable`/`AccountReceivable`: `seriesId` e `recurrence`
  (`enum AccountRecurrence { WEEKLY, MONTHLY, YEARLY }`).
- `Vale.date` (`@db.Date`) — a coluna "Data" da tabela não tinha de onde sair;
  as linhas antigas herdaram a competência.

### Decisões que valem para as próximas abas

- **`FeatureLocked` foi corrigido para o bloco real do protótipo** (l.815):
  bullets VISÍVEIS no card e dois botões ("Ver planos" → `/#bvp-plans`,
  "Fazer upgrade" → `/app/configuracoes?tab=plano`). Antes escondia os
  benefícios atrás de um modal. As 5 páginas que já o usavam (relatórios,
  comissões, fidelidade, configurações) herdaram a correção **sem mudar de
  chamada** — os agentes 19–26 não precisam refazer o upsell.
- **Sangria maior que a gaveta é 400.** O protótipo não modela; permitir
  deixaria o caixa negativo e o fechamento sem sentido. Só o dinheiro é
  limitado — um estorno no cartão sai da conta do adquirente.
- **A conta bancária dos modais não vem pré-selecionada.** Atribuir a conta
  errada em silêncio é pior que não atribuir nenhuma.
- **`modalExcluirConta` (l.3511) NÃO é do Financeiro.** É "Excluir sua conta e
  barbearia", o fluxo de 2 passos de **Configurações** — o enunciado do agente
  18 o listava por engano. **Agente 26: é seu.**

### O que ficou de fora (dívida desta aba)

- A recorrência materializa 12 ocorrências na criação e para. Não há job que
  renove a série quando as 12 acabarem — o `seriesId` existe justamente para
  uma renovação futura conseguir continuar de onde parou.
- Conta a pagar/receber não tem edição nem exclusão: o protótipo também não
  tem, mas um erro de digitação hoje só se resolve no banco.
- O extrato de caixa não pagina. Um dia com centenas de comandas devolve tudo
  numa consulta; a tela aguenta, a resposta cresce.
- A varredura responsiva só visita a sub-aba padrão (Caixa) — as outras cinco
  foram conferidas por captura manual nos 5 tamanhos, não pelo script.

### Achados fora do escopo (para os agentes donos)

A varredura responsiva reprovou, em 360/390, telas de OUTRAS abas — nenhuma
tocada nesta sessão:

- `/app/comissoes`: rolagem horizontal (+121px) no cabeçalho.
- `/app/minha-pagina`: rolagem horizontal (+59px) e 2 inputs abaixo de 44px.
- `/app/fidelidade`: 3 botões de sub-aba e 1 input abaixo de 44px.
- `/app/whatsapp`: 5 inputs abaixo de 44px.
- `/app/configuracoes`: 5 inputs abaixo de 44px.

## O que o agente 17 (auditoria da aba Comandas/POS) entregou

Auditoria 1:1 da aba **Comandas** (`/app/comandas`) contra `Dashboard.dc.html`
l.639–717 e o modal `modalComandaOpen` l.3123–3320.

### A tabela de desvios (o passo 1 da fase)

| # | Bloco do protótipo | Existia? | Layout igual? | Botões funcionavam? | Gravidade |
|---|---|---|---|---|---|
| 1 | Abas segmentadas **3**: `Abertas N` · `Fechadas hoje N` · `Todas` | Parcial — 2 abas | Não | Contagem só em "Abertas" | Alta |
| 2 | Busca "Buscar por cliente ou nº" | **Não** — o backend já aceitava `search` | — | — | Alta |
| 3 | "+ Nova comanda" na mesma linha da busca | Sim, mas na topbar | Não | Sim | Média |
| 4 | **Grid de cards** das abertas: #nº, selo, cliente, `barbeiro · aberta HH:MM`, resumo dos itens, Subtotal + "Continuar" | **Não** — era tabela | Não | — | Alta |
| 5 | Tabela das fechadas, 6 colunas na ordem Nº·Cliente·Barbeiro·**Fechada às**·Pagamento·Total | Parcial — 5 colunas, sem "Fechada às", Total antes de Pagamento | Não | — | Média |
| 6 | Vazio "Nenhuma comanda encontrada" (resultado de busca) | Parcial — só vazio por status | Não | — | Média |
| 7 | Modal passo 1 "Nova comanda #N" — busca de cliente, lista com iniciais, vazio próprio | Parcial — Select de barbeiro + toggle cadastrado/walk-in, sem o nº, lista só após digitar | Não | Sim | Alta |
| 8 | Modal passo 2 **880×680, 3 colunas** (catálogo \| itens \| resumo) | **Não** — substituía a página inteira (`PosWorkspace`, 2 colunas) | Não | — | Alta |
| 9 | Cabeçalho: `Comanda #N`, avatar, `cliente · barbeiro`, link **"trocar"** | **Não** — e não existia endpoint para trocar | — | — | Alta |
| 10 | Catálogo: 1 busca + seções empilhadas SERVIÇOS/PRODUTOS em linha | Parcial — `Tabs` + grid de 2–3 colunas | Não | Sim | Média |
| 11 | Itens: `ITENS (N)`, preço unitário, lixeira, stepper, subtotal do item | Parcial — sem contador, sem "un.", ✕ no lugar da lixeira | Não | Sim | Média |
| 12 | Resumo: desconto com alternador **R$ \| %** inline; Total em gold/Sora | Parcial — `Select` + input + botão "Aplicar" (3 controles) | Não | Sim | Alta |
| 13 | Card de fidelidade sempre visível: `— R$ X · usa N pts` + saldo | Parcial — sumia com saldo 0; nunca mostrava o valor antes de ligar | Não | Sim | Média |
| 14 | Chips de pagamento (Pix/Dinheiro/Débito/Crédito/**Dividir**) + split com sobra, dentro da comanda | **Não** — modal separado com 4 campos fixos | Não | Sim | Alta |
| 15 | Rodapé "**Salvar e deixar aberta**" / "Fechar comanda" | Parcial — só o segundo | Não | — | Alta |
| 16 | Reabertura MANAGER+ (`POST /orders/:id/reopen` existia) | **Nenhuma tela chamava** | — | Função sem botão | Alta |
| 17 | Mobile: subtotal sempre visível, 2 colunas só ≥ lg | Sim | Sim | Sim | — |
| 18 | Estados loading/erro com retry | **Não** — lista sem skeleton e sem erro | — | — | Média |
| 19 | `PAYMENT_METHOD_LABEL` de `@barbervp/types` | Duplicado em 3 arquivos do POS | — | — | Baixa |

Ao final, zerada.

### Os dois achados que valem para TODO o produto

1. **Duas renovações de sessão simultâneas revogavam a família do refresh.**
   `establishment-auth.tsx` (e `client-auth.tsx`) chamava
   `establishmentApi.refresh()` DIRETO no efeito de montagem, enquanto o
   interceptor do axios chamava o seu próprio refresh ao ver um 401. O
   interceptor tem single-flight, mas ele não cobria a chamada do provider: as
   duas POSTs saíam juntas, a segunda mandava o cookie que a primeira já tinha
   rotacionado, e a API — corretamente — tratava como reuso e revogava a
   FAMÍLIA inteira. Sintoma: a tela monta, e toda chamada seguinte toma 401 até
   recarregar. Não era da aba Comandas — era de qualquer tela que dispare uma
   requisição cedo o bastante para correr com o bootstrap. **Corrigido nos dois
   providers**: o `refresh` virou voo único guardado num `useRef`, e o efeito de
   montagem passou a usar esse mesmo `refresh` em vez de chamar a API por fora.
2. **O `responsive-sweep.mjs` estava passando por engano em 8 abas.** Por causa
   do achado #1, as telas que a varredura abria perdiam a sessão e renderizavam
   só a casca — sem tabela, sem chip, sem card, nada para medir. Corrigido o
   refresh, elas passaram a carregar os dados de verdade e apareceram
   **24 pendências reais** em `/app/agenda`, `/app/comissoes`,
   `/app/configuracoes`, `/app/equipe`, `/app/fidelidade`, `/app/minha-pagina`,
   `/app/servicos-produtos` e `/app/whatsapp` (todas a 360 e 390: rolagem
   horizontal e alvo de toque < 44px). **Não foram tocadas** — cada uma tem
   agente próprio (15, 18–28). Quem pegar essas abas deve rodar
   `node scripts/responsive-sweep.mjs --app=dashboard` ANTES de começar: o verde
   histórico delas não valia. `/app/comandas`, `/app/clientes`, `/app`,
   `/app/financeiro`, `/app/relatorios` e `/app/assistente-ia` passam.

### Backend

- **`PATCH /orders/:id` é novo** — o "trocar" do protótipo não tinha endpoint.
  Trocar o cliente não é trocar um rótulo: o preço de cada item de SERVIÇO foi
  fotografado em nome do cliente anterior, então a rota **reavalia a cobertura
  de assinatura item a item** (o que era R$0 volta ao preço cheio se o novo
  cliente não assina, e vice-versa) e **derruba `useLoyalty`**, porque o saldo
  de pontos é de quem saiu. Sem isso, trocar o cliente entregaria de graça um
  serviço que ninguém pagou.
- **"Fechadas hoje" é o dia da BARBEARIA, não o do servidor.** O recorte usa
  `Tenant.timezone` (`toDateKey` + `zonedTimeToUtc`, os mesmos utilitários da
  agenda). Com o dia do servidor, a aba viraria às 21h em qualquer deploy fora
  de -03.
- **As contagens seguem a regra do agente 16**: ignoram a aba escolhida e
  respeitam a busca. Se ignorassem a busca, a contagem contradiria a lista logo
  abaixo; se respeitassem a aba, a aba ativa seria a única diferente de zero.
- **A lista entrega `subtotalCents` e `lines[]`, não uma string pronta.** O
  resumo "2× Corte R$ 45,00 · 1× Pomada R$ 30,00" é montado na tela: quem
  formata R$ e o "×" é o front, o servidor manda os números.
- **A prévia do resgate (`loyaltyEnabled`/`PointsRequired`/`RewardCents`) existe
  porque o card do protótipo mostra quanto vale o resgate ANTES de ligar o
  toggle.** `loyaltyEnabled` é falso para walk-in: sem `clientId` não há saldo,
  e o bloco não deve prometer um desconto que não vai existir.
- **`nextNumber` no catálogo é uma PREVISÃO, e está documentado como tal** — se
  outro caixa abrir uma comanda no meio, o número real (do `OrderDetail`) sai
  diferente e é ele que vale.

### Frontend

- `packages/ui`: `Modal`/`Drawer` ganharam `bodyClassName` — o diálogo da
  comanda traz o próprio grid de 3 colunas com divisórias de altura total, e o
  `p-5` padrão empurraria as bordas para dentro. Opt-in; nada mais mudou.
- `apps/web/components/dashboard/pos/` foi refeito: saíram `pos-workspace.tsx`,
  `open-order-modal.tsx`, `close-order-modal.tsx` e `comanda-panel.tsx`;
  entraram `comanda-modal.tsx` (os dois passos), `client-picker.tsx` (a mesma
  busca serve o passo 1 e o "trocar"), `reopen-order-modal.tsx` e
  `pos-shared.ts`. As 3 cópias do mapa de método de pagamento viraram um
  `methodLabel` que lê o `PAYMENT_METHOD_LABEL` de `@barbervp/types`.
- **O catálogo só é buscado com o modal aberto** (`usePosCatalogQuery({
  enabled })`). A lista de comandas não mostra serviço nem produto; pedi-lo no
  load da página era uma requisição a mais — e foi ela que expôs o achado #1.
- **`formatTime` usa o fuso do TENANT**, vindo de `/dashboard/shell` (que toda
  tela do painel já pede). Como a aba "Fechadas hoje" é recortada no fuso da
  barbearia no servidor, formatar no fuso de quem olha faria uma comanda
  listada como de hoje aparecer com hora de ontem para um dono viajando.

### Desvios conscientes do protótipo (e por quê)

1. **O walk-in não está no protótipo e ficou.** O passo 1 tem "Abrir sem
   cadastro (avulso)" abaixo da lista: `Order.guestName` existe desde a fase 07
   justamente porque quem chega sem cadastro não pode travar a fila.
2. **O "trocar" abre um painel que EMPURRA o conteúdo, não um flutuante.** Um
   painel absoluto seria recortado pelo `overflow-hidden` do diálogo e viraria
   sheet-dentro-de-sheet abaixo de 768px. Mesmo gatilho, mesma busca, mesma
   lista, mesmo vazio.
3. **A faixa `cliente · barbeiro · trocar` fica logo ABAIXO da barra de título,
   não dentro dela.** Na barra ela dividiria espaço com o `#N` e o ✕ e quebraria
   de linha; como faixa de largura total ela cabe inteira, que é como o
   protótipo se parece.
4. **O "trocar" também troca o BARBEIRO.** O protótipo exibe o barbeiro no
   cabeçalho e não dá como mudá-lo — um dado morto numa comanda que gera
   comissão. `BARBER` não vê esse seletor (e o endpoint recusa).
5. **"Salvar e deixar aberta" só fecha o diálogo.** Cada clique já grava contra
   a API; não existe rascunho para salvar. O botão está lá porque é o par visual
   do "Fechar comanda", e faz o que o nome diz.
6. **A lista de clientes do passo 1 já vem preenchida antes de digitar.** O
   protótipo espera a digitação; o balconista quase sempre quer alguém que
   acabou de chegar.
7. **Paginação real (30/bloco)** onde o protótipo renderiza a lista inteira.
8. **Estoque zerado não some do catálogo** — aparece com "Sem estoque" e
   desabilitado. Sumir faria parecer que o produto nunca foi cadastrado.

### Como conferir rodando

`make seed-demo`, depois `dono@barbeariacentral.com.br` / `BarberVP@2026`:

1. `/app/comandas` — 3 abas com contagem (`Abertas 3 · Fechadas hoje 0 ·
   Todas`); cada card traz `#nº`, cliente, `barbeiro · aberta HH:MM`, o resumo
   dos itens, o subtotal e "Continuar".
2. "Todas" mostra os DOIS blocos: o grid das abertas e a tabela das fechadas de
   hoje, com as 6 colunas na ordem do protótipo.
3. "+ Nova comanda" abre em `Nova comanda #N` com a busca de cliente; escolher
   alguém abre a comanda e o diálogo vira as 3 colunas.
4. Na comanda: clicar num serviço adiciona; o stepper e a lixeira operam; o
   alternador `R$ | %` grava no blur; o card de fidelidade mostra o valor do
   resgate e o saldo; as 5 pastilhas de pagamento incluem "Dividir", que abre as
   4 linhas com a sobra em vermelho até bater com o total.
5. Numa comanda fechada, o menu ⋯ da linha traz "Reabrir comanda" (só OWNER/
   MANAGER), que exige motivo e grava `AuditLog`.
6. Busque por `#1231` ou por um nome inexistente: o vazio é "Nenhuma comanda
   encontrada", com "Limpar busca".
7. Como `carlos@barbeariacentral.com.br` (BARBER): a aba aparece, mas só com as
   comandas dele — e a CONTAGEM da aba também é recortada.
8. Como `dono@barbeariaisolamento.com.br`: a aba renderiza os dados do outro
   tenant, sem vazamento.

> **Atenção ao conferir "Fechadas hoje" logo depois do seed:** o
> `make seed-demo` não fecha comanda no dia corrente, então a aba nasce em 0.
> Feche uma comanda pela tela para ver a tabela preencher.

### Dívidas do agente 17

- **A troca de cliente reprecifica, mas a comanda não avisa o operador.** Se um
  item que estava coberto pela assinatura voltar ao preço cheio, o total muda em
  silêncio. O certo é um aviso na hora da troca dizendo quais itens mudaram de
  preço — pequeno, mas fora do escopo desta aba.
- **A cobertura de assinatura é reavaliada com um `UPDATE` por item.** Numa
  comanda de 3–5 itens é irrelevante; se um dia existir comanda com dezenas,
  vira um `updateMany` por faixa de preço.
- **Dois itens do MESMO serviço coberto podem ambos nascer a R$0.** É
  pré-existente (a fase 07 já se comportava assim) e o fechamento corrige: o
  segundo `debit` falha e o item é recobrado ao preço cheio dentro da transação.
  Mas o total mostrado ANTES de fechar fica otimista.
- **`nextNumber` é uma previsão sem reserva.** Dois caixas abrindo ao mesmo
  tempo veem o mesmo `#N` no cabeçalho do passo 1; os números reais saem
  diferentes e corretos.
- **O split não tem "Tudo"/preencher o restante.** O protótipo também não tem,
  mas o `CloseOrderModal` antigo tinha, e era conveniente.

## O que o agente 16 (auditoria da aba Clientes) entregou

Auditoria 1:1 da aba **Clientes** (`/app/clientes`) contra `Dashboard.dc.html`
l.564–638, o drawer l.3001 e o modal l.3080.

### A tabela de desvios (o passo 1 da fase)

| # | Bloco do protótipo | Existia? | Layout igual? | Botões funcionavam? | Gravidade |
|---|---|---|---|---|---|
| 1 | Chips de filtro com contagem (Todos/Ativos/Inativos 30+/Mensalistas/Bloqueados) | **Não** | — | — | Alta |
| 2 | Tabela de 8 colunas (+ caixa e kebab) | Parcial — 6 colunas, faltavam **Última visita**, **Pontos** e **Faltas**; "Barbeiro favorito" era coluna inventada | Não | Sem menu de linha | Alta |
| 3 | Coluna **Status** com 4 estados | Não — só `Ativo`/`Bloqueado`; não existia `Inativo` nem `Mensalista` em lugar nenhum do produto | Não | — | Alta |
| 4 | Seleção em massa + barra flutuante (4 ações) | **Não** | — | — | Alta |
| 5 | Menu ⋯ da linha (Ver perfil · Agendar · Enviar WhatsApp · Bloquear) | **Não** | — | — | Alta |
| 6 | "Exportar CSV" | **Não** | — | — | Média |
| 7 | Modal "+ Novo cliente" com 6 campos | **Não** — só existia o cadastro rápido (nome + telefone) dentro do modal de agendamento | — | — | Alta |
| 8 | Drawer: KPI **Ticket médio** | Não — os 4 quadros eram Visitas/Total gasto/Faltas/Status | Não | — | Média |
| 9 | Drawer: **4 sub-abas** (Histórico · Fidelidade · Assinatura · Preferências) | **Nenhuma** — o drawer era um formulário de notas | Não | — | Alta |
| 10 | Drawer: rodapé "+ Agendar" / "Enviar mensagem" | **Não** | — | — | Alta |
| 11 | Cabeçalho do drawer com aniversário e selo de pontos | Não | Não | — | Baixa |
| 12 | Busca com debounce no servidor | Parcial — ia à API, mas sem debounce (uma requisição por tecla) | — | — | Média |
| 13 | Estados de erro/vazio próprios | Não — só um vazio genérico; erro derrubava a tabela sem retry | — | — | Média |
| 14 | Papel BARBER | Nav já escondia o item, mas a URL direta montava a aba inteira e só o `fetch` falhava | — | Botões levavam a 403 | Média |

Ao final, zerada.

### Dois achados que valem para as próximas auditorias

1. **`sr-only` dentro de `overflow-x-auto` fura o recorte.** A tabela larga
   rolava a PÁGINA inteira na horizontal a 768px (`scrollWidth` 942 numa
   viewport de 768) — o sintoma que o `responsive-sweep.mjs` reprova. A causa
   não era a tabela: `caption`/`span` com `.sr-only` são `position:absolute`, e
   sem ancestral posicionado o bloco que os contém vira a página, então eles
   escapam do recorte do contêiner de rolagem e esticam o `scrollWidth` do
   documento. Corrigido com `relative` no contêiner, em `packages/ui` — vale
   para TODA tabela larga do produto (Comandas, Financeiro, Relatórios).
2. **Caixa de seleção no card mobile precisa de `<label>` de 44px.** O input é
   24×24 de propósito; o `responsive-sweep.mjs` mede o `label` em volta quando
   existe. Sem ele, cada linha da lista vira uma reprovação de alvo de toque.

### Backend

- **Status é derivado, nunca gravado** (`ClientStatus` em `@barbervp/types`,
  precedência `BLOQUEADO > MENSALISTA > INATIVO > ATIVO`). Um campo persistido
  envelheceria sozinho — quem marcaria "Inativo" no trigésimo primeiro dia? A
  regra vive em UM lugar (`statusWhere` + `deriveStatus`, lado a lado no
  serviço) porque os chips filtram no banco e a coluna pinta na tela: se as
  duas divergirem, o chip "Ativos" lista gente marcada como "Inativo".
- **As contagens são disjuntas e somam o total.** O protótipo cravava números
  que não fechavam (412 ≠ 361+38+24+13). Aqui `all = ativo + inativo +
  mensalista + bloqueado`, com um caso de e2e que afirma isso.
- **Os chips respeitam a busca e ignoram o status escolhido** — senão o chip
  ativo seria o único diferente de zero durante a digitação.
- **"Sem visita nenhuma" não é "inativo".** Quem nasceu há menos de 30 dias e
  ainda não veio é cliente NOVO. O corte usa `lastVisitAt ?? createdAt`.
- **`GET /clients/:id` entrega as 4 sub-abas numa resposta só** — trocar de aba
  no drawer não pede nada ao servidor, e histórico/pontos/assinatura são
  consultas pequenas de UM cliente, não listagens.
- **O histórico sai de `Order` fechada**, não de `Appointment`: é a comanda que
  carrega valor e forma de pagamento, que é o que a linha do protótipo mostra.
- **Mensagem em lote respeita `Client.notifyWhatsapp`** e devolve
  `{ queued, skipped }` — a tela precisa poder dizer que 3 de 10 não vão
  receber, em vez de mentir que foram 10.
- **CSV escapa injeção de fórmula** (`=`/`+`/`-`/`@` no início da célula viram
  fórmula no Excel) e sai com BOM + `;`, que é o que o Excel pt-BR espera.

### Frontend

- `packages/ui`: `ResponsiveTable` ganhou `selection` (coluna de caixas na
  tabela, caixa com alvo de 44px no card mobile) e o `relative` do achado #1.
  `PAYMENT_METHOD_LABEL` foi para `@barbervp/types` — o rótulo do método de
  pagamento estava copiado em 4 telas.
- `apps/web/components/dashboard/clients/`: `client-drawer.tsx` (as 4
  sub-abas), `new-client-modal.tsx`, `bulk-message-modal.tsx` e
  `clients-shared.ts` (aparência de status e de cobrança, formatação, link do
  `wa.me`).
- **Todo botão tem função real**: "Enviar WhatsApp"/"Enviar mensagem" abrem o
  `wa.me` do cliente; "Agendar" navega para `/app/agenda?novo=1&cliente=<id>` e
  o modal de agendamento abre com o cliente JÁ escolhido (novo
  `preselectedClientId`, que busca o cliente pelo id em vez de empurrar o nome
  pela URL); "Exportar" baixa o CSV pelo mesmo cliente axios das outras
  chamadas (um `<a href>` para a API baixaria um 401 em forma de planilha).

### Desvios conscientes do protótipo (e por quê)

1. **Aba "Preferências" é editável.** O protótipo mostra barbeiro favorito e
   observações como texto morto. `PATCH /clients/:id` existe desde a fase 06 e
   esta é a única tela que grava esses dois campos — deixá-los somente-leitura
   tiraria a função sem tirar o bloco.
2. **"Enviar mensagem" em lote ganhou um passo de composição.** O protótipo tem
   o botão e nada mais. Um botão que dispara texto nenhum não é função real.
3. **`Pontos` é `null`, não `0`, quando a barbearia não tem programa.** Regra 2
   da fase 13: "não pontua" e "pontuou zero" são afirmações diferentes. A
   coluna mostra `—` no primeiro caso.
4. **`BARBER` que digita a URL vê uma tela de "sem acesso"**, não a aba com
   botões que só sabem devolver 403.
5. **Paginação real (20/página)** onde o protótipo renderiza a lista inteira.
6. **Não há "selecionar todos" abaixo de `md`** — a caixa do cabeçalho é da
   tabela, e abaixo de `md` não há tabela. A seleção por card continua.

### Como conferir rodando

`make seed-demo`, depois `dono@barbeariacentral.com.br` / `BarberVP@2026`:

1. `/app/clientes` — chips somam 40 (22+12+5+1); a tabela mostra as 8 colunas.
2. Clique numa linha: o drawer traz ticket médio calculado, histórico de
   comandas fechadas com serviço·barbeiro·pagamento, extrato de pontos e — em
   quem é mensalista — plano, "Usos neste ciclo: X/Y" e o selo de cobrança
   (`PAST_DUE` do seed aparece como "Cobrança atrasada").
3. Menu ⋯ → "Agendar": cai na Agenda com o cliente já no passo 1.
4. Marque 2 linhas: a barra flutuante acende com as 4 ações.
5. Como `carlos@barbeariacentral.com.br` (BARBER): o item some do nav e a URL
   direta mostra a tela restrita.
6. Tenant sem cliente nenhum: chips em 0 e o vazio com CTA — a aba inteira
   renderiza sem quebrar.

### Dívidas do agente 16

- **Contagem dos chips = 5 `COUNT(*)` por página.** No volume de uma barbearia
  (centenas de clientes) é irrelevante; se um tenant passar de dezenas de
  milhares, vira uma agregação só com `GROUP BY` sobre a expressão de status.
- **`GET /clients/export` é síncrono, com teto de 5.000 linhas.** Acima disso o
  CSV precisa virar job + download por link.
- **Mensagem em lote não tem histórico na UI.** O envio grava em
  `NotificationOutbox` e em `AuditLog`, mas a aba WhatsApp ainda não lista
  disparos avulsos — entra na auditoria do agente 22.
- **Sem ordenação por clique no cabeçalho.** O backend aceita `sort`/`order`
  desde a fase 06; a tabela ainda fixa `lastVisitAt desc`, como o protótipo.

## O que o agente 14 (seeds de auditoria) entregou

Pré-requisito das auditorias de aba 15–28: **sem dado, bloco vazio e bloco
faltando são indistinguíveis**. O trabalho foi separar o seed do SPEC do seed
de demonstração e fazer o segundo encher todas as 14 abas com números que
fecham entre si.

### A separação

| Comando | Arquivo | O que planta |
|---|---|---|
| `make seed` | `prisma/seed.ts` | O do SPEC, inalterado: 2 tenants, 4 barbeiros do booking, 10 clientes, 24 agendamentos, 12 comandas. |
| `make seed-demo` | `prisma/seed-demo.ts` + `seed-demo-data.ts` | Roda o seed base e **engorda** o tenant demo; enche o secundário com o mínimo de cada módulo. |

`seed.ts` mudou o mínimo para isso: exporta os helpers de data/`prisma`, o
`main` virou `seedBase()` e a auto-execução ficou atrás de
`require.main === module`. A limpeza de clientes passou a ser por PREFIXO de
telefone (`SEED_CLIENT_PHONE_PREFIX`), porque o demo planta 30 clientes a mais
na mesma faixa e a 2ª execução colidiria no `@unique`.

### O que o demo planta (tenant `barbearia-central`)

- **Equipe**: 5 barbeiros (Maria Fernanda entra só aqui — o SPEC fixa a equipe
  do booking em 4), escalas diferentes com folga própria, 1 exceção de folga
  avulsa e 1 convite PENDENTE cujo link de aceite é impresso no fim do seed.
- **Clientes**: 40, com a distribuição que ACENDE cada alerta — 12 sem visita
  há 30+ dias, 3 aniversariantes na semana corrente, 2 com exatamente 2 faltas
  (o ⚠ da agenda) e 1 com 3 (bloqueado).
- **Agenda**: ~1.360 agendamentos — 8 meses de histórico esparso (para as
  sparklines de 8 pontos), 60 dias densos e 7 dias à frente, nos 5 status.
- **Comandas**: ~1.200 fechadas, com serviço e produto, 5 formas de pagamento,
  desconto percentual/fixo, pagamento dividido e cobertura por assinatura;
  3 abertas agora.
- **Financeiro**: caixa de ONTEM fechado com diferença de R$ 2,00 e nenhum
  aberto hoje (é a ausência que acende o alerta), 12 contas a pagar (3 na
  semana), 8 a receber, 2 vales, 2 contas bancárias.
- **Assinaturas**: 5 assinantes com uso parcial do ciclo e 1 cobrança recusada
  (`PAST_DUE` + `Payment` `FAILED`).
- **Resto**: 10 produtos (2 no mínimo), 15 mensagens no `NotificationOutbox`,
  12 `AuditLog`, 24 mensagens do Assistente IA, 13 avaliações.

### O tenant secundário deixou de ser vazio

`barbearia-isolamento` ganhou login próprio
(`dono@barbeariaisolamento.com.br`) e o mínimo em CADA módulo. Ele é a prova
visual de isolamento — e o único lugar onde dois gates dá para exercitar, já
que o demo assina o Avançado (ilimitado nos dois): o **limite de barbeiros do
plano** (Essencial, 2 de 2 em uso) e a **cota do Assistente IA** (12 de 50).
A suíte `test:isolation` não usa nenhum dos dois: ela monta os próprios
fixtures e continua verde.

### Decisões

1. **Volume acima do pedido, e de propósito.** O enunciado pedia ~60 comandas
   no mês; o seed planta ~350 no mês corrente e ~540 no anterior. Com 60, o
   gráfico "Faturamento — últimos 30 dias" ficaria 20x abaixo da linha de meta
   (R$ 28.000) e a home pareceria quebrada. Com o volume atual a média diária
   (R$ ~980) encosta na meta diária (R$ ~903) — que é como o protótipo desenha.
2. **Janela densa de 60 dias, não 30.** Com 30, o mês anterior ficava pela
   metade e nenhum barbeiro cruzava a 1ª faixa da comissão por faturamento —
   a aba Comissões nunca exibiria uma faixa que não a primeira. Com 60, o Diego
   fecha o mês anterior com 40% + 45% e existe um mês inteiro fechado para
   cruzar com os relatórios.
3. **Faltas por calendário, não por probabilidade.** Sortear "8% dos
   atendimentos" concentrava as faltas na janela densa (20x mais atendimentos
   por dia que o histórico): o KPI ficava com um pico solitário e zero no
   resto. Uma falta a cada 5–9 dias, com fila de clientes que não repete,
   distribui as ~35 faltas uniformemente e mantém a distribuição exata que a
   auditoria pede (2 clientes com 2 faltas, 1 com 3).
4. **`entryDay` por cliente.** `ClientProfile.firstVisitAt` é o eixo do KPI
   "Novos clientes"; sem uma data de estreia por cliente, todo mundo estreava
   no mês mais antigo e a sparkline caía a zero e ficava lá.
5. **`updatedAt` gravado à mão nos agendamentos.** O sino lista confirmações e
   cancelamentos cujo `updatedAt` cai HOJE. Com o default do `@updatedAt`, os
   ~1.300 agendamentos nasciam "atualizados agora" e o feed virava uma lista
   aleatória de eventos de meses atrás.
6. **Lembretes só de D+2 em diante.** O lembrete sai 24h antes; para um
   atendimento de amanhã ele já nasce vencido, e o dreno da fila (fase 09) o
   entrega no primeiro minuto de API no ar — a aba WhatsApp abriria sem
   nenhuma mensagem "agendada".
7. **Fidelidade sem pontos/sorteios novos.** O design atual da aba só tem
   Assinaturas (ver `auditoria/agente-21-fidelidade.md`), então o demo não
   engorda razão de pontos nem sorteio: fica o que o seed base já planta.
8. **PRNG determinístico.** Mesmo dia, mesmo banco, linha por linha — "sumiu um
   dado" nunca é dúvida entre bug e sorteio.

### Como conferir que continua coerente

O seed imprime os números que a home deve mostrar. Além disso, estas 12
consultas devem devolver ZERO (rodam em `make psql`): pagamento ≠ total da
comanda · subtotal ≠ soma dos itens · total ≠ subtotal − desconto · comissão ≠
base × percentual · comissão com base ≠ item · comissão sobre item coberto por
assinatura · serviço faturado sem comissão · uso de assinatura > quota ·
estoque negativo · perfil com visita e sem `lastVisitAt` · agendamento antes do
início da escala · agendamento em dia de folga.

## O que a fase 13 entregou

Auditoria 1:1 da tela **Dashboard** (`/app`) contra `Dashboard.dc.html`
(linhas 60–400). Não é uma fase de features novas: é a conferência de que o
que existe no protótipo existe no produto, com a mesma estrutura e dado real.

### Os desvios encontrados — a lista que orienta a auditoria das demais telas

Este é o achado principal da fase. Os mesmos padrões devem ser procurados em
cada tela restante (ver `agentes/auditoria/`).

| # | Desvio | Onde | Gravidade |
|---|---|---|---|
| 1 | **Topbar quase inexistente.** Faltavam seletor de unidade, selo do plano, busca global, CTA "Novo agendamento" e sino. O menu do avatar tinha só o e-mail (desabilitado) e "Sair" — sem "Meu perfil", sem "Configurações", sem divisor. | `dashboard-chrome.tsx` | Alta |
| 2 | **Blocos de conteúdo ausentes.** Dos 4 blocos do protótipo (KPIs, gráficos, ranking+próximos, alertas), existia 1 e meio: 4 KPIs em vez de 6, e uma versão reduzida de "Próximos atendimentos". Gráfico de faturamento, serviços mais vendidos, ranking de barbeiros e a faixa de alertas: nenhum. | `app/page.tsx` | Alta |
| 3 | **Sem endpoint para a tela.** A página montava os números somando no cliente o que `GET /staff-agenda` devolvia. Não havia faturamento, ticket médio, ocupação, faltas, novos clientes, ranking nem alertas em lugar nenhum da API. | backend | Alta |
| 4 | **Menu do avatar sem navegação.** Ver #1 — item explícito do critério de aceite. | `dashboard-chrome.tsx` | Média |
| 5 | **Sem fechamento de menu por clique fora.** O `anyMenuOpen` do protótipo (um `<div>` fixo cobrindo a tela) não existia; não havia menu suspenso nenhum na topbar para precisar dele. | `packages/ui` | Média |
| 6 | **Rodapé da sidebar errado.** Mostrava nome do usuário e da barbearia; o protótipo mostra o card do plano ativo com preço e CTA de upgrade, mais o aviso de teste. | `dashboard-chrome.tsx` | Média |
| 7 | **Badge "IA" do nav não era renderizada.** `AppShellNavItem.badge` existia no componente desde a fase 02 e nunca foi preenchida. | `dashboard-chrome.tsx` | Baixa |
| 8 | **Cadeado do nav não refletia o plano.** `locked` só marcava rota não implementada; `comissoes`/`fidelidade` fora do plano apareciam normais. | `dashboard-chrome.tsx` | Média |
| 9 | **`/app` inalcançável no ambiente semeado.** O seed do tenant demo nunca marcava `onboardingDoneAt`, então o `DashboardGuard` mandava todo login do seed para o wizard. É por isso que a varredura responsiva vinha medindo a tela de onboarding e dando `/app` como verde. | `prisma/seed.ts` | **Alta** |
| 10 | **Alvos de toque abaixo de 44px na topbar e no toggle do gráfico.** Mesma família da dívida da fase 11. | vários | Média |

O #9 merece destaque na auditoria das outras telas: **um verde da varredura
não prova que a tela foi medida** — prova que *alguma* tela foi medida naquela
URL.

### Backend

`apps/api/src/dashboard/` — módulo novo, três controllers (`/dashboard`,
`/search`, `/notifications`), quatro serviços. Importa `StaffAgendaModule` só
pelo `StaffScopeService` que ele exporta.

- **`DashboardOverviewService`** — ~12 agregações disparadas em `Promise.all`,
  todas com `GROUP BY` no banco. Nenhuma cresce com o número de linhas
  exibidas, e nenhuma varre linha a linha em JS. As séries de 8 pontos
  (sparklines) e as variações percentuais saem da MESMA consulta: o delta de
  faturamento é `série[7] vs série[6]`, não uma segunda query.
- **`DashboardShellService`** — separado do overview de propósito: a casca é
  comum às 14 telas e o overview é caro. Quem abre `/app/agenda` precisa do
  selo do plano, não das agregações do dashboard.
- **`GlobalSearchService`** — três consultas paralelas, 5 linhas cada.
- **`NotificationsService`** — feed derivado (ver dívidas).

### Frontend

- `packages/ui`: **`Popover`** (dropdown ≥768px, bottom-sheet abaixo — com o
  fundo clicável que o protótipo chama de `anyMenuOpen`), **`Donut`**
  (`conic-gradient`, usado no KPI de ocupação e no card de serviços),
  **`AreaChart`** (área com gradiente, linha de meta tracejada e tooltip por
  ponto) e **`Segmented`** (Dia/Semana/Mês). `StatCard` ganhou `delta.tone` e
  `sparklineTone`; `AppShell` ganhou `topbarCenter`.
- `apps/web/components/dashboard/topbar/`: seletor de unidade, busca global,
  sino e menu de conta. `home/`: os cinco blocos da página.

### Decisões que valem para as próximas telas

1. **Componente ≠ dado.** Nenhum número do protótipo entrou no frontend. O
   `grep` do critério de aceite (`1.240`, `62,40`, `24.680`, `28.000`,
   `Diego Martins`) não acha nada em `apps/web/components/dashboard` nem em
   `packages/ui`. Os únicos hits no repositório são o `/app/playground`, que é
   a galeria de componentes da fase 02 — vitrine, não tela de produto.
2. **`null` não é `0`.** Todo `...DeltaPct` é `null` quando não há base de
   comparação. "Não dá para comparar" e "não mudou" são afirmações diferentes,
   e a UI as pinta diferente (sem linha vs. seta cinza).
3. **Série toda zerada não vira linha.** `StatCard` suprime a sparkline quando
   todos os pontos são `0`: um traço reto no rodapé do card lê como "houve
   movimento constante", quando o que houve foi nada.
4. **A seta e a cor são coisas separadas.** "Faltas ▼ 30%" é verde e
   "Faturamento ▼ 30%" é vermelho. `StatDelta.direction` descreve o número,
   `StatDelta.tone` descreve o que ele significa para o negócio.
5. **A meta é dado da barbearia.** `TenantSettings.monthlyGoalCents`, nullable.
   Sem meta, o gráfico não desenha a linha — em vez de fingir uma.
6. **Bloco escondido pelo plano diz que foi o plano.** `lockedByPlan` no
   overview; o front mostra upsell em vez de caixa vazia mentindo que não há
   dado.

### O que ficou aberto de propósito

- **Meta mensal sem controle na UI.** O campo existe e é gravável por
  `PATCH /settings/preferences`, mas a tela de Configurações ainda não o expõe.
  Entra na auditoria de Configurações.
- **Gate de plano só no alerta de contas.** Os demais blocos do dashboard
  (serviços mais vendidos, ranking) ficaram abertos em todo plano porque é
  assim no protótipo: os cadeados do `Dashboard.dc.html` estão nos itens de nav
  (`comissoes`/`fidelidade`) e no "+ Nova unidade", não nos cards. O alerta de
  contas é a exceção porque seu botão levaria a uma tela que devolve 403.

## O que a fase 11 entregou

Refactor **estrutural e mecânico**: nada de comportamento mudou. As 4 apps
Next.js (`site`, `booking`, `dashboard`, `admin`) viraram uma só, `apps/web`,
com `apps/api` intacto. De 5 processos Node em dev para 2.

### A nova árvore

```
apps/web/
  middleware.ts                roteamento por host + cabeçalhos por superfície
  app/
    layout.tsx                 raiz mínima: <html>/<body>, fontes, globals.css
    providers.tsx              EstablishmentProviders · ClientProviders
    robots.ts                  um robots.txt, decidido pelo HOST
    (marketing)/               ← de apps/site            INDEXADO
      page.tsx                 /            landing de vendas (ISR 1h)
      (auth)/                  /entrar · /cadastro · /recuperar-senha
    (booking)/                 ← de apps/booking         INDEXADO
      [slug]/                  /{slug}      página pública da barbearia
      agendar/                 /agendar     raiz explicativa do booking
    (dashboard)/app/           ← de apps/dashboard       noindex
      page.tsx  agenda/  clientes/  comandas/  comissoes/  financeiro/
      fidelidade/  relatorios/  whatsapp/  assistente-ia/  configuracoes/
      minha-pagina/  equipe/  servicos-produtos/  configurar/
      selecionar-barbearia/  aceitar-convite/  impersonar/  playground/
    (admin)/admin/             ← de apps/admin           noindex
      page.tsx  tenants/  planos/  billing/  metricas/  filas/  mensagens/
  components/{marketing,booking,dashboard,admin}/    namespaced por superfície
  lib/{marketing,booking,dashboard,admin}/           idem
  lib/urls.ts                  o ÚNICO módulo compartilhado entre superfícies
```

`components/` e `lib/` foram namespaced por superfície porque `dashboard` e
`admin` tinham, os dois, um `lib/api/` — juntá-los sem prefixo colidiria em 6
arquivos. Os imports relativos frágeis (`../../components/x`) viraram alias
`@/` em toda a árvore.

### Mapa host → prefixo

| Host (produção) | Prefixo | Superfície |
|---|---|---|
| `barbervp.com` | `/` | marketing (landing + auth) |
| `agendar.barbervp.com` | `/agendar` e `/{slug}` | booking público |
| `app.barbervp.com` | `/app` | painel da barbearia |
| `admin.barbervp.com` | `/admin` | super admin |

O middleware lê `HOST_SITE`/`HOST_BOOKING`/`HOST_APP`/`HOST_ADMIN`. **Sem essas
variáveis o app roda em "prefixo direto"** — que é exatamente o modo de
desenvolvimento: `localhost:3000/`, `/agendar`, `/{slug}`, `/app/*`, `/admin/*`.
Verificado que o Next lê essas variáveis em RUNTIME no middleware (o build foi
feito sem elas e o roteamento funcionou ao subir com elas), então o
`docker-compose.prod.yml` pode passá-las por ambiente sem rebuild.

A reescrita de host tolera as duas formas de URL: `app.barbervp.com/agenda`
(URL antiga, de quando o painel tinha domínio só seu) e
`app.barbervp.com/app/agenda` (a que os links internos usam) resolvem para a
mesma rota — o `startsWith` do prefixo evita virar `/app/app/agenda`.

### Guarda do super admin (obrigatória)

`/admin/*` só responde no host do admin; em qualquer outro host o middleware
devolve **404 seco**, antes de qualquer render. Isso compensa a perda da
separação física em quatro deploys. A defesa REAL continua sendo o RBAC
`SUPER_ADMIN` server-side, que não foi tocado. Só vale com `HOST_*` definidos —
em dev o admin abre por `localhost:3000/admin`.

Verificado ao vivo com `curl -H "Host: ..."`:

| Host | `/admin/tenants` |
|---|---|
| `admin.barbervp.com` | 200 |
| `app.barbervp.com` | **404** |
| `barbervp.com` | **404** |
| `agendar.barbervp.com` | **404** |

### Providers, tema e SEO

- **Um `QueryClientProvider` por route group**, não global. A landing continua
  sem TanStack Query e sem `EstablishmentAuthProvider`: 89 kB de first-load
  contra 181 kB das telas de auth do mesmo grupo. O grupo `(auth)` aninhado
  dentro de `(marketing)` preserva exatamente o arranjo da fase 10.
- **Duas audiências, dois providers**: `EstablishmentProviders` (marketing/auth,
  painel, admin) e `ClientProviders` (booking). Como antes, o dono pode estar
  logado no painel numa aba e agendando como cliente noutra.
- **Tema**: o layout raiz declara `colorScheme: 'dark'`; a landing sobrescreve o
  `viewport` na própria rota e o `body:has(#bvp-landing)` do `globals.css`
  continua pintando o fundo claro. Fontes no raiz (Sora + Inter 400–900) — o
  navegador só baixa a face que a página renderiza, então a landing não paga
  pelo Sora que não usa.
- **`robots.txt` é decidido pelo host**: `Disallow: /` nos hosts do painel e do
  admin (como era em `apps/dashboard` e `apps/admin`), allow + disallow dos
  prefixos internos nos hosts públicos.
- **Canonical do booking virou absoluto** quando `NEXT_PUBLIC_BOOKING_URL` está
  definida. É a única mitigação de SEO que o merge exigiu: a rota `/{slug}`
  agora responde em qualquer host, e sem isso a página da barbearia poderia ser
  indexada também sob o domínio de marketing. Sem a variável (dev), volta a ser
  relativa — igual a antes.

### `lib/urls.ts` — de origens para caminhos

Antes cada app tinha o seu `urls.ts` com as origens das outras três, e navegar
entre superfícies era `window.location.assign('http://localhost:3002')`. Agora é
um módulo só, e por padrão os destinos são **caminhos relativos** (`/app`,
`/admin`, `/entrar`, `/agendar`): funciona em `localhost:3000` sem configurar
nada, e o visitante fica no host em que já estava. Definir os
`NEXT_PUBLIC_*_URL` faz os links apontarem para o host de produção correto.
`SITE_ORIGIN` e `BOOKING_ORIGIN` ficam separados porque `metadataBase` e o
JSON-LD exigem URL absoluta.

### Guardas de sessão

Migrados como estavam, não reinventados: `DashboardGuard` (login, seletor de
barbearia quando há mais de um `Membership`, wizard de onboarding pendente) e
`AdminGuard` (`user.isSuperAdmin`). O único ajuste foi manter a ida ao login
como navegação DURA — antes ela era dura por acidente (o login estava noutra
origem, e o `navigate` do guard fazia `window.location` para qualquer URL
absoluta); agora é dura por escolha explícita, para não mudar o ciclo de vida
do provider de sessão.

Ao verificar isso, descobriu-se que o caminho do anônimo já estava quebrado
ANTES da fase 11, por um deadlock no interceptor de refresh de `packages/ui` —
ver dívidas da fase 11. Não foi corrigido aqui: `packages/ui` está intacto, e
consertar isso é mudança de lógica, que esta fase não podia fazer.

### Infra

- `turbo.json`, `Makefile`, `docker-compose.yml`, `docker-compose.prod.yml`,
  `Dockerfile.dev`, `.env`/`.env.example` e o CI: onde havia 4 alvos de web,
  passou a haver 1. `pnpm turbo run lint typecheck` foi de 17 para **11/11**;
  `build`, de 6 para **3/3**.
- **Build isolado garantido por CI**: dois passos novos rodam
  `pnpm --filter @barbervp/web... build` e `pnpm --filter @barbervp/api... build`
  separadamente. Vercel e Railway buildam UM pacote cada — se o build de um
  passar a exigir o outro, o deploy quebra em silêncio, e agora o CI pega.
  `make build-web` / `make build-api` rodam o mesmo contrato na mão.
- `scripts/responsive-sweep.mjs` continua organizado por superfície (é assim que
  se lê o resultado), mas as quatro apontam para a porta 3000 com os prefixos
  novos.
- `docker-compose.yml` da raiz **continua existindo** para desenvolvimento
  local, como o agente 11 pede. Railway não o usa.
- Dependência órfã removida: `zustand` estava nas 4 apps e não era importada em
  lugar nenhum. Nenhuma colisão de chave de storage entre superfícies
  (`bvp:guest` do booking, `bvp_impersonation` do painel, `bvp-palette` da
  landing são todas distintas), então nada precisou ser prefixado.

### Deploy alvo (configuração é do agente 12)

- **Frontend `apps/web` → Vercel.** Next 14 roda sem ajuste. Definir `HOST_*` e
  os `NEXT_PUBLIC_*_URL` nas variáveis do projeto, e apontar os quatro domínios
  para o MESMO projeto.
- **Backend `apps/api` + Postgres + Redis → Railway, plano Hobby.**
- O `docker-compose.yml` da raiz segue sendo o ambiente local. Não remover.

## O que a fase 10 entregou

- **A landing de vendas** (`apps/site/app/page.tsx`) — última tela do bundle
  pendente, que era um `PlaceholderScreen` de 14 linhas desde a fase 01. Dez
  seções na ordem do protótipo: nav sticky, hero com mock de dashboard, 4
  stats, 7 funcionalidades, 4 passos, planos, 3 depoimentos, FAQ, CTA final e
  rodapé. Server Component com **ISR de 1h**; só nav (drawer mobile + scroll
  suave) e FAQ (accordion) são ilhas client.
- **`GET /public/saas-plans`** — preço e bullets saem do banco, nunca do
  frontend. Mudar o preço no super admin aparece na landing na revalidação
  seguinte, sem deploy.
- **Coluna `SaasPlan.marketing`** (`PlanMarketing`: `baseLabel` + bullets),
  migration `20260818140000_saas_plan_marketing`, semeada com os textos exatos
  do protótipo para os três planos.
- **SEO**: `metadataBase` + canonical absoluto, OG/Twitter, e JSON-LD
  `SoftwareApplication` (com as ofertas dos 3 planos) + `FAQPage` com as 6
  perguntas — tudo da mesma fonte que a tela renderiza.
- **Varredura responsiva verde** nos 5 tamanhos (`node
  scripts/responsive-sweep.mjs --app=site`), incluindo as três telas de auth,
  que não regrediram.

## O que a fase 09 entregou

- **Filas BullMQ de verdade** (`apps/api/src/queue/`) — fecha as dívidas
  "BullMQ continua desligado" das fases 04, 05 e 08. Quatro filas, uma por
  natureza de trabalho, para que uma renovação travada não segure o lembrete
  de ninguém: `outbox` (varre a cada 60s), `subscriptions` (03h),
  `billing` (04h) e `maintenance` (05h), todas com `attempts: 3` e backoff
  exponencial a partir de 30s. `QueueSchedulerService` registra os cron no
  boot com `jobId` fixo por fila e **remove os agendamentos anteriores antes**
  — mudar a hora no env não deixa o cron velho vivo ao lado do novo.
- **Painel de jobs próprio** (`/admin/queues` + tela `/filas`), não
  bull-board: o bull-board traria um Express paralelo com autenticação própria,
  fora do `JwtAuthGuard`/`RolesGuard` que protegem todo o resto — um segundo
  portão para manter seguro em troca de uma tabela que o design system já sabe
  desenhar. O painel mostra o RESUMO que cada processor devolve (quantas
  mensagens saíram, quantas assinaturas renovaram), não só verde/vermelho.
- **`dispatchDue()` entrou nos contratos** de `NotificationAdapter` e
  `MailAdapter`. É o que permite o job entregar o lembrete agendado sem
  conhecer driver concreto: um provedor com agendamento nativo já entregou e
  devolve zeros; o driver mock varre o próprio outbox. A entrega reivindica
  cada linha (`updateMany` no `attempts` antes de entregar), então dois
  workers na mesma rodada não enviam a mesma mensagem duas vezes.
- **Faxina de dados** (`MaintenanceService`) — dívida da fase 03. Retenções
  deliberadamente diferentes: OTP 7 dias, sessão 30, outbox 30, `AuditLog`
  365 (registro de conformidade, não dado operacional).
- **Tela "Mensagens enviadas"** (`/mensagens`) — a trilha dos dois outboxes,
  com destinatário mascarado: quem opera a plataforma precisa saber que a
  mensagem saiu e com que corpo, não ler o telefone do cliente de outra
  empresa.
- **Suíte de isolamento COMPLETA (o gate): 52 → 106 casos.** O arquivo novo
  `full-coverage.isolation-spec.ts` (54 casos) varre a MATRIZ — para cada
  recurso de negócio das fases 01–08, uma leitura e uma escrita cruzadas com o
  token do tenant errado. O fixture passou a criar um registro de CADA recurso
  nos dois tenants, e os dois nascem no plano Avançado de propósito: sem isso,
  metade dos endpoints responderia 403 por feature gate e um 403 de plano seria
  confundido com um 403 de isolamento — o teste passaria sem provar nada.
- **E2E dos 3 fluxos críticos** (`critical-flows.e2e-spec.ts`, 17 casos):
  cadastro → onboarding → 1º serviço → agendamento público com corrida de slot
  → comanda → fechamento → comissão (valor conferido: 40% da regra criada) →
  relatório; cliente com OTP → assinatura → agendamento coberto → uso
  decrementa → exportação LGPD; super admin troca o plano e o gate do tenant
  muda com o MESMO token, sem novo login.
- **Hardening**: rate limit contado no **Redis** (dívida da fase 03 — em
  memória, N réplicas davam a cada uma o seu teto), com
  `throttle-redis.e2e-spec.ts` provando que duas instâncias compartilham o
  contador; teto de payload explícito de 256kb; violação de CHECK deixou de
  virar 500; corpo grande demais era **500 e agora é 413**; 4 índices novos
  nas consultas de relatório.
- **Varredura responsiva AUTOMATIZADA** (`scripts/responsive-sweep.mjs`,
  `make responsive`) — fecha a dívida "sem teste de frontend" arrastada desde
  a fase 02. Abre cada tela num Chrome de verdade e mede rolagem horizontal,
  alvo de toque e erro de console nos 5 tamanhos. **Achou 8 defeitos reais**
  de alvo de toque (`IconButton`/`Button` pequenos, título do card da
  `ResponsiveTable`, olho da senha, links isolados das telas de auth, rótulo
  de checkbox), todos corrigidos mantendo a densidade do protótipo no desktop
  (`h-11 md:h-10`). As 4 apps passam limpas.
- **CI** (`.github/workflows/ci.yml`) — dívida da fase 01. Dois jobs:
  estático (lint + typecheck + build) e testes com Postgres e Redis de
  serviço, com a suíte de isolamento por último, explicitamente como gate.

## Decisões tomadas

- 2026-09-04 (agente 30) — **Concluir a configuração inicial é OBRIGATÓRIO para
  acessar o painel.** Regra de produto do dono, não inferência: não existe
  "explorar antes" nem "continuar depois". Consequências, todas nesta fase: os
  dois botões que a contradiziam saíram (o "Pular e explorar o painel" e o
  "×"), o wizard deixou de reabrir depois de concluído, e a obrigatoriedade
  passou a valer no SERVIDOR — o guard do navegador é conveniência, não
  barreira. **O que a torna barata de manter é a lista de passos obrigatórios
  em `@barbervp/types` (`REQUIRED_STEPS`)**: a API recusa e a tela avisa pelo
  MESMO conjunto.
- 2026-09-04 (agente 30) — **`complete` confere o DADO gravado, não o contador
  `onboardingStep`.** O contador sobe com "Pular etapa" sem nada ser salvo
  (decisão da fase 03, que continua valendo), então validá-lo deixaria passar
  exatamente o caso que a verificação existe para pegar. Custo: quatro
  consultas em paralelo por chamada de `complete`, uma vez na vida da
  barbearia.
- 2026-09-04 (agente 30) — **Municípios via IBGE, consultados pela API e
  cacheados no Redis por 30 dias — pelo MESMO motivo da ViaCEP** (fase 03): o
  CSP das apps não precisa liberar host externo, o cache serve toda a base, e
  trocar de provedor não toca frontend. As 27 UFs, essas, são lista estática em
  `@barbervp/types` — chamada externa para servir 27 itens imutáveis seria
  latência sem ganho. E os 5.570 municípios não entram no bundle: seriam
  ~150 kB carregados por todo dono para escolher um item.
- 2026-09-04 (agente 30) — **A cidade é identificada pelo CÓDIGO IBGE, não pelo
  nome.** É o que permite ao CEP selecionar o município no combo sem depender de
  grafia: "Ribeirão Preto" com e sem acento é o mesmo lugar, e comparar texto
  seria uma armadilha silenciosa — o endereço pareceria certo na tela e o
  município ficaria não identificado. Coluna nova
  `TenantSettings.addressCityIbge`; a linha única `address` não mudou de forma.
- 2026-09-04 (agente 30) — **Logo e capa têm UM caminho de escrita.**
  `PUT /onboarding/identity` recusa `logoUrl`/`coverUrl`: com dois donos para o
  mesmo campo de `TenantSettings`, uma URL digitada apagaria o arquivo que o
  dono acabou de subir, sem aviso. O upload é o de `POST /my-page/images/:slot`,
  não uma rota nova.
- 2026-09-04 (agente 30) — **O vocativo do wizard não é um pedaço de e-mail.**
  `greetingName` devolve vazio — e a tela cumprimenta sem nome — quando o nome
  do cadastro contém `@`, é igual ao pedaço local do e-mail ou não tem letra
  nenhuma. Sem vocativo é melhor que com o vocativo errado. Desvio consciente do
  enunciado: ele supunha que o `rafael` minúsculo viesse do e-mail, e **não
  vinha** (foi conferido no banco: a pessoa digitou assim). Como o que incomoda
  é a leitura, o primeiro nome vai com a inicial em maiúscula — nome próprio em
  título de 30px lê como dado de máquina quando vem todo minúsculo.
- 2026-09-04 (agente 30) — **`?passo=N` em `/app/configurar`.** Nasceu para a
  varredura responsiva conseguir endereçar cada passo (trocar a viewport
  recarrega a página, e o passo é estado do cliente), e fica porque é alcance
  que o wizard já dava por "Voltar"/"Continuar". Não pula validação: cada passo
  salva pelo seu endpoint e `complete` recusa o que falta.
- 2026-09-03 (agente 29) — **Cor do bloco da Agenda: STATUS, com o serviço
  como acento.** O protótipo colore por status nas três visões
  (`STATUS_COLORS`, l.5055/5071/5091) — a suposição registrada de que
  colorisse por SERVIÇO estava errada, e foi conferida no arquivo. Mas o
  catálogo tem um campo chamado "Cor na agenda" (l.1993) que não fazia nada.
  Honrar os dois: tom do bloco pelo status, `Service.color` como faixa lateral
  de 4px.
- 2026-09-03 (agente 29) — **Timeline FICA, com desenho próprio.** A decisão
  que o enunciado pedia já estava tomada pelo código não registrado do agente
  15: `agenda-timeline.tsx` porta a l.533–563. Nada a remover do seletor.
- 2026-09-03 (agente 29) — **"Clientes" NÃO volta ao nav do barbeiro.** O
  `DashboardFuncionario.dc.html` (l.1615) tem o item; o `SPEC.md` → RBAC não
  dá ao `BARBER` acesso à base de clientes, e `/clients` é
  `@Roles('OWNER','MANAGER')` desde a fase 06. Mostrar levaria a um 403;
  abrir a rota afrouxaria o RBAC. Desvio consciente, escrito em `nav.ts`.
  Reabrir exige antes decidir o RECORTE no servidor — é fase de produto.
- 2026-09-03 (agente 29) — **Programa de pontos mora em Configurações →
  Preferências.** É regra de OPERAÇÃO da casa (vizinha do bloqueio por faltas
  e da antecedência mínima), não dado cadastral — que é a aba Barbearia.
- 2026-09-03 (agente 29) — **`GET|PUT /barbers/:id/work-schedule` REMOVIDAS.**
  Sem consumidor desde a fase 06, e o `PATCH :id` já grava a escala em
  transação única enquanto o `GET :id` já a devolve. Dois caminhos de escrita
  para o mesmo dado divergem; rota que ninguém chama não tem quem perceba
  quando quebra. Os casos de isolamento foram reescritos, não apagados.
- 2026-09-03 (agente 29) — **`DashboardGuard` mantém a navegação DURA**, agora
  por motivo próprio e não por herança: os três route groups montam cada um o
  seu `EstablishmentAuthProvider`, e a navegação suave abriria janela para
  dois `POST /auth/refresh` simultâneos — que rotacionam o cookie e disparam a
  detecção de reuso, revogando a família inteira.
- 2026-09-03 (agente 29) — **`loading.tsx` de `/{slug}` removido para o 404
  voltar a ser 404.** Ele criava o limite de Suspense que fazia a casca sair
  com status 200 antes do `fetch` resolver. Medido nos dois estados; custo
  zero, porque `generateMetadata` já aguarda o mesmo fetch (deduplicado,
  `revalidate: 60`) e nenhuma navegação interna aponta para a rota.
- 2026-09-03 (agente 29) — **`avatarUrl` sai do `UpdateBarberDto`.** Com o
  upload real em `POST /barbers/:id/avatar`, aceitá-lo também no `PATCH` seria
  um segundo caminho de escrita para a mesma coluna, esse sem validação de
  tipo nem de tamanho.
- 2026-09-03 (agente 29) — **Recorrência de agendamento fica ausente.** É o
  único desvio da tabela do agente 15. Portá-la exige modelo de série (o que é
  "cancelar só esta ocorrência"? mover uma do meio? escala que muda no meio da
  série?) — cada pergunta é regra de produto. Um seletor gravando campo que
  ninguém lê seria o botão decorativo que a regra 2 proíbe.

- 2026-08-24 (agente 25) — **`StorageAdapter` em vez de upload direto no
  serviço.** `MyPageService` grava um `Buffer` e recebe uma URL; quem sabe se
  o byte vai para o disco do container ou para um bucket é a factory de
  `AdaptersModule`, como já acontece com notificação, pagamento e e-mail. Foi
  o que permitiu fechar a dívida de upload sem escolher provedor de nuvem
  agora.
- 2026-08-24 (agente 25) — **O "Preview ao vivo" consome
  `PublicPageService`, não uma consulta própria.** Um preview que monta o
  próprio payload é um segundo renderizador da página pública, e o primeiro
  bug de divergência mostraria ao dono uma página que não existe.
- 2026-08-24 (agente 25) — **Autosave no lugar do botão "Salvar
  alterações".** O protótipo (l.2262–2311) não desenha botão: os campos
  chamam `updMp*` no `onChange`. Como a regra desta auditoria inclui as
  INTERAÇÕES no 1:1, o botão saiu e entrou debounce de 700ms com selo de
  estado no cabeçalho — sem ele o dono não teria confirmação de nada.
- 2026-08-24 (agente 25) — **Preview em tema escuro, contrariando o desenho.**
  O protótipo desenha a página do cliente em `#FAF9F7`, mas a decisão de
  2026-08-14 unificou as 4 superfícies no tema de produto e `/{slug}` é
  escura. Entre ser fiel ao desenho e ser fiel ao resultado, um preview escolhe
  o resultado.
- 2026-08-14 — Design system unificado no tema de produto (`#0F1115` +
  Sora/Inter) para as 4 apps — o bundle tem duas identidades visuais
  (produto vs. editorial do site) e um seletor de 4 paletes em
  `Vendas.dc.html` que é artefato de exploração, não produto final. Ver
  `SPEC.md` → Design system.
- 2026-08-14 — Seed de barbeiros usa os 4 nomes canônicos do booking
  (Carlos Silva, Rafael Souza, Diego Alves, Bruno Costa), não os nomes-mock
  do dashboard interno (que divergem entre `Dashboard.dc.html` e
  `DashboardFuncionario.dc.html`). Ver `SPEC.md` → Seed.
- 2026-08-14 — Guest booking sem OTP explícito no protótipo do wizard;
  mantida a exigência de OTP do `system-map.md` por segurança, com
  calibração de rate limit a decidir pelo agente 04. Ver `SPEC.md` →
  Decisões tomadas.

### Fase 11 — decisões técnicas

- **`apps/web` nasceu de `git mv apps/dashboard apps/web`.** É a app mais
  complexa (config, providers, guarda de sessão, 18 rotas), então herdar dela
  custou menos do que montar do zero — e as 4 apps tinham `next.config.mjs`,
  `tailwind.config.ts`, `tsconfig.json`, `postcss.config.mjs` e `.eslintrc.json`
  BYTE-A-BYTE idênticos, o que tornou a unificação de config trivial. O único
  arquivo de config que divergia era o `globals.css` do `site` (o bloco da
  landing clara), acrescentado ao do `web`.
- **O painel ficou em `/app/*` e o admin em `/admin/*`, inclusive nos hosts
  próprios.** A alternativa era o painel responder em `/agenda` no host dele e
  em `/app/agenda` em dev — dois formatos de link para o mesmo botão, que é
  como se quebra navegação em produção sem ninguém perceber em dev. Com um
  formato só, `router.push('/app/agenda')` vale em todo lugar; a URL antiga
  (`app.barbervp.com/agenda`) continua funcionando pela reescrita do middleware.
- **A raiz do booking virou `/agendar`.** `(marketing)/page.tsx` e a antiga
  `(booking)/page.tsx` resolviam as duas para `/` — colisão que o Next recusa a
  buildar. Em vez de descartar a tela explicativa ("cada barbearia tem o próprio
  link"), ela ganhou caminho próprio, e o middleware manda `agendar.barbervp.com/`
  para lá. `/{slug}` não precisou de nada: é dinâmica e não colide com `/`.
- **Navegação entre superfícies passou a ser relativa por padrão.** Manter URL
  absoluta obrigatória significaria que esquecer uma variável de ambiente em
  produção mandaria o usuário para `localhost:3002`. Relativo é o fallback que
  não pode dar errado: no pior caso o visitante fica no host em que já estava,
  e a rota existe lá também.
- **`window.location.assign` foi preservado onde já existia**, em vez de virar
  `router.push` agora que é a mesma origem. Trocar por navegação soft mudaria o
  ciclo de vida do provider de auth — exatamente o tipo de "melhoria" que a
  regra número 1 desta fase proíbe.
- **Os 4 `CORS_ORIGIN_*` da API continuam existindo**, apontando todos para a
  mesma origem em dev. A API valida os quatro por Zod (`env.schema.ts`) e o
  refactor não podia tocar em `apps/api` — colapsá-los seria mudança de
  contrato do backend por conveniência do frontend.
- **A guarda de host do admin devolve `404` puro, não a página de erro do
  app.** Uma guarda de segurança que responde com HTML estilizado ainda conta
  para quem sonda quais rotas existem; 404 seco antes do render não conta.

### Fase 10 — decisões técnicas

- **A landing é a única superfície CLARA do produto — de propósito.** O
  protótipo expunha 4 paletas por prop de editor, com a escolha em
  `localStorage('bvp-palette')`. Isso é ferramenta de exploração de design, não
  feature: em produção só a **"Light SaaS"** (o default) entra, como tokens
  fixos em `components/landing/palette.ts`, sem seletor e sem storage. Quem lê
  a landing é um dono decidindo se compra; quem usa o painel escuro já é
  cliente e passa horas na tela. Consequência prática: a landing **não usa os
  componentes de `packages/ui`** — eles carregam os tokens escuros e ficariam
  ilegíveis sobre `#FAFAFA`.
- **`body:has(#bvp-landing)` em `globals.css`** para o fundo claro. O `body`
  global é escuro e continua assim para `/entrar`, `/cadastro` e
  `/recuperar-senha`, que dividem o mesmo layout raiz. O wrapper da landing já
  pinta o próprio fundo, mas o `body` aparece no overscroll do iOS/macOS — uma
  faixa preta piscando no topo de uma página branca. Navegador sem `:has()`
  perde só essa faixa; não vale um script de hidratação.
- **`SaasPlan.marketing` é coluna própria, não chave dentro de `features`.**
  O agente da fase pedia os textos no `features Json`, mas
  `AdminPlansService.upsert` valida chave a chave contra `FEATURE_KEYS` e
  **reconstrói** o Json — o texto de marketing seria apagado no primeiro
  salvamento de plano no super admin. `features` é permissão, `marketing` é
  conteúdo: mudam por motivos diferentes, em telas diferentes.
- **Duas respostas do FAQ são montadas a partir da API** (`buildFaqs`). O
  protótipo cita "Essencial (R$ 49), Profissional (R$ 89) e Avançado (R$ 139)"
  e "atende até 2 barbeiros e o Profissional até 4" — texto fixo ali era
  repetir dado de negócio no frontend, e a landing mostraria um preço no card e
  outro no FAQ no dia em que alguém mexesse no admin. Com os planos semeados o
  texto sai palavra por palavra igual ao protótipo. Foi por isso que
  `maxBarbers` entrou no DTO público.
- **`fetchSaasPlans` devolve `[]` em vez de estourar** quando a API não
  responde. A página é 90% conteúdo estático; derrubar hero, features,
  depoimentos e FAQ porque a API piscou seria trocar uma seção degradada por
  zero visitantes. A seção de planos mostra o próprio aviso e manda para o
  cadastro, que não depende de escolher plano antes.
- **Link "Ver o marketplace" do rodapé removido** — a tela não existe e não
  está em nenhuma fase. O rodapé ficou © 2026 BarberVP + Entrar / Planos /
  Dúvidas.

### Fase 09 — decisões técnicas

- **O `next build` das 4 apps foi DESBLOQUEADO — e a causa não era nenhuma das
  hipóteses anteriores.** A dívida da fase 06 dizia que o build falhava em
  TODAS as rotas de todas as apps com `Cannot read properties of null (reading
  'useContext')`, e três hipóteses já tinham sido descartadas com evidência.
  A causa real, encontrada nesta fase, é **`useSearchParams()` sem limite de
  `<Suspense>`** em `apps/dashboard`: `/configuracoes` (a aba inicial vem de
  `?tab=`) e `/impersonar`. O hook tira a rota da renderização estática e o
  Next 14 aborta o prerender. Corrigido embrulhando as duas em `<Suspense>`
  com fallback equivalente. `site`, `booking` e `admin` buildavam depois de
  limpar o cache — o erro `useContext` que aparecia antes vinha de artefato
  velho, não do código. **`pnpm turbo run build` roda 6/6 verde.**
- **O EACCES do `pnpm build` da API era cache incremental dessincronizado, não
  permissão.** Sintoma enganoso: `mkdir dist/... EACCES` mesmo com o diretório
  pertencendo ao usuário. Duas mudanças desta fase se combinaram para expor o
  problema: o container passou a rodar como uid 1000 e `apps/api/dist` deixou
  de ser volume anônimo, então host e container passaram a COMPARTILHAR `dist`
  pelo bind mount — mas cada um tem o seu `node_modules`, e o
  `tsconfig.tsbuildinfo` morava lá. Um build de um lado deixava o outro
  achando que a saída estava atualizada. Resolvido movendo o
  `tsBuildInfoFile` para DENTRO de `dist`, junto do que ele descreve. O motivo
  original de tirá-lo dali (o container escrevia como root) deixou de existir.
- **Container de desenvolvimento roda como `node` (uid 1000)** — fecha a
  dívida da fase 02. O usuário `node` da imagem oficial tem exatamente o uid
  do dono do checkout, então nada que o container escreve pelo bind mount
  nasce root-owned. `apps/api/dist` deixou de precisar ser volume anônimo e
  `pnpm clean` voltou a funcionar do host.
- **`QueueModule` é dinâmico (`register()`), não estático.** Um `@Processor`
  vira `Worker` no instante em que é registrado como provider, então a decisão
  de ligar ou não os workers precisa ser tomada na MONTAGEM do módulo —
  `@Module({})` estático não consegue consultar o env. O `register()` usa o
  MESMO `validateEnv` do resto do boot, não um `process.env` cru.
- **`THROTTLE_STORAGE` existe por dois motivos legítimos, não só pelo teste.**
  Produção precisa de `redis` (com N réplicas, contagem em memória multiplica
  o teto real por N). `memory` serve a uma instância única sem Redis e à
  suíte, onde um contador compartilhado entre os arquivos de spec derrubaria
  por 429 logins que os testes precisam fazer. O caminho Redis tem cobertura
  própria em `throttle-redis.e2e-spec.ts`, que sobe DUAS aplicações e prova
  que o teto gasto numa vale na outra.
- **`MALFORMED_JSON` foi criado e removido no mesmo dia.** O plano era dar
  código próprio ao JSON quebrado, mas ele chega ao filtro já embrulhado em
  `BadRequestException`, sem o `type` do body-parser que o distinguiria de uma
  validação de DTO. Emitir um código que nunca sai seria pior que não tê-lo:
  ficou 400 `BAD_REQUEST`, que é a resposta correta de qualquer forma. O
  `PAYLOAD_TOO_LARGE` ficou, porque esse o filtro reconhece de fato — e era um
  bug real (500 em vez de 413).
- **A varredura responsiva navega UMA vez por rota e redimensiona.**
  Recarregar a cada tamanho fazia 30 navegações em segundos por app; o provider
  de auth dispara um `/auth/refresh` por montagem e a rajada estourava o rate
  limit — a varredura passava a medir a tela de erro do Next em vez do layout.
  Redimensionar também é mais fiel: o que se quer verificar é o reflow por
  breakpoint, e o layout é CSS (Tailwind `md:`/`lg:`), não JavaScript de
  largura.
- **A régua de alvo de toque tem duas exceções, ambas corretas.** Caixa de
  seleção e rádio são medidos pelo `<label>` (é ele que recebe o toque), e link
  no meio de uma frase é dispensado pela exceção "inline" das WCAG 2.5.8 — um
  `<a>` dentro de "aceito os termos de uso" não tem como crescer sem quebrar o
  parágrafo. Sem essas duas exceções a varredura reprovaria padrões corretos.
- **`/playground` entra na varredura só pelo layout.** É a galeria de
  componentes da fase 02, não uma tela de produto: ela renderiza os primitives
  isolados e em estados de demonstração (inclusive tamanhos pequenos de
  propósito), então a régua de alvo de toque não se aplica ali.
- **O teste intermitente do código de reserva foi corrigido na raiz.** Ele
  exigia ZERO colisão em 2 mil sorteios de um espaço de 30^5; pelo paradoxo do
  aniversário isso é falso em ~8% das execuções. Não era "flaky", era uma
  asserção errada para a propriedade que se queria medir. Agora afirma o que a
  entropia permite (no máximo 2 colisões, o que por acaso é < 0,001%) e ganhou
  um par que confere que os 30 caracteres do alfabeto realmente aparecem — a
  regressão que importa (alfabeto encolhido ou sorteio enviesado) passaria
  despercebida pelo teste de colisão sozinho.

### Fase 08 — decisões técnicas

- **Por que impersonar reusa `issueSessionForUser` em vez de emitir um JWT
  "de impersonação" com um claim extra**: manter o token semanticamente
  idêntico ao de um login normal significa ZERO código condicional em
  qualquer rota do dashboard pra tratar "sessão impersonada" — todo o guard
  chain, todo `@CurrentTenant()`, todo `FeatureGuard` funcionam sem saber que
  a sessão nasceu de um clique no admin. O preço dessa simplicidade é que a
  UI de aviso (banner) precisa de um canal PARALELO (`sessionStorage`) — ver
  acima.
- **Por que NÃO setar o refresh cookie na impersonação**: `apps/admin` e
  `apps/dashboard` rodam em origens/portas diferentes, mas se algum dia
  compartilharem domínio (subdomínio comum em produção), um cookie de
  refresh de impersonação correria o risco de colidir ou sobrescrever a
  sessão própria do super admin no navegador dele. Sessão de impersonação
  morre com o `accessToken` (900s) — suficiente pra inspecionar o painel,
  curto o bastante pra não precisar de revogação explícita.
- **Por que a troca de plano não exige logout/login pra refletir**: o
  `FeatureGuard` lê `SaasPlan.features` do tenant ATIVO a cada requisição
  (nunca do JWT) — plano é dado de tenant, não claim de token. O critério de
  aceite "muda na hora" já vinha de graça da arquitetura da fase 07
  (`FeatureGuard`/`@RequireFeature()`), esta fase só precisava expor o
  `PATCH` que troca `Tenant.planId`.
- **Aprovar fatura precisa de DOIS `simulateTransition`, não um**: o
  `MockPaymentDriver.ALLOWED_TRANSITIONS` (já existente desde a fase 05, com
  comentário próprio antecipando "aprovação/recusa disparada manualmente
  pelo super admin") só permite `PENDING→CONFIRMED→RECEIVED`, nunca
  `PENDING→RECEIVED` direto. `approveInvoice()` respeita o contrato do
  driver em vez de o driver ser afrouxado pra fase 08 — a máquina de estado
  do mock continua representando um gateway real de verdade.
- **Auto-suspend por falha de cobrança é por `TenantSubscription.
  failedAttempts`, não por `Tenant.updatedAt` nem por contagem ad-hoc de
  faturas `FAILED`**: contador dedicado, incrementado a cada `reject`,
  resetado a cada `approve` — direto, sem depender de reconstituir histórico
  a cada checagem. Limite em env (`BILLING_MAX_FAILED_ATTEMPTS`, padrão 3),
  não hardcoded.
- **Sem visão geral própria em `apps/admin`** — `/` redireciona pra
  `/tenants` porque é ali que o super admin passa a maior parte do tempo
  (suporte/operação), e `/metricas` já cobre o que uma "home" mostraria.

### Fase 07 — decisões técnicas

- **Fechamento de comanda — o que entra na MESMA `prisma.$transaction`, nesta
  ordem**: (1) `recompute()` de novo (a comanda pode ter mudado entre a
  última leitura do front e o clique em "Finalizar"); (2) para cada item
  coberto por assinatura, `SubscriptionCoverageService.debit(tx, usageId)` —
  se a quota esgotou nesse meio-tempo, o item é recobrado ao preço cheio ALI,
  antes de qualquer outra coisa; (3) recalcula subtotal/desconto/fidelidade/
  total com os preços já corrigidos; (4) **valida que a soma dos pagamentos
  bate EXATAMENTE com o total** — não bate, `400` e nada foi escrito; (5)
  baixa estoque dos produtos; (6) grava `CommissionEntry` por item de serviço
  com barbeiro atribuído; (7) grava os `Payment`; (8) se algum pagamento é
  `CASH` e há caixa aberto, lança `CashMovement`; (9) marca o `Appointment`
  vinculado como `DONE`; (10) credita pontos de fidelidade e grava o resgate,
  se houve; (11) atualiza `ClientProfile.lastVisitAt`/`visitCount`/
  `totalSpentCents`; (12) fecha o `Order`. Qualquer exceção em qualquer passo
  desfaz tudo — é o "tudo ou nada" do critério de aceite, coberto por teste
  (`dashboard-ii.e2e-spec.ts`).
- **Fórmula final de pontos de fidelidade**: `Math.round(subtotalCents /
  gastoPorPonto)` — o `Math.round(subtotal)` cru do protótipo (que tratava
  R$1 = 1 ponto) foi ajustado pela config real `LoyaltyProgram.gastoPorPonto`
  (padrão 100 centavos = 1 ponto), exatamente como o SPEC já mandava. Resgate
  é BINÁRIO por comanda (`useLoyalty` liga/desliga), não uma quantidade livre
  de pontos — aplica o bloco inteiro de `valorDesconto` de uma vez quando o
  saldo cobre `pontosParaDesconto`, no mesmo modelo do toggle único que o
  protótipo mostra.
- **Comissão sobre SERVIÇO, nunca sobre produto** — decisão herdada do
  comentário já existente no seed da fase 01 ("comissão sobre o serviço,
  produto não gera comissão nesta regra"); mantida por consistência, e porque
  nem o SPEC nem o enunciado desta fase pedem comissão sobre a venda de
  produto.
- **Faixa (`TIERED`) é PROVISÓRIA a cada comanda, DEFINITIVA só no fechar
  período**: cada `CommissionEntry` nasce com a taxa calculada pelo
  faturamento ACUMULADO do barbeiro no mês até aquele item (mês a mês,
  comanda a comanda). "Fechar período" (`POST /commissions/period/close`)
  recalcula TODAS as entradas do mês com o faturamento FINAL e trava
  (`status: PAID`) — é o "fechar período trava o cálculo" do enunciado, sem
  precisar saber o faturamento do mês inteiro antes da primeira comanda
  fechar. Os vales não quitados do mês são marcados `settledAt` no mesmo
  fechamento — a dedução automática que o enunciado pede.
- **`OVERDUE` de conta a pagar/receber é calculado na LEITURA, nunca
  guardado.** `AccountPayable`/`Receivable.status` só vira `PAID`/`RECEIVED`
  por ação explícita; o serviço deriva `OVERDUE` comparando `dueDate` com
  `now()` na hora de montar a resposta. Guardar o status exigiria um job
  batendo a cada meia-noite (fila que só existe na fase 09) só pra manter uma
  coluna sincronizada com uma comparação de data — sem necessidade.
- **Categorias reais do seed, não as inventadas da fase 01.** O
  `seed-data.ts` original tinha `ACCOUNTS_PAYABLE`/`RECEIVABLE` com
  categorias como "Ocupação"/"Utilidades"/"Convênio", que não existem no
  bundle. `CATEGORIAS_PAGAR`/`CATEGORIAS_RECEBER` (`Dashboard.dc.html`) viraram
  `ACCOUNT_PAYABLE_CATEGORIES`/`ACCOUNT_RECEIVABLE_CATEGORIES` em
  `@barbervp/types` (fonte única, usada tanto na validação do DTO quanto no
  seed), e as 10+8 linhas de `CONTAS_PAGAR_DATA`/`CONTAS_RECEBER_DATA` do
  bundle substituíram as 4+2 inventadas. Decisão do usuário, tomada
  explicitamente no início desta sessão.
- **`Order.guestName` novo** — o walk-in "abrir comanda sem agendamento" do
  enunciado não tinha onde guardar o nome de quem não é cliente cadastrado
  (`Order` só tinha `clientId`, diferente de `Appointment`, que já carrega
  `guestName`/`guestPhone` desde a fase 04). Campo novo, mesmo padrão.
- **`bloquearFaltasAtivo` novo, separado de `bloquearFaltasQtd`** — o
  protótipo modela como dois controles independentes na tela de Preferências
  (liga/desliga + o número), e o schema da fase 01 só tinha o número. Sem o
  toggle, "desligar o bloqueio" teria que ser simulado com um número
  artificialmente alto, o que poluiria o campo que também aparece como texto
  ("após N faltas"). O bloqueio real do booking público
  (`appointments.service.ts`) passou a checar os dois.
- **`BankAccount.type`/`acceptedMethods` novos** — o enunciado pede
  explicitamente "formas de pagamento aceitas" por conta bancária, campo que
  não existia. `type` é texto livre (o protótipo mostra "Pix / Transferência
  / Cartão" ou "Caixa físico", não um enum fechado); `acceptedMethods` é
  `PaymentMethod[]`.
- **`PaymentMethod.SUBSCRIPTION`/`LOYALTY` não aparecem no split de
  pagamento da comanda.** O protótipo só mostra Pix/Dinheiro/Débito/Crédito
  (+ "Dividir") no fechamento — cobertura por assinatura e resgate de pontos
  são DESCONTOS que reduzem o total a dividir entre esses 4 métodos, não um
  "método" próprio. Os dois valores do enum continuam existindo no schema
  para outros contextos (ex.: o `Payment` da assinatura do cliente, fase 05),
  só não são usados aqui.
- **`CommissionCalcService` é exportado de `CommissionsModule`** e importado
  por `PosModule` — mesmo motivo de `SubscriptionCoverageService` na fase 04:
  o fechamento de comanda precisa gravar `CommissionEntry` DENTRO da mesma
  transação Prisma, e isso só é possível chamando o serviço diretamente, não
  batendo num endpoint HTTP separado.
- **`FeatureGuard` é o quarto `APP_GUARD` global**, depois de `RolesGuard` —
  antes desta fase, o único precedente (`ClientSubscriptionService.
  featureEnabled`) checava a feature manualmente dentro do serviço. Um guard
  global elimina esse padrão ad hoc: qualquer endpoint futuro só precisa de
  `@RequireFeature('chave')`, sem repetir a consulta ao `SaasPlan`.
- **"Relatórios avançados" é rota DISTINTA (`/reports/advanced`), não um
  campo condicional dentro de `/reports/summary`.** O critério de aceite pede
  literalmente um 403 num "endpoint de relatórios avançados" — só existe
  onde 403 acontecer se for uma rota própria. `summary` (faturamento, ticket
  médio, distribuição por forma de pagamento) fica liberado em todo plano;
  `advanced` (por barbeiro/serviço/dia, ocupação, no-show, retorno) exige
  `relatoriosAvancados`.
- **Ocupação é aproximada, não geometricamente exata.** `minutos agendados
  (DONE/CONFIRMED) ÷ (barbeiros ativos × média diária de minutos de
  expediente × dias do período)` — não cruza escala individual por barbeiro
  nem folgas/exceções (isso pertence ao motor de disponibilidade da fase 04,
  caro demais para rodar por período inteiro num relatório). Suficiente para
  o indicador do dashboard; documentado aqui para não ser lido como
  precisão de agenda.
- ~~**`TenantPhoto`/Minha Página não tem upload real de arquivo**~~ —
  **resolvido pelo agente 25**: `StorageAdapter` + `LocalStorageDriver`
  (`src/adapters/storage/`), com `POST /my-page/images/:slot` e
  `POST /my-page/photos` em multipart. Segue de pé para o passo 3 do
  ONBOARDING (`logoUrl`/`coverUrl` por URL digitada) e para `Barber.avatarUrl`
  — o pipeline existe, falta plugá-lo nessas duas telas.
  `Minha Página` NÃO é gate de plano: o overlay "disponível no plano
  Avançado" que aparece no protótipo (`minhaPaginaLocked`) é código morto lá
  mesmo — hardcoded `false`, nunca liga — e `minhaPagina`/branding público
  não está na tabela oficial de `FEATURE_KEYS` do SPEC. Todo tenant edita a
  própria página pública, em qualquer plano.
- **Assistente IA sem chave real** — `AiAssistantAdapter`/
  `MockAiAssistantDriver` seguem o mesmo padrão de `NotificationAdapter`/
  `PaymentAdapter` (driver mock injetado por símbolo, trocar por LLM real é
  1 binding em `AdaptersModule` + 1 variável de ambiente
  `AI_ASSISTANT_DRIVER`), exatamente como o enunciado pediu. O limite mensal
  por plano é real (conta `AiChatMessage` do mês corrente), só a
  "inteligência" da resposta é mock.
- **`FeatureLocked`/`UpgradeModal` detectam o gate pela RESPOSTA REAL da
  API (403 `FEATURE_NOT_IN_PLAN`), não por um mapa de features calculado no
  cliente.** O dashboard não tem hoje nenhum jeito de saber o plano/features
  do tenant sem perguntar (o `EstablishmentAuthState` não carrega isso) — dá
  pra buscar via `GET /settings/plan`, mas isso adicionaria uma chamada
  extra em toda tela só para decidir se mostra ou esconde algo que o
  PRÓPRIO endpoint de dados já vai dizer com o mesmo 403 de qualquer jeito.
  `isFeatureGateError(query.error)` (novo em `lib/feature-error.ts`, lê
  `ApiError.code`) troca o conteúdo normal da seção por `FeatureLocked`
  sem round-trip a mais. Único ponto cego: um `Switch` que já está LIGADO
  mostra estado errado até o usuário tentar mexer (o `GET /whatsapp-config`
  já resolve isso devolvendo `requiresFullFeature` explícito por evento,
  mas o padrão genérico não teria essa saída sem o endpoint cooperar).
- **Calculadora de preço mora em Configurações, não em Serviços & Produtos**
  — decisão consciente contra o que o protótipo desenha (`spTabCalculadora`
  é a 3ª aba de `ServicosProdutos.dc.html`, não de `Configurações`). Mexer
  na tela de Serviços & Produtos (fase 06, já ✅) para acrescentar uma aba
  arriscaria a fase anterior por um ganho de fidelidade visual que o
  enunciado desta fase não pediu explicitamente (o texto da tarefa lista a
  calculadora dentro do bullet de Configurações). Se a fidelidade exata ao
  protótipo importar mais que o isolamento de mudança entre fases, mover é
  trabalho de front-end puro — o endpoint (`POST /settings/price-
  calculator`) não muda de lugar.
- **`ComandaContent`/`ComandaFooter` são dois componentes, não um.** A
  primeira tentativa colocava tudo (itens + totais + botão "Fechar") dentro
  do `ComandaPanel` único — só que o `children` do `Modal` de `packages/ui`
  já é `overflow-y-auto` por padrão (é o corpo que rola), e o `footer` é a
  ÚNICA área garantidamente fixa. Um painel só, incluindo o botão de fechar,
  ficaria escondido atrás do teclado/scroll numa comanda com muitos itens —
  exatamente o oposto do "subtotal sempre visível" do critério de aceite.
  Resolvido separando conteúdo (rola) de rodapé (fixo) e passando o rodapé
  pelo prop `footer` do `Modal` no mobile / um bloco `shrink-0` manual no
  `Card` do desktop.
- **Split de pagamento da comanda não usa `PaymentMethod.SUBSCRIPTION`/
  `LOYALTY` no front** (documentado no backend também) — o `CloseOrderModal`
  só mostra Pix/Dinheiro/Débito/Crédito, exatamente os botões do protótipo;
  cobertura por assinatura e resgate de pontos aparecem como REDUÇÃO do
  total a dividir, não como mais um método na lista.
- **Nenhuma captura de tela — verificação por `tsc`/`eslint`/`curl` +
  leitura da estrutura de classes responsivas**, mesmo padrão que a fase 06
  já tinha adotado (ver dívida "sem teste de frontend automatizado" de
  lá). Não há Playwright/Storybook configurado no projeto ainda; instalar
  isso é decisão maior que cabe à fase 09 (hardening) ou a uma fase de
  qualidade dedicada, não a um agente de feature.

### Fase 06 — decisões técnicas

- **Formato do link de convite**: `{dashboard}/aceitar-convite?token={id}.{segredo}`
  — mesmo par id+segredo do link de recuperação de senha (`PasswordResetToken`),
  mesmo hash HMAC com o pepper do refresh (`hashSecret`/`secretMatches`), TTL
  fixo de 7 dias (`INVITE_TTL_DAYS`, não configurável por env nesta fase — não
  havia pedido de configuração no bundle). Reenviar gera par novo e invalida
  o anterior (não existem dois links válidos ao mesmo tempo para o mesmo
  convite).
- **Convite sempre cria `Barber` com `WorkSchedule` a partir de
  `TenantBusinessHour` + `workDays` escolhidos no convite** (dia fora dos
  `workDays` OU fora do horário de funcionamento vira `isDayOff: true`) — é
  o mínimo para o barbeiro aparecer com agenda utilizável assim que aceita,
  sem precisar passar pela aba Escala antes do primeiro atendimento.
- **`maxBarbeiros` conta ativos + convites `PENDING`** (não só `Barber`
  ativos) — sem isso o dono furaria o limite do plano abrindo N convites
  simultâneos que só colidiriam com o teto no aceite, um por um. Trial
  (`planId` nulo) não tem limite — mesma decisão "trial libera tudo" das
  fases 04/05.
- **Papel `BARBER` no `GET /staff-agenda`**: pedir `barberId` de outro
  barbeiro é IGNORADO (a resposta mostra só a própria coluna), não 403 — um
  403 na leitura revelaria menos que simplesmente devolver o que a pessoa
  pode ver. Já **criar/mover/cancelar** um agendamento de outro barbeiro É
  403 (`StaffScopeService.assertAllowed`), porque aí a intenção é agir sobre
  um recurso alheio, não só consultar. O critério de aceite da fase
  ("BARBER tentando acessar agenda de outro barbeiro → 403") é coberto pelo
  caminho de escrita — documentado explicitamente porque a leitura, de
  propósito, não segue o mesmo caminho.
- **Layout final da Agenda**: dia único (colunas por barbeiro, `grid` que
  empilha < `lg`) é a view padrão e a ÚNICA no mobile — a aba "Semana" fica
  `hidden` abaixo de `lg` no lugar de aparecer e renderizar mal; a visão
  timeline do protótipo (`isTimelineView`) usa a MESMA resposta da API que o
  dia único (`view=TIMELINE` no contrato, mas o backend trata igual a `DAY`
  — quem muda é só o desenho no front, que nesta fase ainda não diferencia
  as duas; ver dívida abaixo).
- **`CatalogAdminModule` é um módulo separado de `booking/catalog.service.ts`**
  de propósito — o de booking é o motor de LEITURA pública (cotação, combo,
  cobertura) que a agenda interna também reusa; misturar CRUD administrativo
  ali acoplaria o caminho quente do booking a validações que só fazem
  sentido no dashboard (nome único, barbeiro pertence ao tenant etc.).

### Fase 05 — decisões técnicas

- **Tenant demo passou de Profissional para Avançado** (`DEMO_PLAN_CODE` em
  `seed-data.ts`). A fase 01 tinha decidido Profissional; mas o seed já
  semeava `ClientPlan`/`ClientSubscription` reais desde então, e a aba
  "Assinatura" da `MinhaConta` só existe com `fidelidadeAssinaturas`
  (Avançado). Deixar o demo no Profissional tornaria o próprio dado semeado
  invisível na tela que existe para mostrá-lo — sem sentido para um ambiente
  de demonstração. `maxBarbeiros` ilimitado do Avançado não muda nada (o
  tenant tem 4).
- **Exportação LGPD SEM botão visível — dívida herdada, resolvida como
  endpoint desde já.** O protótipo (`MinhaConta.dc.html`) só tem "Excluir
  minha conta"; a exportação nunca existiu na tela. Em vez de inventar uma UI
  que o bundle não desenhou, a fase 05 seguiu a segunda opção do enunciado:
  **acrescentou o botão como melhoria sobre o protótipo** — "Exportar meus
  dados" mora na mesma seção que "Excluir minha conta" (Meus dados →
  rodapé), baixa um `.json` no navegador via `Blob`/`<a download>`. Decisão
  de design: texto discreto (`text-fg-muted underline`), não um CTA
  primário — é uma ação rara, e um botão dourado ali competiria com "Sair" e
  "Excluir conta" por atenção que não merece.
- **Exportação é GLOBAL, exclusão é local ao registro global.** A tela abre
  escopada a UMA barbearia (`/{slug}`), mas o `GET /client-auth/me/export`
  não filtra por tenant — traz agendamentos/assinaturas/avaliações de TODAS
  as barbearias do cliente. Não é vazamento cross-tenant (regra 3 protege
  contra um cliente ver o de outro, não contra o titular ver a si mesmo): a
  LGPD (art. 18) dá direito aos PRÓPRIOS dados completos, e o `Client` é uma
  identidade global — exportar só o pedaço de uma barbearia seria uma
  exportação incompleta por escolha de rota, não por exigência legal.
  Coberto por `client-account.isolation-spec.ts`.
- **Exclusão anonimiza, nunca apaga `Order`/`Payment`.** `Client.deletedAt`
  já existia (fase 01) mas nada o usava. `requestDeletion` sobrescreve
  `name`/`email`/`passwordHash`/`birthDate` e troca `phone` por
  `deleted-<id>` (o campo é `@unique`, não dá para deixar vazio) — mas o
  `Client.id` sobrevive intacto, então todo `Order`/`Payment`/`AuditLog` que
  aponta para ele continua íntegro. Consequência testada: o telefone
  original fica livre para um cadastro novo depois da exclusão.
- **Troca de telefone reusa o desafio de OTP do registro** (`OtpPurpose.
  CLIENT_PHONE_CHANGE` novo, mesmo `OtpService`). O telefone é a identidade
  de login do cliente (`Client.phone` `@unique`) — trocá-lo sem prová-lo
  deixaria a conta associada a um número que ninguém verificou, o mesmo
  risco que a fase 03 fechou no registro. **Resolve a dívida da fase 01/03**:
  a confirmação também escreve em TODA `ClientProfile.phone` do cliente (a
  desnormalização por tenant), então a busca `(tenantId, phone)` do
  dashboard nunca fica com um número morto depois da troca.
- **Assinatura aprova a cobrança na hora, sem fila de admin.** O SPEC
  (`stack.md` → Adapters) fala em "aprovação/recusa manual via admin" para o
  `MockPaymentDriver` — mas isso é a fila de cobranças recorrentes do super
  admin (fase 08+), não a primeira contratação: o critério de aceite desta
  fase pede "assinar um plano mock, agendar um serviço coberto, ver o saldo
  decrementar" no MESMO fluxo, e não existe painel de admin ainda para
  aprovar nada. `subscribe()`/`renewCycle()` chamam
  `simulateTransition(PENDING→CONFIRMED→RECEIVED)` no mesmo request.
- **Uma assinatura ativa por barbearia, não por cliente.** `subscribe()`
  recusa (409) se já existe uma `ClientSubscription` com status diferente de
  `CANCELED` para aquele `(tenant, client)`. O protótipo só mostra uma
  (`hasAssinatura` é booleano); nada no SPEC pede múltiplos planos
  simultâneos na mesma casa, e permitir isso multiplicaria a superfície de
  teste (qual plano cobre qual corte?) sem pedido de produto por trás.
- **Reativar com o ciclo vencido dispara `renewCycle` de verdade — reativar
  com o ciclo ainda válido só destrava o status.** "Pausar zera cobrança até
  reativar" (SPEC) não diz o que fazer quando a pausa atravessa a data que
  teria renovado. Devolver o saldo cheio de um período que nunca foi pago
  seria dar cortes de graça; cobrar de novo e abrir período novo é o que um
  gateway real faria ao reativar uma assinatura vencida. `renewCycle` é
  método público justamente para `resume()` e o job de renovação chamarem a
  MESMA lógica.
- **Cartão nunca é persistido — nem mascarado guarda o meio.** `SubscribeDto`
  valida formato (`Matches`) mas `ClientSubscriptionService` só extrai os 4
  últimos dígitos (`last4Of`) antes de gravar em `Payment.metadata`; número
  completo e CVV morrem no fim do request. Verdade mesmo sendo um driver
  mock — não há razão para uma dívida de segurança que o mock não precisa
  ter.
- **Cancelar/remarcar da `MinhaConta` NÃO duplicam o `AppointmentsService`.**
  `POST /account/appointments/:id/rate` é rota nova (só o cliente logado
  avalia), mas cancelar e remarcar continuam batendo nas MESMAS rotas
  `/public/:slug/appointments/:code/cancel`/`reschedule` da fase 04 — o
  `RescheduleDialog` do frontend é só uma casca nova (`DatePicker`/
  `TimeSlotGrid` fora do wizard) sobre o endpoint que já existia.
- **`ClientAccountModule` não importa `BookingModule`.** Só reusa
  `isWithinChangeWindow`, uma função pura exportada de
  `appointments.service.ts` — trazer o módulo inteiro (que já importa
  `AuthModule` pelo `OtpService`) criaria uma dependência maior do que o que
  de fato é preciso.
- **Consentimento versionado é constante de código, não campo de formulário.**
  `CURRENT_TERMS_VERSION` (`@barbervp/types`) é carimbado em
  `Client.consentVersion` a cada aceite — subir a versão dos termos no futuro
  não pede migration, só trocar a constante. O cliente só marca o checkbox
  "aceito os termos" (já existia desde a fase 03); qual versão estava
  vigente é decisão do servidor, nunca dado que o formulário manda.

### Fase 04 — decisões técnicas

- **O combo é regra de CATÁLOGO (`ServiceComboPart`), não cálculo de tela nem de
  reserva.** O protótipo troca os ids no navegador (`COMBO_ID`/`PAIR_IDS`);
  aqui a composição é uma tabela com FK e a troca acontece no servidor. Motivo:
  preço promocional decidido no cliente é preço que qualquer um edita, e a mesma
  regra precisa valer para o agendamento feito pelo dashboard (fase 06), que não
  passa por este wizard. **Com um porém: o combo só entra quando de fato sai mais
  barato.** Para um assinante cujo plano cobre Corte e Barba separadamente,
  agrupá-los num terceiro serviço fora do plano transformaria dois atendimentos
  gratuitos num de R$ 70 — nesse caso a seleção fica como está. É literalmente o
  que o toast do protótipo promete ("sai mais barato").
- **Guest booking com OTP CONDICIONAL.** O protótipo confirma direto com nome +
  WhatsApp; o `system-map.md` pedia OTP sempre. Os dois extremos são ruins: sem
  verificação, qualquer um lota a agenda com telefones alheios (e queima a
  barbearia com clientes que nunca souberam do horário); com OTP sempre, some a
  razão de existir do guest booking, que é agendar em 30 segundos. O código é
  pedido só quando algo destoa — `REGISTERED_PHONE` (o número já é de conta
  verificada ou com senha), `TOO_MANY_OPEN` (o número já tem 2 horários futuros
  nesta barbearia) ou `IP_BURST` (6 reservas de visitante do mesmo IP na última
  hora). Os três limites são env (`BOOKING_GUEST_*`). **A tela nunca diz qual
  regra disparou**: "esse número já tem conta" transformaria o agendamento num
  oráculo de quem é cadastrado na plataforma.
- **Rate limit por IP é frouxo de propósito** (`BOOKING_CREATE_HOURLY_LIMIT`,
  30/h). Operadora de celular e wi-fi de shopping põem milhares de pessoas atrás
  do mesmo IP; travar cliente de verdade é pior que deixar passar spam. A
  barreira real contra agenda lotada de graça é o OTP condicional acima, que
  olha telefone e comportamento. O teto é lido de `process.env` no decorator
  (`@Throttle` é avaliado antes de existir container de DI) — a variável está no
  `envSchema`, e o default dos dois lugares tem de andar junto.
- **Seleção múltipla vira `AppointmentService`, não N agendamentos
  encadeados.** O wizard deixa marcar vários serviços e a duração do slot é a
  soma — mas continua sendo uma visita, um horário, uma cadeira. Um único
  intervalo é o que a EXCLUDE `no_double_booking` precisa guardar, e um único
  registro é o que a comanda fecha. `Appointment.serviceId` sobrevive como
  "serviço principal" (o primeiro da seleção), porque agenda, comissão e comanda
  falam de um serviço só. **Fecha a pendência que a fase 01 deixou em aberto**
  ("se a fase 04 precisar de múltiplos serviços, será uma migration nova").
- **A grade nasce de `slotIntervalMin` (15 min), não da duração do serviço.**
  Com passo igual à duração, um cancelamento às 09:20 deixaria um buraco que
  nunca mais seria oferecido.
- **Toda comparação de sobreposição acontece em INSTANTE (UTC), nunca em minutos
  locais** — assim uma virada de horário de verão no meio da janela não cria nem
  esconde vaga.
- **O `startsAt` recebido é revalidado contra a grade antes de gravar.** A
  EXCLUDE só enxerga colisão com outro agendamento, não expediente: sem essa
  checagem, bastaria editar o corpo da requisição para agendar às 3h da manhã,
  no almoço do barbeiro ou nas férias dele.
- **`Review` existe porque a regra 2 não admite array mockado.** As avaliações do
  `Agendamento Publico.dc.html` são dado do bundle, então viram seed — e seed
  precisa de tabela. A COLETA (pedir avaliação após o atendimento) continua sendo
  o template `REVIEW` do WhatsApp, da fase 07/09; aqui só há leitura.
- **O visitante NÃO ganha um `Client`.** O agendamento guarda
  `guestName`/`guestPhone`, que é para isso que os campos existem. Criar uma conta
  não verificada a partir de um agendamento ocuparia o telefone de outra pessoa —
  exatamente o bloqueio trivial que a fase 03 evitou ao decidir que "a conta do
  cliente só nasce depois do OTP".
- **Código de reserva com entropia** (`AG-` + 5 caracteres de um alfabeto sem
  `0/O` e `1/I/L`): é a credencial de quem agendou sem conta, então tem de ser
  imprevisível — os 4 dígitos sequenciais do protótipo não seriam. E ele sozinho
  não basta: o visitante também prova o telefone, porque o código viaja por
  WhatsApp e pode ser encaminhado sem querer.
- **404 idêntico para "não existe" e "não é seu"** na consulta por código —
  responder diferente transformaria a rota num oráculo de códigos válidos.
- **"Sem preferência" escolhe quem tem menos atendimentos no dia**, não o
  primeiro da lista: senão o Carlos, que abre a lista, lotaria enquanto o Bruno
  fica vazio.
- **Lembretes nascem no `NotificationOutbox` com `scheduledFor` e `PENDING`.**
  Nada os envia ainda — a fila BullMQ é da fase 09, e é ela que vai varrer
  `status = PENDING AND scheduledFor <= now()`. O `scheduledFor` entrou no
  CONTRATO do `NotificationAdapter` (e não num outbox agendado à parte) porque
  "mandar depois" é responsabilidade do canal: provedor real de WhatsApp aceita
  agendamento nativo, e trocar o driver não pode obrigar o módulo de negócio a
  mudar de API.
- **`TenantSettings.cancelamentoHoras` é a fonte única da política.** O protótipo
  escrevia "3h" na tela de sucesso do agendamento e "2h" na `MinhaConta`; agora a
  API devolve `cancelWindowHours` no resumo do agendamento e as duas telas leem
  dali. Nenhum texto de tela repete o número. (O campo do enunciado chamava-se
  `cancelamentoAntecedencia`; o nome real no schema, desde a fase 01, é
  `cancelamentoHoras`.)
- **O wizard renderiza UM passo por vez, com entrada animada, em vez do track de
  400% do protótipo.** O track mantém as quatro colunas montadas lado a lado e
  desliza um `translateX`, o que deixa três telas de campos e botões vivos fora
  de vista, alcançáveis por Tab e lidos por leitor de tela. Aqui só o passo
  corrente existe no DOM, e ele entra pelo lado do movimento (`bvp-in-right` ao
  avançar, `bvp-in-left` ao voltar — keyframe novo no preset). Efeito visual
  igual, comportamento com teclado correto.
- **A primeira carga da página `/{slug}` é do SERVIDOR e ANÔNIMA.** É página
  indexada e aberta em 4G no meio da rua; precisa de HTML pronto. Nenhum cookie
  de sessão atravessa, então a resposta pode ser cacheada (60s) e servida a
  qualquer visitante — o que depende de quem está logado (assinatura ativa,
  avatar no cabeçalho) é buscado depois da hidratação. Isso exigiu
  `API_INTERNAL_URL` no compose: dentro do container, `localhost` é o próprio
  Next, não a API.
- **O `.ics` de "adicionar ao calendário" é montado no navegador** — são 15
  linhas com dado que a tela já tem, e uma rota na API para isso só
  acrescentaria latência e mais uma superfície pública.
- **Alvos de toque subiram para 44px no mobile**: o ✕/← do `Modal` (era 36px, e
  fechar sheet é o alvo mais usado do celular) e os botões de ação da vitrine
  (`h-11 sm:h-10`). Na lista de serviços do wizard, o rótulo passou a envolver a
  LINHA inteira com associação implícita — o alvo é a linha de 64px, não a
  caixinha de 24px. O `Menu` de `packages/ui` ganhou `trigger` opcional (o
  avatar da conta no lugar do kebab).

### Fase 03 — decisões técnicas

- **Audience do JWT: `bvp:establishment` e `bvp:client`** (constante
  `TokenAudience` em `@barbervp/types`), com `AuthSession.audience` espelhando
  no banco (`ESTABLISHMENT`/`CLIENT`) e uma CHECK garantindo que uma sessão
  pertence a um `User` OU a um `Client`, nunca aos dois. Cookies de refresh
  separados (`bvp_rt` / `bvp_crt`), com `path` escopado em `/api/v1/auth` e
  `/api/v1/client-auth`. Motivo: o dono precisa poder estar logado no painel
  numa aba e agendando como cliente na outra, sem uma sessão derrubar a outra;
  e nenhuma rota fora de auth chega a ver o refresh.
- **Claims do access token**: `sub`, `aud`, `tid` (tenant ativo), `rol` (papéis
  NAQUELE tenant), `sa` (super admin), `sid` (`AuthSession.id`). O `sid` existe
  para o `JwtAuthGuard` confirmar que a sessão continua viva — sem isso, um
  logout só teria efeito quando o access token expirasse, até 15 minutos depois.
- **Vínculo cliente↔dono resolvido por `Client.userId`** (`@unique`), e não por
  fundir as duas tabelas. Quando o e-mail digitado no cadastro já é conta de
  `Client`, o fluxo confirma a senha atual e cria um `User` **com o mesmo
  `passwordHash`**, amarrando os dois registros. Consequência assumida: toda
  troca de senha (voluntária ou por recuperação, dos dois lados) atualiza os
  dois hashes na mesma transação. A alternativa — dar login de painel ao
  `Client` — quebraria `Membership.userId` e o RBAC inteiro. O que a tela
  promete ("seus agendamentos como cliente continuam intactos") é literal: o
  `Client.id` não muda, então `Appointment`/`ClientProfile` seguem apontando
  para ele.
- **A conta do cliente só nasce depois do OTP.** `POST /client-auth/register`
  valida e guarda o cadastro em `OtpCode.payload`; o `Client` é criado na
  verificação. Sem isso, digitar o telefone de outra pessoa ocuparia aquele
  número (que é a identidade do cliente) e a impediria de se cadastrar — um
  bloqueio de conta alheia trivial de executar.
- **Recuperação de senha do cliente cria "desafio de fachada" para destino sem
  conta**: linha real de `OtpCode`, sem `clientId` e sem `payload`, que conta
  para o limite por destino e **não envia mensagem nenhuma**. A resposta fica
  idêntica à do caso com conta. Sem isso, o endpoint viraria um oráculo de
  quem tem conta na plataforma.
- **Refresh opaco, não JWT.** O cookie carrega `<sessionId>.<segredo>` e o banco
  guarda só o HMAC-SHA256 do segredo (pepper = `JWT_REFRESH_SECRET`). Cada uso
  rotaciona; um refresh já revogado reaparecendo revoga a **família inteira**
  (`familyId`), conforme RFC 6819 §5.2.2.3 — é o sinal clássico de token
  roubado. Coberto por teste e2e.
- **Argon2 para senha, HMAC-SHA256 para os demais segredos** (refresh, OTP,
  token de reset). Estes últimos são gerados por nós com entropia suficiente:
  não há dicionário a resistir, e o `/refresh` roda a cada 15 minutos por
  sessão ativa — argon2 ali seria custo sem ganho. A defesa do OTP (que tem só
  6 dígitos) é o limite de tentativas + expiração, não o custo do hash.
- **Login sempre queima o tempo do argon2**, mesmo sem conta
  (`PasswordService.burn`), senão o tempo de resposta denuncia quais e-mails
  existem.
- **Tenant do JWT tem precedência sobre o header `x-tenant-slug`.** Um dono
  autenticado não navega para outra barbearia mandando header; para trocar,
  `POST /auth/context` emite um par novo. Testado no
  `auth-tenancy.isolation-spec.ts`.
- **Tenant nasce `TRIAL` com `planId` null.** O texto do passo 5 diz "durante o
  trial tudo é permitido"; amarrar um plano já no cadastro faria o gate de
  features recusar coisas que o trial libera. A contratação é da fase 07/08.
- **ViaCEP consultada pela API, não pelo navegador** (`GET /onboarding/cep/:cep`
  com cache no Redis por 30 dias). O protótipo chama do cliente; mover para o
  servidor evita liberar host externo no CSP das apps, compartilha o cache
  entre todos os donos e deixa a troca de provedor sem tocar em frontend.
  Falha da ViaCEP degrada para preenchimento manual, como no protótipo.
- **Passos do onboarding gravam progresso no banco** (`TenantSettings.
  onboardingStep`, que só sobe). O wizard é retomável de outro dispositivo —
  `useState` morreria com a aba. "Pular etapa" avança sem salvar, e por isso
  não pode fazer o contador regredir.
- **Fim do onboarding liga todo barbeiro ativo a todo serviço ativo**
  (`syncBarberServices`, idempotente) e propaga o horário da barbearia para o
  `WorkSchedule` de cada barbeiro. É o mínimo para a fase 04 conseguir montar
  grade de horários; o ajuste fino de "quem faz o quê" é tela da fase 06.
  Detalhe: dia fechado grava `isDayOff` com `endTime = startTime + 1`, porque a
  CHECK `work_schedule_bounds` exige fim > início.
- **`AppConfigModule` deixou de duplicar a lista de envs.** A dívida da fase 01
  bateria feio aqui (8 variáveis novas); agora a lista sai do próprio
  `envSchema` (`ENV_KEYS`), então acrescentar env ao schema já a faz chegar ao
  `AppConfig`. **Dívida da fase 01 resolvida.**
- **`middleware.ts` das 4 apps NÃO decide sessão** — só `noindex` e cabeçalhos
  de proteção. O refresh é httpOnly e escopado no host da API, invisível para a
  borda do Next, e o access token vive em memória; fingir a decisão ali só
  produziria redirect errado (mandaria para o login quem tem sessão válida).
  Quem decide é o `RequireEstablishmentAuth`, depois do refresh silencioso.
- **Access token só em memória** (`useRef` no provider), nunca em
  `localStorage`. A persistência entre recarregamentos vem do refresh httpOnly.
- **`Modal` do design system serve o `ClienteAuth` inteiro** — bottom-sheet
  < 768px, modal centrado acima, com foco preso, ESC e scroll lock já
  resolvidos na fase 02. O sheet é **componente**, não rota: o wizard da fase 04
  e a página pública abrem o mesmo, via `open`/`onClose`/`onAuthSuccess`.
- **Split das telas de auth do site colapsa em `lg` (1024px), não em 860px.**
  O `max-width:860px` do protótipo espremeria o formulário de 432px numa coluna
  de ~45% já em tablet; a construção aqui é mobile-first (uma coluna por
  padrão) e o split só entra quando as duas colunas cabem de fato.
- **A tela de sucesso do cadastro do cliente não fecha sozinha.** O protótipo
  fecha em 2,5s; aqui quem fecha é o usuário — fechamento automático corta a
  leitura de quem usa leitor de tela.
- **`Button` ganhou `buttonClasses()`** para `<Link>` do Next vestir a mesma
  aparência sem virar `<button onClick>` — o site é indexado e precisa de
  âncoras de verdade. `Checkbox` ganhou `error`, para o aceite de termos.

### Fase 02 — decisões técnicas

- **`surface-3` absorveu de vez o `#20242C` do onboarding** — o preset da
  fase 01 ainda guardava os dois tons (`surface.3: '#20242C'` e um `bg.2`/
  `bg.3` extras não usados por ninguém). A fase 02 limpou para 4 degraus só:
  `bg` `#0F1115`, `surface` `#12151A`, `surface-2` `#181B21`, `surface-3`
  `#1F232B` — como o SPEC já pedia (usar o mais comum). Os meio-tons do
  protótipo fora da escala (`#15171C` das sheets do wizard, `#1A1D23` dos
  inputs) foram aproximados para o degrau mais próximo; não viram token
  novo.
- **Rampa `gold-50..900` removida.** O protótipo só usa dourado sólido ou
  `rgba(212,168,76, x)`; a rampa da fase 01 não tinha consumidor. Fundos
  translúcidos agora saem por modificador de opacidade do Tailwind
  (`bg-gold/10`, `border-gold/30`), que é exatamente o padrão do bundle.
- **`Modal`/`Drawer` resolvem o breakpoint só em CSS** (`md:` = 768px),
  **não** com `ResizeObserver`/`window.innerWidth` como o protótipo. Motivo:
  JS de viewport muda o HTML entre servidor e cliente e quebra a hidratação
  do Next; classes responsivas dão o mesmo resultado visual sem esse risco e
  sem round-trip de re-render. O corte continua sendo 768px em todo lugar.
- **`AppointmentStatusPill` deriva do enum real** (`AppointmentStatus` de
  `@barbervp/types`), não do `STATUS_COLORS` do protótipo (que é um objeto
  solto por tela, com rótulos que variam entre `Dashboard.dc.html` e
  `DashboardFuncionario.dc.html`). Evita rótulo/cor de status divergir do
  schema em fases futuras.
- **Sem Storybook.** Optou-se pela rota `/playground` (opção B do enunciado):
  zero dependência nova, roda dentro do Next real da app (mesmo Tailwind,
  mesmos providers), e a alternância de breakpoint usa `<iframe>` de largura
  fixa em vez de `transform: scale`, então o layout é o real, com scroll e
  media query de verdade.
- **`AppShell` collapsa em `lg` (1024px), não em `640px` como o `!important`
  do protótipo.** O bundle é desktop-fixo e só "esconde" texto da sidebar
  abaixo de 640px; aqui o drawer sobreposto entra bem antes (regra 1:
  mobile-first de verdade), com a sidebar fixa reservada a telas que cabem
  254px de painel sem apertar o conteúdo.
- **`ResponsiveTable` não é genérica ao ponto de adivinhar colunas** — quem
  chama marca explicitamente `mobile: 'title' | 'subtitle' | 'meta'` em cada
  coluna. Verboso de propósito: decidir o que sobrevive no card mobile é
  julgamento de produto, não algo para a tabela inferir sozinha.

### Fase 01 — decisões técnicas

- **`Appointment.timeRange` é coluna GERADA**, não escrita pela aplicação:
  `tstzrange("startsAt","endsAt",'[)') STORED`. No `schema.prisma` aparece
  como `Unsupported("tstzrange")?` (o Prisma Client a ignora), e o `GENERATED
  ALWAYS` é escrito à mão na migration. Assim o intervalo nunca diverge de
  `startsAt`/`endsAt` e a fase 04 cria agendamentos pelo Prisma normal, sem
  SQL cru. Intervalo **semiaberto**: 10:00–10:45 e 10:45–11:30 coexistem.
- **Migration inicial escrita à mão** a partir de `prisma migrate diff`
  (`apps/api/prisma/migrations/20260815000000_init/`). Além da EXCLUDE, leva:
  `appointment_time_order`, `subscription_usage_within_quota` (rede de
  segurança do débito atômico), `service_price_non_negative`,
  `product_stock_non_negative`, `order_total_non_negative`,
  `work_schedule_bounds`, `business_hour_bounds`.
- **Horários de agenda são `Int` = minutos desde a meia-noite** (540 = 09:00)
  no fuso do tenant, em `WorkSchedule`, `ScheduleException` e
  `TenantBusinessHour`. Os nomes `lunchStart`/`lunchEnd` do SPEC foram
  mantidos; só o tipo mudou (era implicitamente `time`).
- **Modelos acrescentados ao mapa do SPEC**, por serem estruturalmente
  necessários: `ClientProfile` (perfil do cliente por barbearia — o `Client` é
  global; carrega `noShowCount`/`blocked` de `bloquearFaltasQtd` e desnormaliza
  `phone` para o índice `(tenantId, phone)`), `TenantBusinessHour` (o "horário
  por dia" de `TenantSettings`, como tabela em vez de Json),
  `ClientPlanItem` (quota por serviço do plano de assinatura),
  `CommissionTier` (faixas da regra TIERED).
- **`Appointment` tem um único `serviceId`.** O combo "Corte + Barba" é um
  serviço próprio no catálogo (o wizard converte a seleção dupla nele), então
  não há tabela de junção. Se a fase 04 precisar de múltiplos serviços por
  agendamento, será uma migration nova.
- **Percentuais em basis points** (`percentBps`: 4000 = 40%) e nota do
  barbeiro em `ratingBps` (490 = 4.9★) — nenhum float atravessa a fronteira.
- **Token único de erro `danger` = `#E05B5B`.** O protótipo tinha `#E05B5B`
  (produto) e `#E5484D` (sheets do cliente); o SPEC já pedia unificação.
- **Toast e sucesso consolidados no preset Tailwind**: as 5 animações de toast
  viraram `bvpToastIn`, e `successPop`/`checkDraw` viraram
  `bvpSuccessPop`/`bvpCheckDraw`. Os componentes `Toast`/`SuccessScreen` em si
  continuam sendo tarefa da fase 02.
- **`ScheduleExceptionType`** nasceu como enum novo (`DAY_OFF`, `VACATION`,
  `HOLIDAY`, `CUSTOM_HOURS`) — o SPEC citava folga/férias sem nomear o enum.
- **Auth ainda é stub.** O `TenantGuard` resolve tenant por slug (param de
  rota ou header `x-tenant-slug`); o ramo que lê `request.principal` já existe
  mas ninguém preenche `principal` até a fase 03 plugar o `JwtAuthGuard`
  **antes** dele na cadeia de `APP_GUARD`.
- **Timezone**: o seed converte horário local ↔ UTC com offset fixo de -3h,
  válido porque o Brasil não tem mais horário de verão. Se voltar, trocar por
  lib de timezone (`date-fns-tz`/`luxon`).
- **`deleteOutDir: false`** no `nest-cli.json`: `apps/api/dist` é volume no
  compose de dev (para o container root não deixar artefatos root-owned no
  host) e volume não pode ser removido de dentro. Use `pnpm clean` no host.

## Dívidas técnicas

- ~~LGPD (exportação/exclusão de dados do cliente)~~ — **resolvida na fase
  05**: `GET /client-auth/me/export` (JSON completo) e
  `POST /client-auth/me/delete` (anonimização, preserva `Order`/`Payment`),
  com o botão de exportação acrescentado como melhoria sobre o protótipo
  (que só tinha "Excluir minha conta"). Ver decisão da fase 05. A auditoria
  fina (retenção de `AuditLog`, revisão de hardening) segue para a fase 09.
- ~~Calibrar rate limit / exigência de OTP no guest booking do wizard~~ —
  **resolvida na fase 04**: OTP condicional por regra de risco, com os três
  limites em env (`BOOKING_GUEST_IP_HOURLY_LIMIT`, `BOOKING_GUEST_OPEN_LIMIT`,
  `BOOKING_CREATE_HOURLY_LIMIT`). Ver decisão da fase 04.

### Dívidas novas do agente 29 (reparos transversais)

- **A suíte de frontend cobre dois arquivos, não componentes.**
  `apps/web/test` nasceu para o interceptor de refresh e para o middleware —
  os dois em ambiente `node`. **Testar componente React continua sem
  ferramenta** (jsdom + testing-library), que é a mesma dívida das fases
  02/04/05/06. A varredura responsiva mede layout renderizado; a INTERAÇÃO
  (clicar num slot, arrastar, preencher o modal) segue sem rede de proteção.
- **`AuthSession.impersonatedBy` não tem FK.** É ponteiro de auditoria, e o
  `AuditLog` já guarda o registro completo com `SetNull` — mas se o super
  admin for apagado, a coluna fica com um id órfão. Não afeta o kill-switch
  (o filtro é `!= null`), e só incomodaria um relatório futuro de "quem
  impersonou quem".
- **O job de automações varre até 500 por tenant e por evento.** É o mesmo
  teto do disparo manual de reativação, e sobra para o volume de uma
  barbearia. Uma rede com centenas de tenants grandes precisaria paginar — e
  aí a dedupe por `NotificationOutbox`, que hoje é uma consulta por lote,
  vira o gargalo antes do envio.
- **A deduplicação de aniversário usa janela de 300 dias**, não "este ano
  civil". Escolha deliberada (cobre o aniversário anterior sem esbarrar no
  próximo), mas significa que um cliente cadastrado com data errada e
  corrigida no mesmo ano não recebe até a janela passar.
- **A automação de avaliação não sabe se o cliente já avaliou.** Manda o
  pedido para todo atendimento concluído na janela, tenha ele virado `Review`
  ou não. Cruzar com a tabela `Review` é uma linha — ficou de fora porque o
  pedido do protótipo é "como foi seu atendimento", não "avalie", e o
  histórico de envio já mostra o que saiu.
- **A recorrência de agendamento continua ausente** — é o único desvio da
  tabela do agente 15, e a razão está lá: exige modelo de série, não campo.
- **A foto do barbeiro vai para a pasta do tenant**, como a do usuário
  (dívida gêmea do agente 27). Correto hoje; se o storage ganhar ciclo de
  vida por tenant, revisar.
- ~~**O link público do fim do onboarding segue quebrado**
  (`{base}/agendar/{slug}` → 404)~~ — **RESOLVIDA pelo agente 30**, com os dois
  lados mudando juntos e a base saindo do contrato (`publicBaseUrl`, o mesmo de
  `GET /my-page`). Era: `onboarding.service.ts:443` + `onboarding-wizard.tsx:195`.

### Dívidas novas do agente 30 (configuração inicial)

- **A foto do BARBEIRO na aba Equipe continua por URL?** Não — foi fechada pelo
  agente 29 (`POST /barbers/:id/avatar`). Depois do agente 30 **não sobra
  nenhum campo de URL de imagem em `apps/web`**: `grep -rn "URL do logo\|URL da
  foto" apps/web` só encontra comentários que contam essa história.
- **O `StorageAdapter` valida o mimetype DECLARADO, não os bytes.** Um arquivo
  de texto renomeado para `.png` é aceito e gravado — conferido no navegador
  nesta fase. Vem do agente 25 e vale para os quatro consumidores (Minha
  Página, perfil, barbeiro, onboarding). O conserto é ler os primeiros bytes
  (assinatura de JPG/PNG/WebP) em `local-storage.driver.ts`, num lugar só.
  Consequência hoje: um `<img>` que não renderiza, não uma execução — mas com
  um bucket público e um `Content-Type` servido pelo storage, merece fechar
  antes do deploy.
- **O erro de servidor do `ImageSlot` é caminho quase inalcançável.** A
  validação do cliente (formato e 5 MB) espelha exatamente a do servidor, então
  na prática só uma falha de rede ou um 500 chegam ao `error` do slot. Está
  certo que exista; só não dá para exercitá-lo pela interface — foi verificado
  por leitura, não no navegador.
- **Conferir no navegador queima `POST /auth/register` (5 por hora, por IP) — e
  isso derruba `critical-flows.e2e-spec.ts` depois.** Aconteceu nesta fase: o
  fluxo 1 começa cadastrando um estabelecimento, e cinco registros manuais na
  hora anterior o fazem tomar 429. Passa sozinho quando a janela vira. Registre
  antes de suspeitar do código: 5 casos falhando SÓ em `critical-flows`, com a
  suíte inteira verde ao rodá-la isolada, é este sintoma.
- **A varredura do wizard consome a fixture.** Percorrer os 6 passos por
  `?passo=N` não grava nada, mas a fixture `barbearia-configuracao` é um estado
  frágil: qualquer verificação manual que avance o wizard a tira do passo 0, e
  a varredura seguinte mediria outra coisa. `make seed` devolve.
- **`PUT /onboarding/services` recria serviço com nome de um soft-deleted e
  bate na `@@unique([tenantId, name])`.** Achado de passagem, montando o e2e:
  o wizard não passa por aí (ele reenvia o serviço COM `id`, e o serviço o
  reativa), então é caminho de API, não de tela. Fica registrado porque a
  mensagem que sai é o 409 genérico do banco.

### Dívidas novas do agente 28 (aba Assistente IA)

- **O driver mock responde 4 intenções, por palavra-chave.** Faturamento,
  ticket médio, agenda do dia e inativos — o resto cai num fallback que DIZ
  que não sabe, em vez de inventar. É o combinado da fase ("sem integração
  real"), mas registra-se o tamanho real do repertório: os chips do rodapé são
  exatamente essas quatro perguntas, porque sugerir uma quinta seria oferecer
  um botão que cai no fallback.
- **Cartões de ESCRITA ficaram de fora.** "Agendamento criado" e "bloqueio
  criado" (protótipo l.2862–2880 e l.2902–2912) exigem NLU para virar ação.
  Quando o provedor real entrar, o caminho é: driver devolve o `card` novo,
  `AiChatCard` ganha o `kind`, e `assistant-card.tsx` ganha o render — a
  moldura e os botões já existem no cartão de agenda.
- **"Desfazer" não existe porque não há ação para desfazer.** O botão do
  protótipo desfaz o agendamento que o assistente criou; sem cartão de escrita
  ele não tem alvo. Entra junto com o item acima.
- **O microfone depende da Web Speech API do navegador** (Chrome/Edge/Safari).
  No Firefox o botão some. Transcrição no servidor — que valeria para todos e
  permitiria guardar o áudio como o protótipo desenha — é integração de fase
  posterior, junto com o provedor de LLM.
- **`insights` roda uma consulta de fuso por cartão.** `timeZoneOf` faz um
  `findUnique` no `Tenant` a cada chamada. É uma linha por pergunta, não por
  render, mas quando o provedor real puder encadear várias ferramentas numa
  resposta vale carregar o fuso uma vez por requisição.
- **O front não formata o cartão em BRL a partir de centavos por conta
  própria** — usa `formatBRL` de `@barbervp/types`, e o texto do balão já vem
  formatado do servidor. Os dois formatam o MESMO número em dois lugares; se
  divergirem, o balão e o cartão vão discordar na tela. Vale um caso de teste
  quando o provedor real assumir a redação do texto.

### Dívidas novas do agente 27 (tela Meu perfil)

- **`/privacidade` não existe.** O link "Política de Privacidade" do bloco
  "Privacidade e dados" aponta para a mesma rota que o cadastro do
  estabelecimento e o registro do cliente já apontam desde as fases 03/05 — e
  ela nunca foi escrita. Agora são TRÊS pontos de entrada para um 404. Escrever
  a página (e a de termos) é trabalho de conteúdo, não de código.
- ~~**Não há como o super admin desfazer uma exclusão agendada.**~~ —
  **RESOLVIDA pelo agente 29**: `POST /admin/tenants/:id/deletion/cancel`,
  mais `purgeAt` na lista e no detalhe (a pílula vermelha com a data). Era:
  `/admin/tenants` filtra por `deletedAt`, que no agendamento é nulo — a
  barbearia continua na lista, mas sem botão para limpar o `purgeAt`. Se o dono
  perder o acesso ao login dentro dos 30 dias, ninguém desfaz.
  `POST /admin/tenants/:id/deletion/cancel` fecha isso em poucas linhas.
- **A foto do usuário é gravada na pasta do tenant ATIVO.** Funciona (a URL é
  pública, como a do logo), mas quem serve duas barbearias deixa a foto na
  pasta daquela de onde subiu o arquivo. Se o storage ganhar ciclo de vida por
  tenant, a foto pessoal precisa de espaço próprio.

### Dívidas novas do agente 24 (aba Equipe)

- ~~**Foto do barbeiro é URL, não upload.**~~ — **RESOLVIDA pelo agente 29**:
  `ImageSlot` + `POST /barbers/:id/avatar`, e `avatarUrl` saiu do
  `UpdateBarberDto` para não haver segundo caminho de escrita. Era: O `image-slot` do protótipo (l.2166)
  virou campo "URL da foto" com prévia no `Avatar`, o mesmo caminho que o
  onboarding já usa para o logo. **O `StorageAdapter` do agente 25 já resolve
  o lado do servidor** — trocar o campo pelo `ImageSlot` de
  `components/dashboard/my-page/image-slot.tsx` mais um
  `POST /team/barbers/:id/avatar` fecha a dívida sem mexer no contrato
  (`Barber.avatarUrl` continua sendo o destino).
- ~~**Mudar `maxBarbers` de um PLANO (Super Admin → Planos) não reprocessa os
  tenants.**~~ — **RESOLVIDA pelo agente 29**: o `AdminPlansService` varre os
  tenants do plano quando o teto muda, uma transação por tenant. Era: `applyPlanLimit` roda na troca de plano DO TENANT
  (`/settings/plan/change` e `/admin/tenants/:id/plan`), não quando o teto do
  plano em si é editado em `/admin/planos`. Um plano que encolhe deixa os
  tenants acima do novo teto sem a marcação até a próxima troca. O conserto é
  varrer os tenants do plano no `AdminPlansService` — fica para quem mexer no
  Super Admin.
- ~~**`GET|PUT /barbers/:id/work-schedule` ficou sem consumidor no front.**~~ —
  **RESOLVIDA pelo agente 29 REMOVENDO as rotas**: ninguém as reivindicou, e o
  `PATCH :id` já grava a escala em transação única. Era: O
  modal grava a semana junto com o resto por `PATCH`, numa transação só. As
  duas rotas continuam no contrato e cobertas pelo isolamento; se ninguém as
  reivindicar até o fechamento, são candidatas a remoção.
- **A matriz da escala mostra sempre a semana corrente.** Não há navegação
  entre semanas — o protótipo também não tem. Férias marcadas para o mês que
  vem existem no dado e aparecem na agenda, mas não nesta matriz até a semana
  chegar.

### Pendências responsivas herdadas (vistas na varredura da fase 24)

A varredura da aba Equipe passou nos 5 tamanhos, mas o mesmo relatório
reprova, em 360 e 390, telas de outros agentes — **não foram tocadas**:

- ~~`/app/configuracoes` (agente 26): 5 alvos de toque abaixo de 44px.~~ —
  **não reproduz mais** na varredura do agente 27; a rota passa nos 5 tamanhos.
- ~~`/app/minha-pagina` (agente 25): rolagem horizontal (+59px em 360, +30px
  em 390) e 2 alvos de toque abaixo de 44px.~~ — **corrigido pelo agente 25**;
  a rota passa nos 5 tamanhos.
- ~~`/app/agenda`: cinco alvos abaixo de 44px na barra de navegação de
  data.~~ — **corrigido pelo agente 29**; a rota passa nos 5 tamanhos, e a
  varredura fechou sem pendência em nenhuma das 35. Era: em 360 e
  390, cinco alvos abaixo de 44px na barra de navegação de data — `‹` e `›`
  (36×36), "Hoje" (49×20), o campo de data (187×42) e o seletor de barbeiro
  (169×17). É a única pendência que a varredura do agente 27 ainda acusa.

### Dívidas novas do agente 22 (aba WhatsApp)

- **O pareamento por QR do protótipo não existe — e não pode existir nesta
  fase.** O card "Conexão com WhatsApp" mostra o estado do adapter
  (`driver:'MOCK'`) em vez do QR e do número do desenho. Quando o provedor real
  entrar, entram junto: `POST /whatsapp-config/connection/pair` (devolvendo um
  QR de verdade), `DELETE .../connection` (o "Desconectar" da l.1639, hoje NÃO
  renderizado por não ter o que fazer) e `phone`/`connected` vindos do
  provedor. O contrato `WhatsappConnection` já prevê os dois campos.
- **`enabled` das automações não dispara nada sozinho para BIRTHDAY,
  REACTIVATION e REVIEW.** O `BookingNotificationsService` cobre confirmação,
  lembrete e cancelamento (são reações a um agendamento). Os outros três são
  disparos por CALENDÁRIO e precisam de um job na fila da fase 09 que varra
  aniversariantes do dia, inativos na janela e atendimentos concluídos há N
  minutos. Hoje a reativação só sai pelo botão manual da faixa dourada; ligar o
  interruptor guarda a intenção e o `enabledAt`, mas ninguém a executa ainda.
  **Isto é o próximo passo natural desta aba.**
- **O disparo em massa tem teto de 500 e é síncrono.** Acima disso a barbearia
  não alcança todo mundo numa tacada, e o `POST` segura a requisição enquanto
  escreve. Com provedor real, isto tem de virar job de fila com progresso.
- **O histórico não pagina na tela.** O endpoint já devolve `nextCursor`, mas a
  tabela mostra só a primeira página (25). O protótipo também só desenha 10
  linhas sem paginador, então nada foi inventado — mas uma barbearia ativa
  passa de 25 mensagens em dois dias.
- **O `Switch` compartilhado tem 44×22 e depende de um `<label>` para passar na
  varredura responsiva.** Esta aba resolveu localmente (embrulhou o interruptor
  num `<label>` de 44×44). O conserto de verdade é no
  `packages/ui/src/components/toggle.tsx`, e vale para todas as abas — ficou
  fora daqui de propósito, é componente de todo mundo.

### Dívidas novas do agente 21 (aba Fidelidade)

- **O programa de pontos ficou SEM TELA — bloqueia o recurso.**
  `GET|PATCH /loyalty/program` é o único interruptor de algo que o produto usa
  em três lugares (resgate na comanda, saldo no drawer do cliente, coluna
  "Pontos" da lista de clientes), e a sub-aba que o editava saiu do protótipo.
  Hoje **não há como ligar o programa pela interface**. O lugar natural é uma
  seção em Configurações — **agente 26**.
- **`LoyaltyRaffle`/`LoyaltyRaffleEntry` viraram tabelas órfãs.** Rotas,
  serviço, tipos, frontend e seed dos sorteios foram removidos; o schema não,
  porque derrubar tabela é migration destrutiva. Limpar junto com o
  `RaffleStatus` de `packages/types/src/enums.ts`.
- **`/loyalty/subscribers` não pagina.** Devolve todos os mensalistas de uma
  vez, como o extrato de comissões e o de caixa.
- **As rotas de assinante resolvem pelo `clientId`.** `pauseSubscriber` e
  companhia recebem o `subscriptionId`, mas delegam ao serviço da fase 05, que
  acha a assinatura pelo cliente. Vale enquanto o invariante "uma assinatura
  não cancelada por cliente" for verdade — ele é garantido só na venda.
- **Cobrança recorrente segue no driver mock** (fase 12/gateway).

### Dívidas RESOLVIDAS pelo agente 20

- **Dívida 3 da fase 13 — "seletor de unidade não filtra nada" — PARCIALMENTE
  resolvida.** `Order.unitId` e `Appointment.unitId` agora entram no `WHERE`
  das consultas de Relatórios, e a aba tem o próprio seletor. As outras 13
  telas continuam somando as unidades; o seletor da topbar segue decorativo.

### Dívidas novas da fase 13

1. **Sino sem tabela `Notification`.** `GET /notifications` DERIVA o feed de
   fatos que já estão no banco (confirmações e cancelamentos de hoje, contas a
   vencer, caixa fechado, estoque no mínimo). É dado real, não mock — mas o
   contador é "pendências abertas", não "não lidas", e não há como marcar um
   aviso como visto. Persistir de verdade exige escrever em toda ação do
   produto e guardar estado de leitura por usuário: uma fase inteira, não uma
   auditoria de tela. **Impacto:** o badge não zera ao abrir o painel.
2. **"Remarcar" leva à Agenda em vez de remarcar ali.** O menu ⋯ dos próximos
   atendimentos navega para `/app/agenda`. Duplicar aqui o seletor de horário
   seria uma segunda implementação da mesma regra de disponibilidade — a
   correção certa é extrair o modal de remarcação da Agenda para
   `components/dashboard/agenda/` e reusá-lo, o que cabe na auditoria da Agenda.
3. **Seletor de unidade não filtra nada.** Trocar de unidade muda o rótulo e
   só: nenhum endpoint aceita `unitId` ainda (`Unit` existe no schema e em
   `/settings/units`, mas `Appointment.unitId`/`Order.unitId` nunca são
   filtrados). Fica assim de propósito — multi-unidade de verdade é escopo
   próprio, não da auditoria do Dashboard. **Impacto:** um tenant Avançado com
   2 unidades vê os números somados.
4. **`next build` precisa de `NODE_ENV=production` explícito neste ambiente.**
   Rodado de dentro dos containers de dev (que definem `NODE_ENV=development`),
   `next build` quebra 35 páginas na prerenderização com `Cannot read properties
   of null (reading 'useContext')` — inclusive `/404` e `/500`. A pista está na
   pilha, que mistura `app-page.runtime.prod.js` com `app-page.runtime.dev.js`:
   é o runtime errado, não código errado. Com
   `docker exec -e NODE_ENV=production ... npx next build` o build sai **exit 0
   e zero erros de prerender**. Não é dívida de código; é uma pegadinha de
   ambiente que custou meia hora nesta sessão e vai custar de novo na fase 12
   se não estiver anotada. Conferir se o `Makefile`/CI força `NODE_ENV`.
5. **Meta mensal sem controle na tela.** `TenantSettings.monthlyGoalCents` é
   gravável por `PATCH /settings/preferences` mas não tem campo em
   Configurações. Entra na auditoria daquela tela.
6. **"Meu perfil" é uma aba mínima.** O protótipo tem uma tela inteira
   (`Dashboard.dc.html`, linhas 2737–2817: "Dados pessoais", "Segurança",
   "Privacidade e dados"). A fase 13 criou a aba `?tab=perfil` com o que já
   tinha endpoint — dados da sessão e troca de senha (`POST
   /auth/password/change`, que existia em `auth-api.ts` sem nenhuma UI que a
   chamasse). Foi o mínimo para o item de menu exigido pelo critério de aceite
   não cair silenciosamente em "Barbearia". A exportação/exclusão LGPD, que
   hoje só existe do lado do CLIENTE, entra na auditoria de Configurações.

### Dívidas novas da fase 11

Nenhuma delas foi CAUSADA por este refactor. Foram encontradas ao verificar a
app consolidada e existem em `main` do mesmo jeito — `packages/ui` e
`apps/api` estão byte-a-byte idênticos (`git diff main -- apps/api packages/`),
e nas telas só mudou o caminho do import. Estão aqui porque foi esta sessão que
as viu. A primeira é a mais séria.

- ~~**Deadlock no interceptor de refresh: visitante ANÔNIMO em `/app` ou
  `/admin` fica preso no skeleton "Carregando sua sessão…" para sempre, em vez
  de ser mandado para `/entrar`.**~~ — **RESOLVIDA pelo agente 29**: o
  interceptor não tenta mais renovar um 401 vindo da própria rota de refresh.
  Teste conferido reprovando antes do conserto; verificado no navegador. Encontrado ao verificar os guardas desta
  fase; o código é de `packages/ui`, byte-a-byte idêntico ao de `main`.

  Mecanismo, em `packages/ui/src/lib/api-client.ts:120-131`: o bootstrap do
  `EstablishmentAuthProvider` chama `establishmentApi.refresh(client)`, que faz
  `POST /auth/refresh` **pelo mesmo cliente axios que tem o interceptor**. Sem
  cookie válido isso dá 401; o interceptor então marca `_retried`, define
  `refreshInFlight = options.refreshTokens()` e faz `await refreshInFlight`.
  Só que `refreshTokens` é o MESMO `refresh` — ele dispara outro
  `POST /auth/refresh`, toma outro 401, cai no interceptor de novo e, como
  `refreshInFlight` já está preenchido, faz `await refreshInFlight` na promise
  que só pode resolver quando ele próprio terminar. Ninguém rejeita, o `catch`
  do provider nunca roda, `clearSession()` nunca é chamado e `status` fica em
  `'loading'` — que é justamente o estado em que os guardas mostram skeleton e
  não redirecionam. Assinatura no navegador: exatamente 2 `401 /auth/refresh`
  por montagem (4 com o StrictMode ligado) e depois silêncio absoluto.

  Não afeta quem TEM sessão (o refresh resolve no primeiro 401 do access
  token), nem o logout (`window.location.assign` explícito, testado
  funcionando), nem o RBAC — é só o caminho do anônimo.

  Correção sugerida (uma linha de decisão, não refactor): fazer o
  `establishmentApi.refresh`/`clientApi.refresh` usarem um axios CRU, sem
  interceptor, ou pular o interceptor quando `config.url` já é a própria rota
  de refresh. Precisa de teste cobrindo "anônimo em rota protegida vai para o
  login" — hoje nada reprova isso.
- ~~**`DashboardGuard` foi mantido com navegação DURA para o login**~~ —
  **reavaliada e MANTIDA pelo agente 29**, agora por motivo próprio: os três
  route groups montam cada um o seu `EstablishmentAuthProvider`, e a
  navegação suave abriria janela para dois refresh simultâneos (detecção de
  reuso). Ver o bloco do agente 29. Segue como está:
  (`window.location.assign`), e não `router.replace`, mesmo agora que login e
  painel são a mesma origem. Era o comportamento anterior (o login morava em
  `apps/site`, outra origem) e trocá-lo mudaria o ciclo de vida do provider de
  sessão. Se a dívida acima for corrigida, é aí que dá para reavaliar.
- ~~**`Tabs` de `packages/ui` reprova o alvo de toque de 44px.**~~ —
  **RESOLVIDA**: o `Tabs` e o `Switch` compartilhados já haviam sido
  corrigidos; o agente 29 removeu o remendo local da aba WhatsApp e fechou o
  que sobrava. `make responsive` passa nas 35 rotas.
  `packages/ui/src/components/tabs.tsx:117` usa `h-9` (36px), abaixo do mínimo
  WCAG que a própria `scripts/responsive-sweep.mjs` cobra. Aparece em
  `/app/servicos-produtos`, `/app/equipe`, `/app/comandas`, `/app/fidelidade` e
  `/admin/mensagens` a 360 e 390px. **Só é detectável quando os dados já
  carregaram** — com skeleton na tela as abas nem existem, e é por isso que a
  varredura da fase 09 passou. Correção: `h-9` → `h-11` (ou `min-h-11`) naquela
  linha, e reconferir o espaçamento das telas afetadas. Também há `input`s de
  24px de altura em `/app/fidelidade` e `/app/whatsapp` (toggles) e um de 40px
  em `/app/comissoes`.
- ~~**`notFound()` de `/{slug}` responde 200, não 404.**~~ — **RESOLVIDA pelo
  agente 29, e a causa NÃO era o `notFound()`**: era o `loading.tsx` da pasta,
  que criava limite de Suspense e fazia a casca sair com 200 antes do `fetch`
  resolver. Removido, com a medição no bloco do 29. Slug inexistente
  renderiza a tela "Barbearia não encontrada" certa, mas com status 200 — um
  *soft 404* que o robô de busca pode indexar. O caminho de código é o mesmo de
  `main` (página, `not-found.tsx` e formato do middleware idênticos), e o 404 do
  Next funciona normalmente em rota sem match (`/app/rota-inexistente` → 404),
  então é específico do `notFound()` desta rota dinâmica no Next 14.2.16.
- ~~**`make seed` deixa o onboarding PENDENTE**~~ — **não reproduz**: o tenant
  demo nasce com `onboardingDoneAt` desde o agente 14. Só o
  `barbearia-isolamento` fica pendente, e ele existe para os testes.
  Registro do que ERA: (`TenantSettings.onboardingDoneAt`
  fica `null` nos dois tenants). Consequência: logo após um seed limpo, entrar
  no painel cai em `/app/configurar`, e não no dashboard — o que contradiz os
  roteiros de verificação das fases 06 e 07 deste arquivo. Para conferir o
  painel é preciso completar o wizard, ou:
  `UPDATE "TenantSettings" s SET "onboardingDoneAt"=now(), "onboardingStep"=6
  FROM "Tenant" t WHERE t.id=s."tenantId" AND t.slug='barbearia-central';`
- ~~**`onboarding.service.ts:443` monta o link público como
  `{base}/agendar/{slug}`, que não existe**~~ — **RESOLVIDA pelo agente 30**
  (`{base}/{slug}` nos dois lados, com a base vindo de `publicBaseUrl`;
  conferido no navegador: `/{slug}` 200, `/agendar/{slug}` 404). Era: a página
  da barbearia é `{base}/{slug}`, como `my-page.service.ts:35` sempre fez, e o
  link mostrado no fim do wizard levava a um 404.
- ~~**Título da landing duplica a marca**~~ — **RESOLVIDA pelo agente 29**
  (`title: { absolute }`). Era: sai
  "BarberVP — Sistema de gestão para barbearias · BarberVP", porque o `title`
  absoluto da rota ainda recebe o `template: '%s · BarberVP'` do layout.
  Herdado da fase 10 (o `apps/site` fazia igual). Correção: usar
  `title: { absolute: '...' }` na landing.
- **A mesma rota `/{slug}` responde em TODOS os hosts.** Mitigado por canonical
  absoluto (ver acima), não bloqueado: `barbervp.com/barbearia-central` ainda
  renderiza a página da barbearia. Se isso incomodar, o lugar de resolver é o
  middleware — mesma forma da guarda do admin, restringindo `/{slug}` ao host
  do booking. Não foi feito porque exigiria uma allowlist das rotas de
  marketing, frágil para rota nova.
- ~~**`/agendar` e as rotas de marketing são slugs reservados na prática.**~~ —
  **RESOLVIDA pelo agente 29**: a lista existia mas estava velha (faltavam
  `cadastro`, `recuperar-senha`, `privacidade`), e agora um teste lê o
  diretório de rotas e reprova quando nasce rota fora dela. Era: Uma
  barbearia com slug `entrar`, `cadastro`, `agendar` ou `recuperar-senha` nunca
  abriria: no Next a rota estática ganha da dinâmica. Antes eram domínios
  separados e isso não existia. Vale uma validação de slug no cadastro do
  tenant (`apps/api`), com a lista de reservados vindo daqui.
- ~~**Nenhum teste automatizado do middleware.**~~ — **RESOLVIDA pelo agente
  29**: `apps/web/test/middleware.spec.ts` cobre a guarda de host do admin nos
  quatro hosts, as reescritas e os cabeçalhos por superfície. Era: A guarda de host e as reescritas
  foram verificadas ao vivo com `curl -H "Host: ..."` (resultado na seção da
  fase 11), mas não há teste que reprove no CI se alguém quebrar a guarda do
  admin. É o candidato mais óbvio a teste de frontend, agora que existe uma app
  só para configurar.

### Dívidas novas da fase 01

- **Sem CI ainda.** O `SPEC.md` pede "CI mínimo (lint + typecheck + test +
  build)". Os alvos existem (`make lint/typecheck/test/build`), mas não há
  workflow. Resolver na fase 09 (ou antes, se o repo ganhar remote).
- **Suíte de isolamento roda só o arnês.** `test/isolation/tenant-fixture.ts`
  monta os dois tenants e tem o assert de vazamento; `harness.isolation-spec.ts`
  valida o próprio arnês. **Cada fase seguinte deve adicionar o seu
  `*.isolation-spec.ts`** — sem isso o gate não mede nada de novo.
- ~~`ClientProfile.phone` é desnormalizado de `Client.phone` — sincronia
  depende de disciplina~~ — **resolvida na fase 05**: a troca de telefone
  (`POST /client-auth/me/phone/confirm`) escreve em TODA `ClientProfile` do
  cliente na mesma transação; o registro (fase 03) e o primeiro agendamento
  por barbearia (fase 04) já cobriam os outros dois pontos de escrita. Os
  três caminhos que tocam `Client.phone` agora sincronizam — nenhuma trigger
  de banco foi necessária.
- **`MockPaymentDriver` guarda estado no Redis** (chave `bvp:mock-payment:*`,
  TTL 30 dias). `make reset` limpa; um `docker compose restart redis` sem
  `--appendonly` perderia as cobranças simuladas. Sem impacto real até a
  fase 07/08 usarem o adapter.
- **Sem `Unit` no seed.** O modelo existe (multi-unidade do plano Avançado),
  mas o tenant demo está no Profissional e não tem unidade — todos os
  `unitId` são `null`. A fase 08 que exercitar multi-unidade precisa semear.
- ~~**`AppConfigModule` reconstrói o objeto de config** listando as chaves à
  mão~~ — **resolvida na fase 03**: a lista agora sai de `ENV_KEYS`, derivado do
  próprio `envSchema`.

### Dívidas novas da fase 02

- **`apps/api/dist` root-owned bloqueia `pnpm turbo run build` local.** É a
  dívida "`deleteOutDir: false`" da fase 01 batendo na prática: um `make up`
  anterior deixou `apps/api/dist` com dono `root` (volume do container), e
  `nest build` fora do container não consegue escrever nele. `pnpm turbo run
  lint typecheck` roda 100% verde (inclusive `apps/api`); as 4 apps Next
  (`site`/`booking`/`dashboard`/`admin`) buildam limpas. Só o build standalone
  da API falha localmente — dentro do Docker (produção) não acontece, porque
  lá o container é dono do volume. Resolver criando o `pnpm clean` que o
  `CONTEXT.md` da fase 01 já prometia (`rm -rf apps/api/dist` via container,
  já que o host não tem permissão), ou rodar `sudo chown` uma vez.
- **Nenhum `.dc.html` deste bundle tem tela de Super Admin** — o `AppShell`
  foi validado com o `NAV_DEFS` do dashboard da barbearia (14 itens). A fase
  08 provavelmente precisa de um conjunto de nav diferente; o componente já
  aceita qualquer lista de `AppShellNavItem`, então não é retrabalho, só
  falta o conteúdo.
- **Sem componente de "stepper" dedicado** para o indicador de etapas do
  wizard (`stepperSegments`/`stepperLabel` do `AgendamentoWizard.dc.html` —
  as 4 barrinhas + "Etapa X de 4"). É simples o bastante (um `<div
  className="flex gap-1">` com cor condicional) para não justificar
  primitive própria nesta fase; a fase 04 decide se cristaliza um
  `Stepper` ao implementar o wizard de verdade ou mantém inline.
- **`packages/ui` ainda não tem teste automatizado** (nem unit nem
  visual/a11y). O `Makefile`/CI da fase 09 precisa decidir a ferramenta
  (Vitest + Testing Library é o caminho natural, já que não há Storybook
  para plugar um addon de a11y). Sem isso, regressão de acessibilidade em
  overlay/foco só é pega manualmente no `/playground`.

### Dívidas novas da fase 03

- **Google OAuth adiado.** O botão "Continuar com Google" existe no
  `ClienteAuth`, como no protótipo, e responde com o toast "Em breve" — não
  finge autenticar. Implementar como adapter próprio (mesmo padrão de
  `NotificationAdapter`), provavelmente na fase 09. É a única funcionalidade
  desenhada no protótipo desta fase que não ficou funcional.
- ~~**Upload de logo e capa é campo de URL, não upload.**~~ — **RESOLVIDA pelo
  agente 30**: o passo 3 usa dois `ImageSlot` e `POST /my-page/images/:slot`, e
  o DTO de `identity` recusa URL digitada. O schema não mudou, como previsto.
  Era: o passo gravava `TenantSettings.logoUrl`/`coverUrl` a partir de uma URL
  digitada, com um aviso que prometia o upload "na fase de integrações" —
  promessa que ficou desatualizada no agente 25, quando o `StorageAdapter`
  nasceu.
- **`ClientProfile.phone` continua desnormalizado e agora TEM serviço de
  escrita.** A dívida da fase 01 previa isto: `ClientAuthService` altera
  `Client.phone` e `Client.name`, mas nenhum `ClientProfile` existe ainda nesta
  fase (só nascem no primeiro agendamento, fase 04). **Quem implementar a fase
  04/05 precisa sincronizar os dois na escrita, ou promover a trigger.**
- **Não há tela de "trocar senha" no painel.** O endpoint
  `POST /auth/password/change` está pronto e testado, mas a UI dele pertence à
  tela de Configurações (fase 07). Idem para gerenciar sessões ativas — os
  dados estão em `AuthSession`, falta a tela.
- **`OtpCode` e `AuthSession` expiradas não são limpas.** Ambas têm índice em
  `expiresAt` e não atrapalham consulta, mas crescem para sempre. A fase 09
  (hardening) deve agendar um job BullMQ de limpeza — o Redis e o BullMQ já
  estão de pé desde a fase 01.
- **Rate limit do throttler é por IP, em memória.** Suficiente para uma
  instância; com N réplicas atrás de load balancer, cada uma conta o seu. A
  fase 09 deve plugar o storage Redis do `@nestjs/throttler`. O limite por
  destino do OTP não tem esse problema: é contado no banco.
- **`prisma/migrations/migration_lock.toml` nasceu na fase 03.** A fase 01
  escreveu a migration à mão sem ele, o que impedia `prisma migrate diff
  --from-migrations`. Já está no lugar; só vale saber que ele apareceu depois.
- **Container e host precisam de `pnpm install` separados.** Os `node_modules`
  do compose são volumes anônimos: instalar dependência nova no host não a leva
  para dentro do container. Depois de mexer em `package.json`, rode
  `docker exec -e CI=true barbervp-<svc> pnpm install` em cada serviço afetado
  (ou recrie os containers). O `CI=true` é necessário porque o pnpm recusa
  limpar `node_modules` sem TTY.

### Dívidas novas da fase 04

- **BullMQ continua desligado — os lembretes existem, mas ninguém os envia.**
  `NotificationOutbox` já tem as linhas `PENDING` com `scheduledFor`, e o índice
  `(status, scheduledFor)` existe para isso. **A fase 09 precisa do worker** que
  varre `status = PENDING AND scheduledFor <= now()`, entrega e marca `SENT`.
  Enquanto isso, "cancelar um lembrete" é marcá-lo `FAILED` com o motivo — sem
  fila, não há job para remover.
- **Nenhuma tela cria avaliação.** O modelo `Review` existe e é lido pela página
  pública; a coleta (disparo do template `REVIEW` após o atendimento + tela de
  resposta) é da fase 07/09. Hoje só o seed planta avaliação.
- **Reserva de assinatura na página pública é vitrine.** O card "Assinar"
  responde com toast; a contratação (`AssinaturaCliente.dc.html`) é da fase 05.
  A LEITURA está pronta: cobertura por serviço, débito atômico, estorno no
  cancelamento e o resumo "Sua assinatura" no lugar da lista de ofertas.
- **"Meus agendamentos" ainda não abre nada.** O menu da conta existe e o
  endpoint de consulta por código está pronto, mas a listagem por cliente é
  `MinhaConta`, fase 05.
- **Capa e logo entram por `<img>` cru, não por `next/image`.** São URLs
  arbitrárias digitadas pelo dono (a dívida de upload da fase 03), e o loader do
  Next exigiria allowlist de domínio. Quando a fase 09 trocar o campo por upload
  em storage próprio, o domínio passa a ser conhecido e o `next/image` entra
  junto — com lazy loading e responsive srcset de brinde.
- **Combo resolve um por vez.** Um catálogo com dois combos que compartilham peça
  exigiria decidir prioridade entre eles, e não há regra de negócio para isso. O
  catálogo real tem um ("Corte + Barba"); se a fase 06 deixar o dono criar
  vários, esta decisão volta à mesa.
- **A grade não conhece `Unit`.** Todo `unitId` continua `null` (dívida da fase
  01): o motor ignora unidade ao montar horários. A fase 08, que exercita
  multi-unidade, precisa acrescentar o filtro — o campo já existe em
  `Appointment` e em `Barber`.
- **Sem teste de frontend automatizado.** A verificação desta fase (360/390/768/
  1024/1440 sem rolagem horizontal, alvos de toque, fluxo completo até o código
  da reserva) foi feita com Puppeteer em scripts descartáveis, não versionados.
  A dívida da fase 02 (`packages/ui` sem teste) segue de pé e agora vale para as
  telas também; a fase 09 decide a ferramenta.

### Dívidas novas da fase 05

- **BullMQ continua desligado — a renovação de assinatura existe, mas nada a
  agenda de verdade.** `SubscriptionRenewalService.runOnce()` está pronta e
  testada isoladamente (mock de Prisma/`PaymentAdapter`), exatamente como o
  lembrete de agendamento da fase 04 ficou. **A fase 09 precisa do worker**
  que chama `runOnce()` num `@Cron` diário — até lá, uma assinatura cujo
  `currentPeriodEnd` vence sem ninguém rodar o job manualmente continua
  `ACTIVE` com o período vencido (a cobertura já para de contar, porque
  `SubscriptionCoverageService` filtra `periodEnd > now` nos usos, mas o
  status não muda sozinho para `PAST_DUE`).
  Rodar manualmente: `SubscriptionRenewalService.runOnce()` a partir de um
  script Nest (não há endpoint HTTP para isto — é job, não ação de cliente).
- **Sem tela de gestão de planos pelo lado da barbearia.** `ClientPlan` só é
  criado pelo seed nesta fase — o CRUD de planos (criar, editar preço,
  desativar) é do dono/gerente e é trabalho explícito da **fase 07**
  (Dashboard II, "assinatura/fidelidade" do lado da casa). A fase 05 só
  consome o que já existe.
- **Remarcar da `MinhaConta` mantém o barbeiro fixo.** O `RescheduleDialog`
  não oferece trocar de profissional (só data/horário) — o endpoint
  (`AppointmentsService.reschedule`, fase 04) aceita `barberId` opcional, a
  UI desta fase é que não expõe o campo. Decisão de escopo: trocar de
  barbeiro é uma decisão maior que "mesmo corte, outro horário", e o
  protótipo (`MinhaConta.dc.html`) também não oferece essa opção no botão
  "Remarcar".
- **Pausar/reativar não tem histórico próprio.** `ClientSubscription` não
  ganhou `pausedAt`/campos de auditoria de pausa — o `AuditLog`
  (`SUBSCRIPTION_PAUSED`/`SUBSCRIPTION_RESUMED`) registra QUANDO, mas a
  tela não mostra "pausada desde X". Se a fase 07 (visão da barbearia)
  precisar disso, é campo novo + migration pequena.
- **Sem teste de frontend automatizado para `MinhaConta`/`AssinaturaCliente`**
  — mesma dívida da fase 02/04, ainda sem ferramenta escolhida. A verificação
  desta fase foi `pnpm typecheck`/`lint`/`build` limpos nas 3 apps tocadas
  (`api`, `booking`, `packages/types`, `packages/ui`) mais os 18 e2e/4
  isolamento contra o backend real — o layout responsivo em si (768px,
  alvos de toque) foi conferido por leitura de código contra os primitives
  já testados na fase 02 (`Modal`/`Tabs`/`EmptyState`), não por captura de
  tela em breakpoints.
- **`AssinaturaCliente` não reoferece o card "Sua assinatura" na cotação do
  wizard quando o cliente cancela e assina outro plano no meio de um
  agendamento em andamento.** Caso de borda raro (trocar de plano com o
  wizard aberto na aba ao lado) — não coberto por teste, sem relato de
  produto pedindo isso.

### Dívidas novas da fase 06

- **`pnpm --filter @barbervp/dashboard build` (produção) falha em TODAS as
  rotas, inclusive `/404`/`/500` do próprio Next e páginas de fases
  anteriores (`/playground`, `/configurar`) — `TypeError: Cannot read
  properties of null (reading 'useContext')` durante a pré-renderização
  estática. **Confirmado que não é regressão desta fase**: reproduz igual com
  o servidor de dev parado e `.next` limpo, e atinge páginas que este agente
  não tocou. Cheira a duas cópias de React no bundle de produção (`next dev`
  não passa por esse caminho, por isso nunca apareceu antes). `next dev`,
  `tsc --noEmit` e `next lint` das 4 apps ficam limpos — só o `next build`
  standalone quebra. Como o `Dockerfile.dev`/`docker-compose.yml` rodam
  tudo em `next dev`, isto não bloqueou a verificação desta fase, mas
  **bloqueia `docker-compose.prod.yml`, que usa `next build`** — precisa de
  investigação antes da fase 09 (hardening/deploy).

  **Atualização (revisão da fase 07): três hipóteses DESCARTADAS com
  evidência** — não repetir estas buscas:
  1. *Duas cópias de React* (era a suspeita principal registrada aqui):
     **falso**. `ls /app/node_modules/.pnpm/react@*` devolve UMA única
     `react@18.3.1`, e `readlink -f node_modules/react` a partir de
     `apps/dashboard`, de `packages/ui` e da raiz aponta todos para o MESMO
     caminho real.
  2. *Componente de `packages/ui` usando hook sem `'use client'`*:
     **falso**. Varredura de todo arquivo com `useState|useEffect|
     useContext|useRef|useMemo|createContext` — todos têm a diretiva.
  3. *Artefato velho de `next dev` reaproveitado pelo `next build`*
     (o stack trace mistura `app-page.runtime.prod.js` e
     `...dev.js`, o que sugeria isso): **falso**. Com o dev parado e o
     conteúdo de `.next` apagado, o build falha igual.

  **Corrigido de fato nesta revisão** (não resolve o build, mas era um bug
  real e silencioso): `outputFileTracingRoot` estava na RAIZ do
  `next.config.mjs` das 4 apps. No Next 14 essa chave vive sob
  `experimental` (só virou top-level no Next 15) — o Next avisava
  "Unrecognized key(s) in object: 'outputFileTracingRoot'" a cada boot e
  IGNORAVA a configuração, o que por si só quebraria o tracing do
  standalone no monorepo mesmo depois de o erro de prerender ser resolvido.
  Movido para `experimental` nas 4 apps; o aviso sumiu e o `next dev`
  segue normal.

  Próximos candidatos a investigar: `next/font/google` no `layout.tsx` (o
  prerender busca a fonte pela rede — sem saída de internet no build, o
  erro pode aparecer disfarçado), ou algum export do barrel
  `packages/ui/src/index.ts` (que NÃO tem `'use client'`) sendo arrastado
  para o grafo de servidor.
- **Sem `e2e-spec.ts` dedicado para os módulos desta fase.** A fase 06 ganhou
  a suíte de isolamento (`dashboard-operation.isolation-spec.ts`, 11 casos —
  tenant + papel, é o critério de aceite explícito da fase) mas, diferente
  das fases 03–05, não ganhou um `test/*.e2e-spec.ts` cobrindo casos de
  validação e regra de negócio fora do isolamento (nome de serviço duplicado,
  `estoqueMin`/estoque negativo, convite para e-mail já convidado, escala com
  `endTime <= startTime`, combo aplicado num agendamento criado pelo staff
  etc.). Os unitários das fases 01–05 continuam 100% verdes porque nada foi
  alterado nelas; o que falta é cobertura NOVA para os módulos desta fase.
- ~~**Modal de novo agendamento assume fuso do navegador = fuso do tenant**~~ —
  **não reproduz**: o `startsAt` enviado vem de `GET /staff-agenda/slots`, que
  é instante UTC calculado no servidor. Registro do que ERA:
  (decisão documentada acima). Correto para o caso real (staff operando da
  própria barbearia); errado se algum dia existir operação remota/multi-fuso.
  Resolver: repetir no frontend a mesma conversão `zonedTimeToUtc` que
  `apps/api/src/common/utils/timezone.ts` já tem no backend, usando o
  `timezone` que `GET /staff-agenda` já devolve.
- ~~**Mover agendamento só troca o horário do MESMO dia**~~ — **não reproduz**:
  a remarcação reusa o modal completo, com data E barbeiro. Era: — o `MoveModal` do
  `/agenda` não deixa escolher outra data (nem outro barbeiro, embora o
  endpoint `PATCH /staff-agenda/:id/move` aceite `barberId`). Simplificação
  de UI para caber no tempo desta sessão; o backend já suporta o caso
  completo, falta o formulário.
- ~~**Sem marcar `DONE`/`NO_SHOW` pela agenda.**~~ — **não reproduz**:
  `PATCH /staff-agenda/:id/no-show` existe, com controle no drawer e caso e2e
  provando que a falta bloqueia o cliente no booking. Era: Esta fase só cobre criar/mover/
  cancelar (`AppointmentStatus` fica em `SCHEDULED`/`CONFIRMED`/`CANCELED`) —
  fechar o atendimento como concluído ou falta é ação de Comandas, fase 07
  explícita no enunciado. Consequência: `ClientProfile.noShowCount` (usado
  pelo bloqueio de agendamento online, regra já ativa desde a fase 04) segue
  sem nenhum caminho de escrita até a fase 07 nascer.
- ~~**Visão "Timeline" do protótipo não tem desenho próprio**~~ — **não
  reproduz**: `agenda-timeline.tsx` porta o desenho da l.533–563. Era:
  **Visão "Timeline" do protótipo (`isTimelineView`) não tem desenho
  próprio no frontend** — o contrato (`AgendaView.TIMELINE`) existe e o
  backend responde igual a `DAY`, mas a tela ainda renderiza as duas do
  mesmo jeito (colunas por barbeiro). O protótipo mostra uma barra de tempo
  horizontal por barbeiro; portar esse desenho específico ficou de fora por
  tempo, sem perda de dado (a resposta da API já tem tudo que a timeline
  precisaria).
- **Sem teste de frontend automatizado** para os 5 módulos desta fase — mesma
  dívida das fases 02/04/05, ainda sem ferramenta escolhida. Verificação
  feita por `tsc --noEmit`/`next lint` limpos + `curl` nas 6 rotas novas
  (200, sem erro no log do `next dev`) + leitura de código contra os
  primitives já testados na fase 02, não por captura de tela em breakpoints
  nem interação real de usuário.
- **`ProductsAdminService.list` com `lowStock=true` carrega a tabela inteira
  em memória** para comparar `stock <= estoqueMin` (Prisma não expressa
  comparação entre duas colunas do mesmo registro em `where`). Sem problema
  no volume de uma barbearia (dezenas de produtos), mas não escala — se um
  catálogo de centenas de produtos aparecer, trocar por `$queryRaw` com
  `WHERE stock <= "estoqueMin"`.

### Revisão da fase 07 — bugs encontrados e corrigidos

Revisão linha a linha feita ao fim da fase (sessão separada, modelo maior).
Cinco defeitos reais, todos corrigidos e cobertos por teste onde fazia
sentido:

1. **`POST /orders/:id/reopen` não desfazia NADA** — era o mais grave.
   Reabrir só virava `status: OPEN`, e como `close()` só exige `OPEN`, fechar
   de novo aplicava tudo pela segunda vez: estoque baixado 2×,
   `CommissionEntry` e `Payment` duplicados, pontos de fidelidade creditados
   2×, `visitCount`/`totalSpentCents` somados 2×, quota de assinatura
   consumida 2×. Dinheiro e estoque errados a partir de um botão que a UI
   oferece normalmente. Agora `reopen` roda em transação única e é o par
   simétrico de `close()`: devolve estoque, devolve a quota de assinatura,
   apaga comissões e pagamentos, apaga a movimentação de caixa, estorna as
   linhas de `LoyaltyPoints` daquela comanda, desfaz o efeito no
   `ClientProfile` e volta o `Appointment` de `DONE` para `CONFIRMED`.
   **Trava nova**: comanda cujo período de comissão já foi fechado
   (`CommissionEntry.status = PAID`) não pode mais ser reaberta — a comissão
   virou obrigação com o barbeiro e não pode sumir. Coberto por
   `dashboard-ii.e2e-spec.ts` → "reabrir estorna o fechamento; fechar de
   novo não duplica nada".
2. **Estoque insuficiente virava 500 sem explicação.** `addItem` lia
   `product.stock` e não usava; o fechamento fazia `decrement` cru e só a
   CHECK `product_stock_non_negative` (fase 01) segurava — mas violação de
   CHECK não tem `case` no `AllExceptionsFilter`, então caía no 500
   genérico. Agora: `addItem` recusa com 400 explicativo, e o fechamento
   baixa estoque com `UPDATE ... WHERE stock >= quantity` conferindo as
   linhas afetadas (pega o caso de outra comanda ter levado a última unidade
   no meio do caminho). Coberto por teste.
3. **Financeiro e Comissões faziam bloqueio silencioso.** As duas telas
   ignoravam o 403 `FEATURE_NOT_IN_PLAN`: um tenant Essencial via "Nenhuma
   conta a pagar" e "Nenhuma comissão neste período" — mentira, e exatamente
   o que o enunciado proíbe ("upsell discreto, não bloqueio silencioso").
   Agora as duas usam `FeatureLocked` como Fidelidade e Relatórios já
   faziam, os botões de criar somem quando bloqueado, e as queries com gate
   ganharam `retry: false` (403 não é falha transitória).
4. **"Período fechado" com lógica invertida.** `CommissionsService.period`
   marcava o mês como fechado se QUALQUER barbeiro estivesse fechado
   (`anyClosed = anyClosed || closed`). Com dois barbeiros, fechar um sumia
   com o botão "Fechar período" e travava o outro em `PENDING` para sempre.
   Agora é `allClosed`.
5. **Estado obsoleto ao trocar de comanda no POS.** `ComandaContent` guarda
   o desconto digitado em estado local e não remontava ao trocar de comanda
   — carregava o valor da anterior. Resolvido com `key={order.id}`.

Também: `MyPageService.update` passou a gravar o slug já normalizado que a
checagem de disponibilidade aprovou, em vez de normalizar de novo (mesma
função determinística, mas fecha a porta para divergência).

Total após a revisão: 80 unit + **83 e2e** (2 casos novos) + 52 isolamento,
todos verdes.

### Dívidas novas da fase 07

- **N+1 em `GET /commissions/period`**: o extrato roda 3 queries por
  barbeiro (lançamentos, produtos, vales) dentro de um `for`. Com o volume
  de uma barbearia (4–10 barbeiros) são ~30 queries rápidas, sem impacto
  perceptível — e o "não N+1" do enunciado era requisito explícito só dos
  Relatórios (que usam `$queryRaw` com `GROUP BY`, e estão corretos). Vale
  reescrever como `groupBy` único se o número de barbeiros crescer.
- ~~**`revenueByBarber` do relatório avançado usa `INNER JOIN Barber`**~~ —
  **RESOLVIDA pelo agente 29** (`LEFT JOIN` + linha "Sem barbeiro", para a
  soma fechar). O rateio por item continua fora, por decisão de produto. Era:, então
  comanda sem barbeiro definido (walk-in no balcão) fica de fora do
  detalhamento — a soma por barbeiro pode não bater com o faturamento total
  do resumo. Igualmente, o faturamento é atribuído pelo `Order.barberId`
  (barbeiro "principal" da comanda), não rateado por item: comanda com
  serviços de dois barbeiros conta inteira para um só.
- ~~**Resgate de pontos não é protegido contra concorrência.**~~ — **RESOLVIDA
  pelo agente 29**: trava consultiva por (tenant, cliente) e reconferência do
  saldo dentro da transação, com 409 `LOYALTY_BALANCE_CHANGED`. Era: Duas comandas
  abertas do MESMO cliente, ambas com `useLoyalty`, fechando ao mesmo
  tempo, podem resgatar o mesmo saldo duas vezes (o saldo é a soma do
  ledger, sem `SELECT ... FOR UPDATE` nem constraint de não-negativo).
  Diferente da quota de assinatura, que TEM débito atômico e CHECK. Caso de
  borda improvável no balcão (o mesmo cliente com duas comandas abertas
  simultâneas), mas é uma inconsistência real de tratamento.
- **Nenhuma verificação VISUAL de responsividade — só estrutural.** O
  "checklist de responsividade, atenção especial ao POS" foi conferido lendo
  as classes Tailwind (`hidden lg:flex`/`lg:hidden`, `grid lg:grid-cols-
  [1fr_380px]`, o `footer` do `Modal` fora da área `overflow-y-auto`) e
  confiando no comportamento já testado do `Modal`/`Drawer` (bottom-sheet
  nativo < 768px, fase 02) — não em captura de tela em 360/768/1440px nem
  interação real de usuário. Não há Playwright/Storybook no projeto ainda
  (mesma dívida da fase 06). Se algo escapou da leitura de código, só
  aparece testando ao vivo (`docker compose up dashboard` — sozinho, sem a
  stack inteira, para não estourar RAM numa máquina mais modesta).
- **`FeatureLocked` de uma seção só aparece DEPOIS da tentativa de
  requisição falhar** (é reativo ao 403 real, não a um estado pré-calculado
  — ver decisão técnica) — a primeira renderização de uma tela gated sempre
  mostra o `Skeleton` de carregamento por uma fração de segundo antes do
  cadeado, mesmo sabendo de antemão (pelo menos para quem já viu a tela)
  que vai ser bloqueada. Cosmético, não bloqueia nada.
- ~~**Sem marcar `NO_SHOW` pela Comandas.**~~ — **RESOLVIDA**: o caminho é
  `PATCH /staff-agenda/:id/no-show`, pela Agenda. Era: O fechamento de comanda marca o
  `Appointment` vinculado como `DONE` (regra do enunciado), mas não existe
  NENHUM caminho — nem na Agenda (fase 06), nem em Comandas (fase 07) — para
  marcar um agendamento como `NO_SHOW`. Consequência: `ClientProfile.
  noShowCount` (a base do bloqueio de agendamento online desde a fase 04)
  continua sem nenhuma escrita real no produto, só no seed. Resolver: um
  endpoint `PATCH /staff-agenda/:id/no-show` (ou equivalente em Comandas)
  que incrementa `noShowCount` e marca o `Appointment`.
- **Split de pagamento não valida método duplicado nem quantidade de
  parcelas** — `CloseOrderDto.payments` aceita, por exemplo, dois lançamentos
  `PIX` separados (soma continua validada, então não é bug financeiro, só
  falta de UX — o front deveria consolidar/alertar).
- **Calculadora de preço (`POST /settings/price-calculator`) é STATELESS,
  não lê o catálogo real.** O enunciado pede "escopo simples nesta fase" —
  a fórmula (`custo + rateio de fixos, dividido por 1 − margem − comissão`)
  não persiste nada nem sugere aplicar o preço calculado direto num
  `Service`. Se o produto quiser "aplicar preço sugerido" no catálogo, é
  fase futura.
- **Sorteio "aviso via WhatsApp" notifica só quem já tem histórico de
  pontos** (`LoyaltyPoints` do tenant, até 100 destinatários) — o enunciado
  não define "elegibilidade" com precisão; clientes sem NENHUM ponto ainda
  (primeira visita) não são avisados. Ajustar quando houver critério de
  produto mais específico (ex.: todos os clientes com `notifyWhatsapp:
  true`, sem exigir histórico).
- **`AiChatMessage`/Assistente IA sem paginação de histórico** — segue de pé
  depois do agente 28: `GET /assistant/messages` sempre devolve as últimas 100
  mensagens inteiras, sem
  cursor. Suficiente para o volume de um chat de suporte interno; revisar se
  o uso real acumular milhares de mensagens por usuário.
- ~~**Teste unitário pré-existente flaky**~~ — **RESOLVIDA**: reescrito para
  medir entropia (colisões ≤ 2), com a matemática no comentário, mais um caso
  de cobertura de alfabeto. Era:
  `booking.spec.ts` → "não repete em 2 mil sorteios" ocasionalmente falha por
  colisão genuína de `generateBookingCode()` (paradoxo do aniversário com
  alfabeto pequeno) — reproduzido isolado e também passou limpo na
  re-execução. Prioridade baixa (a fase 04 já mitiga colisão real com retry
  na escrita), mas caso vire ruído recorrente no CI, aumentar a amostra do
  alfabeto ou reduzir o `n` do teste para descolar da margem exata do
  paradoxo do aniversário.

### Dívidas RESOLVIDAS na fase 09

Riscadas onde apareceram, resumidas aqui:

- ~~**Sem CI**~~ (fase 01) — `.github/workflows/ci.yml`, com a suíte de
  isolamento como gate explícito.
- ~~**Suíte de isolamento roda só o arnês**~~ (fase 01) — 106 casos, matriz
  completa por recurso.
- ~~**`apps/api/dist` root-owned bloqueia o build local**~~ (fase 02) —
  container roda como uid 1000.
- ~~**`packages/ui` sem teste automatizado / sem ferramenta de frontend**~~
  (fases 02/04/05/06/07) — `scripts/responsive-sweep.mjs` + `make responsive`,
  Chrome de verdade nos 5 tamanhos.
- ~~**`OtpCode`/`AuthSession` expiradas nunca são limpas**~~ (fase 03) — job
  `maintenance`.
- ~~**Rate limit por IP em memória**~~ (fase 03) — storage Redis.
- ~~**BullMQ desligado: lembretes existem mas ninguém envia**~~ (fase 04) —
  fila `outbox`, verificada ao vivo entregando um lembrete vencido.
- ~~**Renovação de assinatura sem quem a agende**~~ (fase 05) — fila
  `subscriptions` chamando o `runOnce()` que já existia.
- ~~**Ciclo de billing sem quem o dispare**~~ (fase 08) — fila `billing`;
  `runCycle()` aceita rodar sem ator e grava `trigger: 'schedule'` no
  `AuditLog`.
- ~~**`next build` de produção falha nas 4 apps**~~ (fases 06/08) — era
  `useSearchParams()` sem `<Suspense>` em duas telas do dashboard. `make build`
  roda 6/6.
- ~~**Violação de CHECK vira 500**~~ (fase 07) — 409 com o contrato de erro.

### Dívidas novas da fase 09

- **A varredura responsiva precisa de `--delay` e das apps já no ar.** Ela
  simula um padrão de acesso que nenhum usuário produz (dezenas de telas em
  segundos) e, sem folga entre as rotas, estoura o rate limit da API e passa a
  medir a tela de erro do Next. O padrão (2,5s) serve para `site`, `booking` e
  `admin`; o `dashboard` precisa de `--delay=6000` porque cada tela dispara
  várias consultas. Automatizar isso no CI exigiria subir as 4 apps e afrouxar
  o throttle — não foi feito, a varredura é um alvo de `make`, rodado à mão.
- **A varredura cobre as telas, não os fluxos dentro delas.** Ela abre cada
  rota e mede o layout renderizado; modal aberto, drawer, wizard no passo 3 e
  tabela com muitas linhas não são exercitados. Um transbordamento que só
  aparece com o `Modal` aberto passaria. Cobrir isso é Playwright com
  interação, uma decisão de ferramenta maior que esta fase.
- **Só as telas públicas de `site` e `booking` entram na varredura.** As
  telas atrás de login dessas duas apps (a conta do cliente, o wizard de
  agendamento) exigiriam uma sessão de CLIENTE, que é outro fluxo de auth; as
  do dashboard e do admin são varridas logadas. As telas de cliente usam os
  MESMOS primitives já exercitados, mas a afirmação "todas as telas" tem essa
  ressalva.
- **`AdminOutboxService` une as duas tabelas em memória.** Busca `skip + take`
  de cada lado, junta, ordena e corta. Correto e barato para o volume de uma
  página, mas é O(skip) — numa página muito profunda carregaria bem mais linhas
  do que devolve. Trocar por `UNION ALL` em `$queryRaw` se o volume pedir.
- **Uma réplica de worker é o suficiente, e isso não é imposto.** Os quatro
  jobs são agendamentos repetíveis; duas réplicas com
  `QUEUE_WORKERS_ENABLED=true` dividem o mesmo trabalho sem duplicar efeito (o
  dreno reivindica cada linha antes de entregar), mas é desperdício. Está
  documentado em `docs/DEPLOY.md`, não travado por código.
- **Impersonação continua sem kill-switch** (dívida da fase 08, não resolvida
  aqui) — segue sem endpoint que revogue a sessão antes dos 900s.
- **O disco da máquina de desenvolvimento estava 100% cheio** durante esta
  sessão (2,1 GB livres de 233 GB), com ~19 GB só de cache de build do Docker.
  Foi limpo (`docker builder prune -af`), mas **não é a causa** de nenhum dos
  bugs desta fase — foi investigado e descartado. Vale registrar porque a
  anomalia do banco vazio da fase 08 segue sem causa raiz, e disco cheio
  continua sendo uma hipótese não testada para ela.

### Dívidas novas da fase 08

- **Anomalia intermitente do ambiente de dev, NÃO raiz-causada**: em algum
  momento desta fase o banco perdeu TODAS as linhas de `Tenant`/`User`/
  `Order` (tabelas vazias, sem erro visível). Investigado e descartado como
  causa: o boot normal de `docker compose up -d api` (testado explicitamente
  — rebaselinar 7 migrations, confirmar contagem, reiniciar `api` normal,
  confirmar contagem igual), o mount do volume `barbervp-db-data` (conferido
  correto), e o entrypoint do `Dockerfile.dev` (sem lógica de reset). Outros
  volumes Docker órfãos de projetos antigos foram encontrados na máquina mas
  não são o volume montado por este compose. Contornado operacionalmente
  (reseed + verificação imediata) todas as vezes que aconteceu; se voltar a
  acontecer, vale medir se há relação com o host ficar sem RAM/trocar pra
  swap (a mesma sessão que viu isso também viu o VSCode fechar por RAM) —
  hipótese não testada.
- **`next build` de produção continua falhando** nas 4 apps (dívida herdada
  da fase 06, não desta fase) — `outputFileTracingRoot` foi corrigido para
  dentro de `experimental` (era ignorado silenciosamente fora dali, bug real
  que esta fase consertou), mas isso NÃO resolveu a falha de prerender; três
  outras hipóteses já descartadas com evidência (ver dívida da fase 06). Sem
  causa raiz identificada ainda — `next dev` funciona normalmente em todas as
  4 apps, então não bloqueia verificação nem uso, só `next build`/deploy.
- **Impersonação não é revogável antes dos 900s.** Não existe "encerrar
  sessão de impersonação à força" do lado do super admin — só o próprio
  fluxo (banner → "Sair da impersonação") ou o token expirar sozinho. Pra um
  MVP com sessão curta e sem refresh já é baixo risco, mas se o produto
  precisar de um kill-switch (ex.: revogar em massa por incidente), falta um
  endpoint que invalide `AuthSession.id` da sessão de impersonação
  especificamente.
- **Sem paginação em `/admin/tenants` além do básico já existente** — a
  fase reusa o padrão de paginação das fases anteriores (`page`/`perPage`),
  suficiente pro volume de tenants de um MVP; se a base de tenants crescer
  muito, os 2 `groupBy` de uso agregado (barbeiros/agendamentos do mês)
  passam a rodar sobre a base inteira antes de paginar — vale revisar se
  virar centenas de tenants.
- **Teste ao vivo do login redirect do `site` (`isSuperAdmin` →
  `NEXT_PUBLIC_ADMIN_URL`) foi só por leitura de código + `tsc`/`eslint`
  limpos, não pelo navegador** — mudança de 3 linhas, baixo risco, mas sem
  verificação em runtime nesta sessão (RAM não permitiu manter `site` +
  `admin` + `dashboard` de pé ao mesmo tempo). Conferir na próxima sessão que
  mexer em `apps/site`.

## Deploy alvo (fase 11 anotou, fase 12 configura)

| Peça | Onde | Observação |
|---|---|---|
| `apps/web` | **Vercel** | Next 14 roda sem ajuste. Os quatro domínios apontam para o MESMO projeto; `HOST_*` e `NEXT_PUBLIC_*_URL` nas variáveis do projeto. |
| `apps/api` + Postgres + Redis | **Railway**, plano Hobby | `QUEUE_WORKERS_ENABLED=false` na réplica web e `true` no worker, se separar. |
| `docker-compose.yml` da raiz | continua existindo | É o ambiente de desenvolvimento local. Railway não o usa. **Não remover.** |

Vercel e Railway buildam UM pacote cada, não o monorepo — `make build-web` e
`make build-api` rodam esse contrato, e o CI o verifica em dois passos
dedicados.

## Fechamento do produto v1 — o que ficou fora e por onde entra

As 9 fases estão concluídas. O que segue NÃO é dívida acidental: é escopo
declarado fora do v1 no `SPEC.md`, com o caminho de entrada documentado.

| Fora do v1 | Estado hoje | Caminho documentado |
|---|---|---|
| **WhatsApp oficial** | `MockNotificationDriver` completo: grava em `NotificationOutbox`, entrega os agendados pela fila, aparece na tela "Mensagens". **Desde o agente 29 as automações de CALENDÁRIO (aniversário, reativação, avaliação) disparam de verdade**, por job diário — antes os três interruptores não executavam nada | `docs/INTEGRACOES.md` — 3 passos (driver ao lado do mock, enum do env, `case` na factory). **Validado seguindo os próprios passos nesta fase**: um driver de sondagem foi escrito, plugado e conferido no log de boot, sem tocar em módulo de negócio nenhum. |
| **Asaas** | `MockPaymentDriver` simula o ciclo inteiro (criar, confirmar, receber, estornar) com aprovação/recusa manual pelo super admin | `docs/INTEGRACOES.md` — mesmos 3 passos, **mais** um controller de webhook (`POST /webhooks/asaas`) que chame os MESMOS serviços que a tela de billing chama. `simulateTransition` deve responder 501 no driver real. Acréscimo, não refatoração. |
| **Google OAuth do cliente** | Botão existe em `ClienteAuth` e responde "Em breve" — não finge autenticar | Mesmo padrão de adapter. É a única funcionalidade desenhada no protótipo que não ficou funcional. |
| **Provedor real do Assistente IA** | `MockAiAssistantDriver` responde por regras; histórico persiste em `AiChatMessage` | `AI_ASSISTANT_ADAPTER`, mesma factory de `adapters.module.ts`. |
| **Upload de imagem** | ✅ **Completo desde o agente 30.** Feito no agente 25 para Minha Página, no 27 para a foto de perfil (`POST /me/avatar`), no 29 para a foto do barbeiro (`POST /barbers/:id/avatar`) e no **30 para o passo 3 do onboarding**, que era o último campo de URL do produto — hoje reusa `POST /my-page/images/:slot`. `StorageAdapter` + `LocalStorageDriver`, multipart, JPG/PNG/WebP até 5 MB. | Trocar o driver local por S3/R2 é um `case` em `adapters.module.ts` + `STORAGE_DRIVER`; o `local` não serve para mais de uma réplica de API. Com o domínio das imagens conhecido, o `next/image` entra e o `<img>` cru sai. Falta ainda redimensionar/otimizar o que o dono envia. |
| **Multi-unidade de fato** | O modelo `Unit` existe, tem CRUD e isolamento testado; o motor de grade ainda ignora `unitId` | Filtro por unidade em `AvailabilityService` — o campo já existe em `Appointment` e `Barber`. |

### Números finais

| Suíte | Casos |
|---|---|
| Unitários (`apps/api`) | 97 |
| Unitários (`apps/web`) | **25** |
| E2E | **364** |
| Isolamento de tenant (gate) | **183** |
| **Total** | **669** |

> Contagem do agente 30 (2026-09-04), medida rodando as QUATRO suítes, uma de
> cada vez, com o container `web` parado — pelo mesmo motivo de RAM registrado
> abaixo. O agente 30 somou **+15 e2e** (`onboarding.e2e-spec.ts`, que não
> existia: o wizard não tinha cobertura de ponta a ponta nenhuma), **+3
> isolamento** (as duas rotas de referência do passo 2 e o endereço com código
> IBGE) e **+11 de frontend** (`dashboard-guard.spec.ts`, sobre
> `resolveGuardAction`).

> Contagem do agente 29 (2026-09-03), medida rodando as QUATRO suítes, uma de
> cada vez. Rodar as três da API no mesmo comando estoura a RAM da máquina de
> desenvolvimento (7,5 GB) e o kernel mata o processo — o sintoma é um exit
> 137 sem saída de teste nenhuma. Com o container `web` parado, cada uma passa
> folgada.
>
> O agente 29 somou **+2 unit** (slugs reservados × rotas reais), **+16 e2e**
> (unidade no agendamento, foto do barbeiro, kill-switch de impersonação,
> cancelamento de exclusão, teto de plano reprocessado e as seis das
> automações de calendário) e **+3 isolamento** (as duas rotas novas do super
> admin, e os dois casos do `work-schedule` reescritos para o caminho que
> sobrou — foram 2 removidos e 3 acrescentados). A suíte de frontend é nova:
> 14 casos, ver a Camada 1.

> Contagem do agente 28 (2026-08-26), medida rodando as três suítes. O agente
> 28 somou 12 e2e (`assistant.e2e-spec.ts`) e 4 de isolamento (o cartão da
> resposta carrega nome de cliente e id de agendamento — é superfície de
> vazamento nova, não coberta pelo caso único que existia).

> Contagem do agente 27 (2026-08-25), medida rodando as três suítes. A tabela
> tinha ficado parada na fase 13 por várias sessões e foi retomada pelo agente
> 21; as auditorias 22–26 somaram sem atualizar aqui.

> A fase 13 somou 8 e2e (`dashboard-overview.e2e-spec.ts`) e 5 de isolamento
> (`dashboard-overview.isolation-spec.ts`). O isolamento do dashboard testa os
> NÚMEROS, não só o status: é o endpoint que mais agrega dado de tenant numa
> chamada só, e um `tenantId` faltando numa das doze consultas entraria na soma
> sem deixar nenhum id na tela para denunciar.

`pnpm turbo run lint typecheck` 11/11 · `pnpm turbo run build` 3/3.

> O build exige `NODE_ENV=production`, e desde o agente 29 **o `Makefile` e o
> CI o forçam** nos alvos de build — antes dependia de quem rodasse lembrar,
> e rodar de dentro do container de dev quebrava 35 páginas com um erro que
> parece de código e é de ambiente.

> O total de e2e estava anotado como 129 desde a fase 09: os 4 casos de
> `public-plans.e2e-spec.ts` (fase 10) nunca entraram na conta. São os mesmos
> 133 antes e depois da fase 11 — `apps/api` está byte-a-byte idêntico ao que
> era, conferido por `git diff main -- apps/api`.
>
> ~~A varredura responsiva NÃO está mais "sem pendências"~~ — **voltou a estar,
> no agente 29**: `make responsive --delay=6000` fecha sem reprovação em
> nenhuma das 35 rotas, nos 5 tamanhos, com dado carregado (que é a condição
> em que a fase 09 não mediu e por isso passou em falso).
>
> **Desde o agente 30 ela cobre também os 6 passos do wizard** (superfície
> `wizard`, por `?passo=N`, com a fixture `barbearia-configuracao`). Foi ao
> medi-los pela primeira vez que apareceram 7 pendências — a mesma lição do #9
> da fase 13: verde de varredura não prova que a tela CERTA foi medida.

## Como retomar

Abrir sessão nova do Claude Code → colar o conteúdo do próximo
`agentes/agente-NN-*.md` pendente (na ordem da tabela acima). Se uma sessão
estourar o contexto no meio de uma fase, abrir sessão nova, colar o MESMO
agente e acrescentar "continue de onde o CONTEXT.md indica".

Para subir o ambiente: `make env && make install && make up && make seed`
(ou `make reset` para zerar tudo). Detalhe no `README.md` da raiz.

**Desde a fase 11 são só 2 processos**: `api` (:3333) e `web` (:3000). Com a
restrição de RAM da máquina (7.5 GB), `docker compose up -d db redis api` +
`docker compose up -d web` já é a stack inteira — não existe mais a escolha de
"qual das 4 apps subir".

### Como conferir o agente 30 (configuração obrigatória) rodando

`make reset && make seed`, depois login
`dono@barbeariaconfiguracao.com.br` / `BarberVP@2026` — a barbearia que o seed
deixa no passo 0.

1. **Boas-vindas** — "Bem-vindo ao BarberVP, Joana" (o cadastro tem
   `joana ribeiro`, minúsculo). Só um botão: "Começar configuração →". **Não
   existe** "Pular e explorar o painel", e o subtítulo diz "Se fechar o
   navegador, você retoma de onde parou".
2. **Nenhum passo tem "×"** no topo direito. Cabeçalho: logo, "Configurar
   barbearia · N de 6" e a barra de progresso.
3. **Passo 2** — digite `14015000` e clique "Buscar CEP": o selo "Endereço
   encontrado" aparece e os combos abrem já em **São Paulo** e **Ribeirão
   Preto** (casados pelo código IBGE, não pelo nome). Abra o combo de cidade: a
   lista abre posicionada no item escolhido; digite `ribeirao` sem acento e ele
   aparece. Troque a UF e veja a cidade limpar.
4. **Passo 3** — arraste (ou clique para escolher) um JPG/PNG/WebP em cada
   quadro: a prévia aparece nos dois e o card "Como sua barbearia vai aparecer"
   se preenche. O prefixo do link é `http://localhost:3000/`, **sem
   `/agendar/`**. Tente o slug `cadastro`: "Este nome é reservado pelo sistema".
5. **Fim** — o link mostrado abre a página da barbearia (200). O mesmo link com
   `/agendar/` no meio dá 404 — era o que o produto entregava antes.
6. **A regra, nos dois lados.** Durante o wizard, digite `/app/agenda` na barra:
   volta ao wizard. Depois de concluir, digite `/app/configurar`: vai para
   `/app` — o wizard não reabre. E, com um passo obrigatório faltando:

       curl -X POST localhost:3333/api/v1/onboarding/complete -H "authorization: Bearer $TOKEN"
       # 409 {"code":"ONBOARDING_INCOMPLETE","details":{"missingSteps":[2,4]}}

7. **Barbeiro num tenant pendente** — entra e vê "A barbearia ainda está sendo
   configurada", com "Sair". Não vê o wizard (não poderia completá-lo) nem o
   painel (a regra proíbe).

### Como conferir o agente 18 (Financeiro) rodando

Login `dono@barbeariacentral.com.br` / `BarberVP@2026` →
`http://localhost:3000/app/financeiro`.

1. **Caixa** — o `make seed` deixa um caixa ABERTO: 4 KPIs (saldo inicial ·
   entradas em verde · saídas em vermelho · saldo atual em dourado), os três
   botões e o extrato do dia com Hora/Descrição/Categoria/Forma/Valor, valores
   com sinal e cor. "+ Saída/Sangria" lança de verdade; tente uma sangria maior
   que o dinheiro em caixa e veja o 400 com o valor disponível na mensagem.
2. **Fechar caixa** — o modal traz o resumo POR FORMA (só entradas) e
   "Esperado na gaveta"; digitar um valor acende a faixa verde ("Caixa
   confere") / âmbar ("Sobra") / vermelha ("Quebra") na hora.
3. **Contas a pagar** — 3 KPIs somados no servidor (confira paginando: os
   números não mudam). "Serviços contábeis" sai como **Vencido** sem que a
   coluna `status` no banco diga isso. No modal, ligue "Parcelado?" com 3
   parcelas e veja 3 linhas nascerem com a data andando de mês.
4. **Vales** — faixa dourada e o status dizendo em qual competência o desconto
   entra; cruze com a aba Comissões.
5. **Contas bancárias / Fluxo de caixa** — troque o plano do tenant para
   `essencial` (`PATCH /admin/tenants/:id/plan`) e confirme que estas DUAS
   continuam abrindo, enquanto as três travadas mostram o paywall com bullets
   e os dois botões. É o desvio central corrigido nesta fase.
6. **Papel BARBER** (`carlos@barbeariacentral.com.br`) — "Financeiro" não
   aparece no nav, e todas as rotas `/finance/*` respondem 403.
7. **Tenant vazio** — cadastre uma barbearia nova: as 6 sub-abas renderizam
   com vazio próprio por bloco, sem quebrar.

### Como conferir a fase 13 rodando

Login `dono@barbeariacentral.com.br` / `BarberVP@2026` → `http://localhost:3000/app`.

1. **Topbar completa**, na ordem do protótipo: seletor de unidade, selo do
   plano ("Avançado"), busca com o selo `Ctrl+K`, "Novo agendamento" dourado,
   sino com badge vermelho e avatar com chevron.
2. **`Ctrl+K`** foca a busca; digitar "Andr" traz cliente e agendamentos reais,
   agrupados. Clicar num resultado navega para a tela certa.
3. **Clique em qualquer lugar fora** fecha o menu aberto; `Esc` também.
4. **Menu do avatar**: Meu perfil · Configurações · divisor · Sair (vermelho).
5. **6 cards de KPI**, com "Ocupação da agenda" em rosca horizontal e a
   sparkline de "Faltas no mês" em verde.
6. **Toggle Dia/Semana/Mês** troca a granularidade do gráfico E o título; a
   linha tracejada da meta acompanha o balde. Passar o mouse sobre o gráfico
   abre o tooltip por ponto.
7. **Menu ⋯ dos próximos atendimentos**: Confirmar muda a pílula de status na
   hora; Abrir comanda cria a comanda e navega para ela.
8. **Faixa de alertas** no rodapé — só os cards cuja condição é verdadeira.

**Tenant vazio** (a página inteira em estado vazio, sem erro no console):
entrar como `admin@barbervp.com.br`, ir em `/admin/tenants`, impersonar um
tenant sem comandas fechadas. Cada bloco traz a própria mensagem ("Sem
faturamento registrado ainda", "Nenhum atendimento esta semana"), e o rodapé da
sidebar mostra os dias de teste restantes.

**Papel BARBER** (`carlos@barbeariacentral.com.br` / `BarberVP@2026`): nav
reduzido, "Ranking de barbeiros" vira "Seus atendimentos", os números são só
dele e a faixa de alertas some inteira.

**Responsividade**: `node scripts/responsive-sweep.mjs --app=dashboard
--delay=6000`. Se der 429, `docker exec barbervp-redis redis-cli FLUSHDB`
antes — a varredura abre dezenas de telas em segundos e estoura o rate limit,
que desde a fase 09 conta no Redis.

### Como conferir a fase 11 rodando

A stack toda cabe agora: `docker compose up -d db redis api web` (2 processos
Node em vez de 5).

1. **As quatro superfícies, uma porta** — `http://localhost:3000`:

   | URL | O que abre |
   |---|---|
   | `/` | landing de vendas, paleta clara, preços vindos da API |
   | `/agendar` | raiz explicativa do booking |
   | `/barbearia-central` | página pública da barbearia |
   | `/entrar` · `/cadastro` · `/recuperar-senha` | auth do estabelecimento |
   | `/app` | painel (redireciona para `/app/configurar` se o onboarding
     estiver pendente — ver dívidas) |
   | `/admin` | super admin, que redireciona para `/admin/tenants` |

2. **Login pela tela**, `dono@barbeariacentral.com.br` / `BarberVP@2026` → cai
   em `/app`. Com `admin@barbervp.com.br` → cai em `/admin/tenants`. Com
   `carlos@barbeariacentral.com.br` (BARBER) → `/app` com nav restrito
   (Dashboard · Agenda · Comandas · Comissões · Fidelidade) e `/app/agenda`
   mostrando SÓ a coluna do Carlos. Clicar pelo nav leva a `/app/agenda`,
   `/app/comandas`, `/app/financeiro`… — as três coisas foram conferidas no
   navegador nesta sessão.

   **Não confunda com bug de rota**: abrir `/app` ou `/admin` SEM sessão fica no
   skeleton "Carregando sua sessão…" para sempre, em vez de ir para `/entrar`.
   É o deadlock do interceptor de refresh descrito nas dívidas desta fase —
   anterior ao refactor, em `packages/ui`. Faça login primeiro.

3. **Roteamento por host** (o que produção faz). Sobe com as variáveis e testa
   sem DNS nenhum:

   ```bash
   HOST_SITE=barbervp.com HOST_BOOKING=agendar.barbervp.com \
   HOST_APP=app.barbervp.com HOST_ADMIN=admin.barbervp.com \
     pnpm --filter @barbervp/web start

   curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: admin.barbervp.com' \
     http://localhost:3000/admin/tenants        # 200
   curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: app.barbervp.com' \
     http://localhost:3000/admin/tenants        # 404 — a guarda do super admin
   curl -s -H 'Host: agendar.barbervp.com' http://localhost:3000/ \
     | grep -o '<title>[^<]*'                   # "Agendamento online"
   curl -s -H 'Host: app.barbervp.com' http://localhost:3000/agenda \
     | grep -o '<title>[^<]*'                   # painel — URL antiga ainda vale
   curl -s -H 'Host: admin.barbervp.com' http://localhost:3000/robots.txt
                                                # Disallow: /
   ```

4. **Cabeçalhos por superfície** (o que os 4 middlewares antigos faziam):
   `/entrar` → `cache-control: no-store` + `referrer-policy: no-referrer`;
   `/app/*` e `/admin/*` → `x-robots-tag: noindex, nofollow, noarchive` +
   `x-frame-options: DENY`; landing e booking → sem `noindex`.

5. **Build isolado — é o contrato do deploy**, e o CI roda os dois:

   ```bash
   make build-web   # pnpm --filter @barbervp/web... build   (Vercel)
   make build-api   # pnpm --filter @barbervp/api... build   (Railway)
   ```

6. **Testes**: `make test` (81 unit), `make test-e2e` (133),
   `make test-isolation` (106). Todos verdes nesta sessão, iguais à baseline.

7. **Varredura responsiva**: `node scripts/responsive-sweep.mjs --app=site` (e
   `booking`, `dashboard`, `admin`). Rodar UMA superfície por vez — a varredura
   completa esgotou recursos do Chrome nesta máquina no meio do `dashboard`.
   Site (20/20) e booking (10/10) passam; `dashboard` e `admin` reprovam nos
   alvos de toque das abas — dívida pré-existente, ver fase 11.

8. **`make seed` de novo ao terminar** se tiver mexido no `onboardingDoneAt`
   para conferir o painel.

> **Atenção às seções abaixo (fases 03 a 08).** Elas foram escritas quando o
> frontend eram 4 apps em 4 portas. As URLs `localhost:3000/3001/3002/3003`
> viraram uma só, `localhost:3000`, com prefixo — traduza assim ao seguir
> qualquer roteiro antigo:
>
> | Antes | Agora |
> |---|---|
> | `:3000/` · `:3000/entrar` · `:3000/cadastro` | `:3000/` · `:3000/entrar` · `:3000/cadastro` |
> | `:3001/{slug}` | `:3000/{slug}` |
> | `:3001/` | `:3000/agendar` |
> | `:3002/` · `:3002/agenda` · `:3002/configurar` | `:3000/app` · `:3000/app/agenda` · `:3000/app/configurar` |
> | `:3003/` · `:3003/tenants` | `:3000/admin` · `:3000/admin/tenants` |
>
> Tudo o mais nesses roteiros (contas do seed, `psql`, endpoints da API) segue
> valendo — `apps/api` não mudou na fase 11.

### Como conferir a fase 03 rodando

Com a stack de pé (`make up && make seed`):

1. **Cadastro → onboarding → dashboard**: `http://localhost:3000/cadastro` →
   preencher → cai em `http://localhost:3002/configurar` → 6 passos → conclusão
   com o link copiável.
2. **Login do painel**: `http://localhost:3000/entrar` com
   `dono@barbeariacentral.com.br` / `BarberVP@2026`.
3. **Cliente**: `http://localhost:3001` → "Criar conta" abre o `ClienteAuth`.
   O código OTP sai no `NotificationOutbox` — é de lá que o e2e o lê também:
   `docker exec barbervp-db psql -U barbervp -d barbervp -tA -c 'SELECT body
   FROM "NotificationOutbox" ORDER BY "createdAt" DESC LIMIT 1'`
4. **Testes**: `make test` (34 unit + 28 e2e) e `make test-isolation` (11).

### Como conferir a fase 04 rodando

Com a stack de pé (`make up && make seed`):

1. **Página pública**: `http://localhost:3001/barbearia-central`. Capa, status
   aberto/fechado calculado do horário real, serviços (5 + "ver todos"), planos,
   equipe, avaliações e horário com o dia de hoje em dourado.
2. **Agendar**: "Agendar horário" → marque **Corte Masculino + Barba** e veja o
   rodapé virar "Corte + Barba · 1h10 · R$ 70" (e não R$ 80) — é o combo sendo
   aplicado pelo servidor. Siga até o código da reserva.
3. **Compatibilidade**: marque só **Pigmentação** e vá ao passo 2 — três
   barbeiros ficam apagados com "não realiza Pigmentação"; só o Diego atende.
4. **Confirmação e lembretes** no outbox:
   `docker exec barbervp-db psql -U barbervp -d barbervp -c 'SELECT
   "templateKey", status, "scheduledFor" FROM "NotificationOutbox" ORDER BY
   "createdAt" DESC LIMIT 3'` — uma `SENT` e duas `PENDING` com data futura.
5. **Cancelar**: `POST /api/v1/public/barbearia-central/appointments/<código>/
   cancel` com `{"phone":"<o telefone usado>"}`. O horário volta à grade.
6. **OTP condicional**: agende como visitante usando o telefone de um cliente do
   seed (`(11) 9 8765-0001`) — a resposta vira `otp-required`, e o código sai no
   `NotificationOutbox`.
7. **Isolamento**: `http://localhost:3001/barbearia-isolamento` mostra a outra
   barbearia, vazia. Um código de reserva de uma nunca abre pela outra.
8. **Testes**: `make test` (65 unit + 60 e2e) e `make test-isolation` (21).

### Como conferir a fase 05 rodando

Com a stack de pé (`make up && make seed`):

1. **Login pronto para teste**: `http://localhost:3001/barbearia-central` →
   avatar/"Entrar" → telefone `(11) 9 8765-0001` (ou o e-mail
   `andre.martins@exemplo.com`) / senha `BarberVP@2026`. É o único cliente do
   seed com senha — já nasce assinante do "Corte + Barba Quinzenal", com 1
   corte usado de 2.
2. **`MinhaConta`**: clique no nome/avatar (ou "Meus agendamentos" no menu) →
   sheet com 3 abas. **Agendamentos**: Próximos com remarcar/cancelar,
   Histórico com "Agendar de novo" e estrelas nos atendimentos `DONE`.
   **Assinatura**: saldo `1/2` do corte, `0/2` da barba, histórico de
   cobrança, "Pausar"/"Cancelar assinatura". **Meus dados**: editar nome/
   e-mail, trocar telefone (OTP sai no `NotificationOutbox`), trocar senha,
   toggles de notificação, "Exportar meus dados" (baixa um `.json`), "Excluir
   minha conta" (checkbox de confirmação).
3. **Assinar do zero**: use outro cliente do seed sem assinatura (ex.: `(11)
   9 8765-0002` não tem senha — cadastre um novo cliente por
   "Criar conta"). Na página pública, seção "Planos para membros" → "Assinar"
   → detalhe → pagamento (cartão OU Pix, ambos mock) → sucesso → volte ao
   wizard e marque o serviço coberto: o rodapé mostra "Incluído na
   assinatura" e o preço vira R$ 0.
4. **Débito atômico sob concorrência** — o caso que o critério de aceite
   pede — já está automatizado (item 8 abaixo); para ver manualmente, assine
   um plano com quota 2 e dispare 3 `POST .../appointments` para horários
   diferentes do mesmo serviço quase ao mesmo tempo (`curl` em paralelo):
   no máximo 2 saem com `totalPriceCents: 0`.
5. **Gate por plano**: `PATCH` o tenant demo para o plano `essencial` (ou
   `profissional`) via `psql`/Prisma Studio e recarregue — a aba "Assinatura"
   some da `MinhaConta` e `GET .../account/subscription/plans` passa a
   responder 403 `FEATURE_NOT_IN_PLAN`. Lembre de voltar para `avancado`
   depois (é o plano do seed).
6. **Isolamento**: um cliente com assinatura na `barbearia-central` não a vê
   ao abrir `MinhaConta` pela `barbearia-isolamento` (aba "Assinatura" nem
   aparece, porque o gate também é por tenant).
7. **Testes**: `make test` (80 unit + 78 e2e) e `make test-isolation` (25).

### Como conferir a fase 06 rodando

Com a stack de pé (`make up && make seed`):

1. **Dono/gerente**: `http://localhost:3002` → login
   `dono@barbeariacentral.com.br` / `BarberVP@2026` (ou
   `gerente@barbeariacentral.com.br`, mesma senha). Nav completo: Dashboard,
   Agenda, Clientes, Serviços & Produtos e Equipe são rotas reais; o resto
   ainda é placeholder "em construção" (fase 07/08).
2. **`DashboardFuncionario`**: login `carlos@barbeariacentral.com.br` /
   `BarberVP@2026` — MESMA URL (`http://localhost:3002`), nav restrito
   (some Clientes/Serviços & Produtos/Equipe/Financeiro/Configurações) e
   `/agenda` mostra só a coluna do Carlos, sem seletor de barbeiro.
3. **Agenda**: `/agenda` como dono → "Novo agendamento" numa coluna
   qualquer → escolha serviço(s), cliente cadastrado OU walk-in, horário →
   confirma. Aparece na hora na coluna certa. Kebab do card → "Mover
   horário" (novo horário no mesmo dia) ou "Cancelar" (com confirmação).
   Redimensione a janela abaixo de 1024px: a sidebar vira drawer e a aba
   "Semana" some (só dia único no mobile, como pede o critério de aceite).
4. **Clientes**: `/clientes` → busca por nome/telefone, clique numa linha →
   drawer com barbeiro favorito, notas e "Bloquear agendamento" (o cliente
   bloqueado leva `ACCOUNT_DISABLED` tentando agendar pelo booking público —
   mesma regra da fase 04, `bloquearFaltasQtd`/`blocked`).
5. **Serviços & Produtos**: `/servicos-produtos` → aba Produtos → edite o
   estoque de um item abaixo do `estoqueMin` → volta pra lista com selo
   "Estoque baixo"; aba Serviços → editar quem atende reflete no booking
   público (`http://localhost:3001/barbearia-central`) na mesma hora.
6. **Convite de funcionário**: `/equipe` → "Convidar barbeiro" → preenche
   e-mail/serviços/dias → o link sai no log do `MockMailDriver`
   (`docker compose logs api | grep "e-mail simulado"`) e também fica em
   `MailOutbox` (Prisma Studio). Abra o link
   (`http://localhost:3002/aceitar-convite?token=...`) numa aba anônima:
   e-mail travado, define senha, entra direto logado como `BARBER` novo.
7. **RBAC cruzado (403 real, não só nav escondido)**: logado como Carlos
   (`BARBER`), tente `GET http://localhost:3333/api/v1/clients` com o
   Bearer do Carlos — 403 `FORBIDDEN`, mesmo com a URL digitada direto.
8. **Testes**: `make test` (80 unit + 78 e2e, inalterados) e
   `make test-isolation` (36 — os 25 de antes + os 11 desta fase, incluindo
   os dois casos de papel do critério de aceite).

### Como conferir a fase 07 rodando

**Cuidado com RAM**: a stack completa (`make up`, 4 apps Next.js + api + db +
redis) já derrubou o VSCode numa máquina com 7.5GB de RAM. Prefira
`docker compose up -d db redis api` (só o backend) para os passos 1–2 abaixo,
e suba `dashboard` separadamente só se for olhar a UI (`docker compose up -d
dashboard`, sozinho — não precisa de `site`/`booking`/`admin` para ver o
painel). `docker compose stop` entre uma coisa e outra.

1. **Login + ciclo completo** (só precisa de `db`+`redis`+`api`):
   ```bash
   TOKEN=$(curl -s -X POST http://localhost:3333/api/v1/auth/login \
     -H 'Content-Type: application/json' \
     -d '{"email":"dono@barbeariacentral.com.br","password":"BarberVP@2026"}' \
     | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).accessToken))")
   curl -s http://localhost:3333/api/v1/orders/catalog -H "Authorization: Bearer $TOKEN"
   ```
   Abrir comanda (`POST /orders`), adicionar item (`POST /orders/:id/items`),
   fechar com pagamento que NÃO bate (`400`) e depois com o valor certo
   (`201`, `status: CLOSED`) — confirma no Prisma Studio que `CommissionEntry`
   nasceu, `Product.stock` baixou e `LoyaltyPoints` creditou.
2. **Feature flags por plano** (o tenant demo é Avançado; baixar o tier na
   marra pra conferir o 403):
   ```bash
   docker exec barbervp-db psql -U barbervp -d barbervp -c \
     "UPDATE \"Tenant\" SET \"planId\"=(SELECT id FROM \"SaasPlan\" WHERE code='essencial') WHERE slug='barbearia-central';"
   curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3333/api/v1/finance/payables -H "Authorization: Bearer $TOKEN"
   # 403 — depois, restaurar:
   docker exec barbervp-db psql -U barbervp -d barbervp -c \
     "UPDATE \"Tenant\" SET \"planId\"=(SELECT id FROM \"SaasPlan\" WHERE code='avancado') WHERE slug='barbearia-central';"
   ```
3. **Swagger**: `http://localhost:3333/api/docs` — todos os endpoints desta
   fase já documentados (`@ApiOperation`), inclusive os gates de feature.
4. **Testes**: `make test` (80 unit — 1 é probabilístico, ver dívidas),
   `pnpm --filter @barbervp/api test:e2e` (81), `make test-isolation` (52).
   Todos verdes na última rodada desta sessão.
5. **`make seed` de novo ao terminar** — os testes/smoke rodam contra o
   banco de dev; reseedar deixa os dados como o próximo agente espera
   encontrar.
6. **Front-end** (suba só `dashboard`, sem as outras 3 apps): login em
   `http://localhost:3002` com `dono@barbeariacentral.com.br` /
   `BarberVP@2026` — as 9 rotas desta fase estão no nav (Comandas,
   Financeiro, Comissões, Fidelidade, WhatsApp, Assistente IA, Relatórios,
   Configurações, Minha Página). No POS (`/comandas`), abra uma comanda e
   redimensione a janela abaixo de 1024px: a coluna da comanda vira uma
   barra fixa embaixo com o subtotal, que abre como bottom-sheet.
7. **`docker compose stop` ao terminar** — não deixar a stack de pé sem
   necessidade.

### Como conferir a fase 08 rodando

**Mesmo cuidado com RAM da fase 07**: suba só o que for usar
(`docker compose up -d db redis api` pro backend; `admin`/`dashboard` juntos
só se for testar a impersonação de ponta a ponta) e `docker compose stop`
entre uma coisa e outra.

1. **Login super admin** (só precisa de `db`+`redis`+`api`):
   ```bash
   TOKEN=$(curl -s -X POST http://localhost:3333/api/v1/auth/login \
     -H 'Content-Type: application/json' \
     -d '{"email":"admin@barbervp.com.br","password":"BarberVP@2026"}' \
     | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).accessToken))")
   curl -s http://localhost:3333/api/v1/admin/tenants -H "Authorization: Bearer $TOKEN"
   curl -s http://localhost:3333/api/v1/admin/metrics -H "Authorization: Bearer $TOKEN"
   ```
2. **Plano muda gate na hora** (sem novo login): troque o plano do tenant
   demo pra `essencial` via `PATCH /admin/tenants/:id/plan` — `GET
   /commissions/rules` do dono vira 403 `FEATURE_NOT_IN_PLAN` imediatamente;
   volte pra `avancado` e o 403 some sem o dono precisar relogar.
3. **Suspender bloqueia login**: `PATCH /admin/tenants/:id/suspend` — login
   do dono (`POST /auth/login`) passa a responder 403 `TENANT_SUSPENDED`.
   `PATCH .../reactivate` devolve o acesso. **Restaure o tenant demo pro
   status `ACTIVE` e plano `avancado` ao terminar** (ou rode `make seed`).
4. **Impersonar**: `POST /admin/tenants/:id/impersonate` devolve um
   `accessToken` que resolve em `GET /auth/me` como o OWNER de verdade (não
   como o super admin) — confira `AuditLog` (`ADMIN_TENANT_IMPERSONATED`)
   gravado com `targetOwnerUserId`.
5. **Front-end completo** (suba `admin` + `dashboard` juntos):
   `http://localhost:3003` (login super admin) → `/tenants` → clique num
   tenant → drawer com suspender/reativar/trocar plano/"Impersonar dono" —
   o botão redireciona pro `dashboard` já logado como o OWNER, com a barra
   de aviso de impersonação fixa no topo e "Sair da impersonação" voltando
   pro admin. `/planos` (criar/editar plano, checkbox de feature) e
   `/billing` ("Rodar ciclo de cobrança" → aprovar/recusar fatura pendente)
   também navegáveis.
6. **Testes**: `make test` (80 unit), `pnpm --filter @barbervp/api test:e2e`
   (91), `make test-isolation` (52). Todos verdes na última rodada desta
   sessão.
7. **`make seed` de novo ao terminar** — a verificação ao vivo desta fase
   mexe em status/plano de tenant real; reseedar garante que o próximo
   agente encontra `Barbearia Central` como `ACTIVE`/`avancado`.
8. **`docker compose stop` ao terminar** — não deixar a stack de pé sem
   necessidade.
