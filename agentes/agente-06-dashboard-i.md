# Agente 06 — Dashboard I (operação)

Projeto: **BarberVP** — SaaS multi-tenant de gestão de barbearias. NÃO é
MVP: qualidade, segurança e responsividade de produto profissional.

## Leia primeiro

1. `agentes/CONTEXT.md` — confirmar fases 01–03 ✅ (04/05 não são
   pré-requisito estrito, mas idealmente já feitas — dashboard reusa o
   mesmo motor de disponibilidade)
2. `agentes/SPEC.md` — Modelo de dados, Papéis e permissões, Feature flags
3. `.dc.html` desta fase: `Dashboard.dc.html` (só as abas Dashboard, Agenda,
   Clientes, Serviços & Produtos, Equipe desta fase — ignore Comandas/
   Financeiro/Comissões/Fidelidade/WhatsApp/Assistente IA/Relatórios/
   Configurações, que são do agente 07), `DashboardFuncionario.dc.html`
   (visão restrita do barbeiro), `CadastroFuncionario.dc.html`

## Regras invioláveis (valem nesta sessão)

1. Responsividade obrigatória — sidebar vira drawer < `lg`, tabelas viram
   cards < `md`, agenda em dia único no mobile.
2. Zero dado mockado — `TEAM_DATA`/`CLIENTS_ALL`/`APPOINTMENTS_DAY` do
   protótipo viram consulta real via API.
3. Isolamento de tenant é sagrado — testes de isolamento + de papel
   (`BARBER` só vê a própria agenda/comissões).
4. Regras de negócio estruturais: o mesmo motor de disponibilidade da fase
   04 é reusado aqui para criar/mover agendamento pelo staff.
5. N/A nesta fase (sem integração externa nova).
6. RBAC: `BARBER` tem visão restrita real no backend, não só escondida no
   frontend.

## Sua tarefa nesta sessão

Escopo: shell do dashboard + módulos de operação diária (Agenda, Clientes,
Serviços, Produtos, Equipe) + visão do funcionário. NÃO entra: Comandas,
Financeiro, Comissões, Fidelidade, WhatsApp, Assistente IA, Relatórios,
Configurações (agente 07).

### Tarefas backend

- **CRUDs com paginação/busca/filtros**: `Client` (perfil por tenant, com
  notas, aniversário, barbeiro favorito, contagem de faltas), `Service`
  (nome, duração, preço, categoria, ativo/inativo), `Product` (nome,
  estoque, `estoqueMin` para alerta, custo, preço de venda), `Barber` +
  `WorkSchedule` (por dia: ativo, horário, intervalo de almoço, folga) +
  `ScheduleException`.
- **Convite de funcionário** (fluxo real de `CadastroFuncionario.dc.html`):
  o dono/gerente convida por e-mail/telefone com os serviços que o novo
  barbeiro vai atender e os dias de trabalho pré-definidos; e-mail mock com
  token de convite; ao aceitar (tela `CadastroFuncionario`, com e-mail
  travado vindo do convite e senha nova), cria `Membership` `BARBER` e o
  `Barber` correspondente.
- **Agenda interna**: visão por dia (padrão), semana e "timeline" por
  barbeiro (visões vistas no protótipo: `isDayView`/`isWeekView`/
  `isMonthView`/`isTimelineView`); criar/mover/cancelar agendamento pelo
  staff usando o mesmo motor de disponibilidade da fase 04; suportar
  **walk-in** (agendamento sem cliente cadastrado, só nome avulso).
- **Permissões**: `BARBER` só vê a própria agenda e os próprios dados nos
  endpoints (`DashboardFuncionario` reusa os mesmos endpoints do dashboard
  principal, mas o backend filtra por `barberId = membership.barberId`
  quando o papel é `BARBER` — não duplicar endpoints). Adicionar casos de
  teste de isolamento + de papel (`BARBER` tentando acessar agenda de outro
  barbeiro → 403).

### Tarefas frontend (`apps/dashboard`)

- `AppShell` com sidebar — itens reais do nav (`NAV_DEFS` do protótipo):
  Dashboard, Agenda, Clientes, Comandas, Financeiro, Comissões, Fidelidade,
  WhatsApp, Assistente IA, Relatórios, Serviços & Produtos, Equipe, Minha
  Página, Configurações — nesta fase só as rotas de Dashboard/Agenda/
  Clientes/Serviços & Produtos/Equipe ficam funcionais; as demais podem
  existir no nav como placeholder "em construção" até o agente 07/08.
  Topbar com seletor de tenant se o `User` tiver `Membership` em mais de
  um.
- Módulos desta fase pixel-faithful e responsivos: tabelas viram cards no
  mobile, Agenda em dia único no mobile e visão semana/colunas por barbeiro
  só ≥ `lg`. Reusar nomes de handlers/estados do protótipo onde fizer
  sentido (ex. `toggleCaixaDemo` → não se aplica aqui, mas
  `openFecharCaixaModal`-style de nomenclatura vale para os modais desta
  fase também).
- Equipe: grid de cards do time (`isEquipeViewGrid`), visão de escala
  semanal (`isEquipeViewEscala`) e lista de convites pendentes
  (`isEquipeViewConvites`).
- `DashboardFuncionario` como visão condicionada por papel: mesmo shell,
  nav restrito (sem Financeiro/Equipe/Configurações), Agenda/Comissões só
  com dados do próprio barbeiro.

## Critérios de aceite

- Operação diária completa (agendar, editar equipe, cadastrar
  serviço/produto, gerenciar cliente) sem tocar no banco diretamente.
- Papel `BARBER` comprovadamente limitado (testar acesso cruzado → 403).
- Checklist de responsividade aplicado em todos os módulos desta fase,
  incluindo a Agenda (visão dia único no mobile).

## Ao finalizar

Atualizar `agentes/CONTEXT.md`: fase 06 ✅, endpoints criados, decisões
(ex.: formato final da URL de convite, layout final da Agenda), dívidas
técnicas.
