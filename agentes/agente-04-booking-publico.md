# Agente 04 — Booking público

Projeto: **BarberVP** — SaaS multi-tenant de gestão de barbearias. NÃO é
MVP: qualidade, segurança e responsividade de produto profissional.

## Leia primeiro

1. `agentes/CONTEXT.md` — confirmar fases 01–03 ✅
2. `agentes/SPEC.md` — Modelo de dados (Appointment, WorkSchedule), Seed
   (serviços/barbeiros canônicos), decisão sobre guest booking sem OTP
3. `.dc.html` desta fase: `Agendamento Publico.dc.html`,
   `AgendamentoWizard.dc.html` (é a fonte de verdade de serviços, preços,
   durações e barbeiros — já usados no seed da fase 01)

## Regras invioláveis (valem nesta sessão)

1. Responsividade obrigatória — mobile-first (a maioria agenda pelo
   celular); o wizard já é um sheet mobile-first no protótipo, com versão
   desktop centrada em modal 480×720.
2. Zero dado mockado — `SERVICES`/`BARBERS`/`SLOT_PATTERNS` do protótipo
   viram consulta real ao motor de disponibilidade.
3. Isolamento de tenant é sagrado — a rota pública por slug nunca vaza dado
   de outra barbearia; testar slug A não vê dados de B.
4. Regras de negócio estruturais: anti double-booking via `EXCLUDE`
   (criada na fase 01, testada aqui com corrida real), duração do serviço
   soma corretamente no motor de slots.
5. Confirmação e lembrete de agendamento enfileirados via
   `NotificationAdapter` (mock) — não implementar WhatsApp real.
6. Segurança: rate limit no endpoint de criação de agendamento e no OTP de
   guest (calibrar conforme decisão do `SPEC.md`).

## Sua tarefa nesta sessão

Escopo: página pública da barbearia + wizard de agendamento de ponta a
ponta. NÃO entra: `MinhaConta`/`AssinaturaCliente` (agente 05) — mas o
wizard já precisa exibir "Incluído na assinatura" quando o cliente logado
tiver uma assinatura ativa cobrindo o serviço (consumir o modelo que a
fase 05 vai popular; nesta fase, implementar a leitura, mesmo que a escrita
da assinatura só exista na 05).

### Tarefas backend

- **Rota pública por slug**: dados da barbearia, serviços ativos, barbeiros
  ativos e seus serviços (`BarberService`), branding (`TenantSettings`:
  sobre, Instagram, endereço, toggles de seções visíveis, horário de
  funcionamento).
- **Motor de disponibilidade**: slots a partir de `WorkSchedule` (com
  intervalo de almoço) + `ScheduleException` (folgas) + agendamentos
  existentes + duração total dos serviços selecionados + intervalo de slot
  do tenant; timezone do tenant; nunca oferecer slot passado. Reproduzir a
  UX real do protótipo: chips de dia com indicador de "sem vagas", grade de
  horários agrupada em Manhã/Tarde/Noite, aviso "últimos N horários" quando
  ≤ 3 vagas no dia, atalho "ir para o próximo dia livre" quando o dia
  selecionado está vazio.
- **Regra de combo**: quando o cliente seleciona Corte Masculino + Barba
  juntos, o backend deve oferecer/aplicar automaticamente o serviço
  combinado "Corte + Barba" (mesma lógica de `COMBO_ID`/`PAIR_IDS` do
  protótipo) — decidir se isso é regra de catálogo (`Service.comboOf`) ou
  cálculo no momento da reserva; documentar a escolha em `CONTEXT.md`.
- **Compatibilidade barbeiro↔serviço**: um barbeiro incompatível com um
  serviço selecionado (ex. só Diego Alves atende Pigmentação) fica
  desabilitado na lista com o motivo visível ("não realiza X").
- **Criação de agendamento**: cliente autenticado OU guest. Para guest,
  seguir a decisão registrada em `SPEC.md`/`CONTEXT.md` sobre OTP (nome +
  WhatsApp mínimos; se a decisão final optou por OTP condicional,
  implementar o gatilho definido). Corrida de slot: a `EXCLUDE constraint`
  deve disparar e o endpoint responde `409` com mensagem amigável; escrever
  teste automatizado de corrida (2 requests simultâneos ao mesmo
  barbeiro/horário, só 1 vence).
- **Cancelamento/remarcação** pelo cliente, respeitando a política de
  antecedência de `TenantSettings` (o protótipo mostra dois textos
  divergentes — "3h antes" na tela de sucesso do agendamento e "2h antes"
  em `MinhaConta`; a fonte de verdade real é o campo configurável
  `TenantSettings.cancelamentoAntecedencia`, então ambas as telas devem
  ler o mesmo valor do tenant, não um texto fixo).
- Enfileirar confirmação + lembrete (24h/2h antes, conforme
  `TenantSettings`) via `NotificationAdapter` mock (BullMQ — a fila em si é
  ligada na fase 09, aqui basta o job existir e logar/persistir em
  `NotificationOutbox`).

### Tarefas frontend (`apps/booking`, mobile-first)

- Página pública `/{slug}`: capa, header com abrir/fechado, ações rápidas
  (WhatsApp/Instagram/rota), lista de serviços (mostra 5, "ver todos"),
  planos de assinatura em carrossel horizontal (se o tenant tiver — ler da
  fase 05), barbeiros em carrossel, avaliações, mapa/endereço e horário de
  funcionamento com o dia atual destacado.
- Wizard de 4 passos (Serviços → Barbeiro → Data/hora → Confirmação), um
  passo por vez, com stepper e resumo lateral fixo (o desktop mostra as 4
  colunas lado a lado num sheet 480×720; mobile é full-sheet com track
  animado). Botão de avançar fixo no rodapé com resumo de preço.
- Barbeiro "Sem preferência" como opção sempre visível no topo da lista.
- Estados: carregando (skeleton nos slots), sem horários no dia (empty
  state + atalho pro próximo dia livre), erro 409 (voltar à grade
  atualizada com toast), sucesso (tela com check animado, resumo,
  "adicionar ao calendário", código da reserva, política de cancelamento).
- SEO: metadata dinâmica por barbearia (nome, descrição, imagem de capa).

## Critérios de aceite

- Agendar de ponta a ponta em 360px de largura, sem scroll horizontal.
- Teste de corrida de slot verde (só 1 dos 2 requests simultâneos vence).
- Isolamento: slug do tenant A nunca retorna dado do tenant B.
- Compatibilidade barbeiro↔serviço respeitada (Pigmentação só com Diego
  Alves no seed).
- Checklist de responsividade da skill aplicado.

## Ao finalizar

Atualizar `agentes/CONTEXT.md`: fase 04 ✅, endpoints públicos e de
agendamento criados, decisão final sobre combo automático e sobre OTP no
guest booking, dívidas técnicas (ex.: BullMQ real fica pra fase 09).
