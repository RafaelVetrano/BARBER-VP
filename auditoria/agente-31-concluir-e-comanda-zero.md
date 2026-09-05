# Agente 31 — "Concluir" na Agenda sem comanda, e comanda de R$ 0 que fecha ou cancela

Projeto: **BarberVP** — SaaS multi-tenant de gestão para barbearias
(`apps/api` NestJS + `apps/web` Next 14, monorepo pnpm/Turborepo).

Duas abas, uma regra nova e três defeitos vistos no navegador em 2026-09-04.

**A regra nova, decidida pelo dono do produto:** concluir um atendimento e
abrir a comanda dele são ações **independentes**. Hoje o único caminho que
marca um `Appointment` como `DONE` é fechar a comanda vinculada (regra da fase
07), e o drawer da Agenda só oferece "Concluir e abrir comanda". Passa a
existir "Concluir" sozinho: marca `DONE` e pronto. A comanda continua
existindo como fluxo, aberta à parte, quando o balcão quiser cobrar.

**Os três defeitos:**

1. A comanda aberta a partir de um agendamento **nasce vazia** — "Barba +
   Corte degradê" no agendamento, "Nenhum item adicionado ainda" na comanda #1.
2. O drawer do agendamento mostra **"Total R$ 0,00"** para um combo que na
   visita anterior custou R$ 80,00.
3. Uma comanda de R$ 0 **não fecha nem cancela**. "Fechar comanda" está
   `disabled` — sem explicação, sem saída.

---

## Leia primeiro

```bash
sed -n '1,30p'      CONTEXT.md   # cabeçalho
sed -n '166,208p'   CONTEXT.md   # tabela de fases — confira se o 29 já rodou
sed -n '391,424p'   CONTEXT.md   # endpoints de /staff-agenda e /orders
sed -n '3129,3260p' CONTEXT.md   # o que o agente 17 entregou em Comandas
sed -n '5230,5276p' CONTEXT.md   # revisão da fase 07 — como o fechamento funciona
sed -n '5277,5330p' CONTEXT.md   # dívidas da fase 07 (NO_SHOW, split, concorrência)
```

Depois, `SPEC.md` → **RBAC** e **Design system**.

Código a ler antes de escrever:

```
apps/api/src/staff-agenda/       (service, controller, DTOs)
apps/api/src/pos/                (OrdersService — abrir, fechar, reabrir)
apps/api/src/reports/            (só para saber o que "atendimento concluído" conta hoje)
apps/web/components/dashboard/agenda/   (o drawer "Detalhes do agendamento")
apps/web/components/dashboard/pos/comanda-modal.tsx
packages/types/src/enums.ts      (PaymentMethod, AppointmentStatus, OrderStatus)
```

**Colisão com o agente 29.** A Camada 0 do 29 fecha o registro do agente 15 e
mexe no MESMO drawer (falta/`NO_SHOW`, cores por serviço, remarcação). Esta
fase toca **só** o botão "Concluir e abrir comanda" e o que ele dispara. Se o
29 já rodou, leia o bloco "O que o agente 15 entregou" e siga as convenções
dele. Se não rodou, não antecipe nada dele — e registre no `CONTEXT.md` que o
drawer foi tocado aqui, para o 29 saber.

---

## Regras invioláveis

1. **Fidelidade ao design system.** Sem valor solto.
2. **Todo botão tem função real** — e todo botão que não pode agir **explica
   por quê**, em texto, no lugar dele.
3. **Permissão e tenant no servidor.** `BARBER` só age no próprio atendimento
   e na própria comanda; `StaffScopeService` já resolve isso.
4. **Sem `disabled` para regra de negócio.** Dois ramos de render. O item 3 da
   lista de defeitos é exatamente uma violação disto.
5. **Reuso estrito.** `OrdersService.close` já faz o fechamento em transação
   única; `AuditLog` já tem o padrão; `PAYMENT_METHOD_LABEL` já centraliza os
   rótulos. Rota nova exige justificativa no `CONTEXT.md`.
6. **Suíte verde e acima da linha de base** registrada no `CONTEXT.md`.

---

## Escopo

### Entra

Blocos A a E abaixo.

### NÃO entra

- Qualquer outra ação do drawer da Agenda (Confirmar, Remarcar, Cancelar,
  Marcar falta) — são do 29.
- Rateio de faturamento por item entre barbeiros — decisão de produto, fica.
- Split de pagamento com método duplicado — dívida conhecida, fica.

---

## Bloco A — "Concluir" sem comanda

**Backend.** `PATCH /staff-agenda/:id/done`:

- `SCHEDULED`/`CONFIRMED` → `DONE`. Qualquer outro status → 409 com código do
  contrato (`APPOINTMENT_NOT_CONCLUDABLE`). Idempotente se já `DONE`.
- `BARBER` só no próprio agendamento (403 no de outro — mesmo caso já coberto
  para mover/cancelar).
- Grava `AuditLog` (`APPOINTMENT_DONE`, ator, sem comanda).
- Se houver uso de assinatura reservado para o atendimento, ele é consumido
  (é um atendimento que aconteceu). Leia `SubscriptionCoverageService` para
  fazer exatamente o que o fechamento da comanda faz nesse ponto — **e nada
  além**: sem lançamento financeiro, sem comissão, sem pontos. Isso vem da
  comanda, quando houver.
- Não impede abrir comanda depois: `POST /orders` com `appointmentId` de um
  agendamento `DONE` continua permitido (Bloco B).

**Frontend.** No drawer, o botão "Concluir e abrir comanda" vira **"Concluir"**
(primário, dourado). Ao lado dele, secundário, **"Abrir comanda"** — que faz o
que o antigo fazia menos a conclusão: abre a comanda vinculada, já preenchida
(Bloco B). Depois de concluído, o drawer mostra o selo `Concluído` e mantém só
"Abrir comanda" (ou "Ver comanda", se já existir uma).

**Relatórios.** Confira o que "atendimentos concluídos" conta hoje. Se a
consulta conta `Order` fechada, agora precisa contar `Appointment.status =
DONE` — um atendimento concluído sem comanda tem de aparecer como concluído e
com faturamento zero, não sumir. Não invente métrica nova; ajuste a que
existe e registre.

---

## Bloco B — Comanda nascida do agendamento vem preenchida

`POST /orders` com `appointmentId` deve criar a comanda **com os serviços do
agendamento como itens**, cada um ao preço fotografado no agendamento
(`Appointment` guarda o preço na criação — confira o campo) e com a cobertura
de assinatura já aplicada (serviço coberto entra a R$ 0, como o
`POST /orders/:id/items` já faz). Barbeiro e cliente vêm do agendamento.

O balcão continua podendo remover, trocar e acrescentar itens depois. Só o
ponto de partida muda: não pode ser vazio quando o agendamento diz o que foi
feito.

Teste: agendamento com combo → abrir comanda → itens presentes, subtotal
igual ao valor do agendamento.

---

## Bloco C — "Total R$ 0,00" no drawer

O agendamento "Barba + Corte degradê" mostra total zero enquanto a última
visita do mesmo combo registra R$ 80,00. Descubra a causa antes de corrigir:

- O agendamento foi criado sem preço (`POST /staff-agenda` ou o booking
  público não fotografa o valor)?
- O preço existe e o drawer lê o campo errado?
- É cobertura de assinatura legítima (cliente mensalista → R$ 0 é correto,
  e então o drawer precisa DIZER "coberto pela assinatura", não só "R$ 0,00")?

Corrija na origem e cubra com teste. Se for o terceiro caso, o rótulo é a
correção.

---

## Bloco D — Cancelar comanda

`POST /orders/:id/cancel`:

- Só comanda `OPEN`. `OWNER`/`MANAGER`; `BARBER` só a própria (decida e
  registre — sugestão: sim, é ele quem abriu por engano).
- `OrderStatus.CANCELED` (crie o valor se não existir — confira o enum).
- Se vinculada a um agendamento **não** `DONE`, o agendamento volta a
  `CONFIRMED` (ou fica como estava — ele não foi concluído, só a comanda
  morreu). Se o agendamento já é `DONE` (Bloco A), não toca nele.
- Nenhum lançamento financeiro, nenhuma comissão. `AuditLog`.
- Comanda cancelada some da aba "Abertas", aparece em "Todas" com o selo.

**Frontend.** Botão "Cancelar comanda" no rodapé do modal, à esquerda, com
confirmação em dois passos (o padrão dos modais destrutivos do kit). Some
depois de fechada.

---

## Bloco E — Fechar com R$ 0, com motivo

R$ 0 legítimo existe: refazer um corte que saiu ruim, cortesia, promoção. O
produto precisa registrar que aconteceu e por quê — não impedir.

**Backend.**

- `PaymentMethod.COURTESY` novo, com rótulo "Cortesia" em
  `PAYMENT_METHOD_LABEL`.
- `CloseOrderDto` aceita `courtesyReason` (obrigatório, 5–200 chars) quando
  o total é zero **ou** quando algum pagamento é `COURTESY`. Sem motivo → 400
  com código do contrato.
- Total zero exige que os pagamentos sejam `[{ method: COURTESY, amount: 0 }]`
  — nunca `[]`. A soma continua validada.
- Efeitos do fechamento continuam os mesmos (transação única de
  `OrdersService.close`): `Appointment` → `DONE`, estoque, pontos (zero),
  comissão (zero — confira que a regra de faixa não quebra com base zero).
  `AuditLog` grava o motivo.
- `COURTESY` **não** entra em nenhuma conta bancária nem no caixa como
  entrada — é R$ 0. Confira `CashMovement` e `BankAccount.acceptedMethods`.

**Frontend.**

- No modal, quando o total é R$ 0: a régua de métodos some e no lugar entra
  "Esta comanda não tem valor a cobrar" + campo **"Motivo da cortesia"** +
  "Fechar como cortesia". Dois ramos de render.
- Quando o total é > 0: "Cortesia" entra como um método a mais na régua; ao
  escolhê-lo, o campo de motivo aparece abaixo.
- **"Fechar comanda" nunca fica `disabled`.** Quando não pode fechar, o
  rodapé diz por quê no lugar do botão: "Adicione um item ou cancele a
  comanda", "Informe o motivo da cortesia", "A soma dos pagamentos não bate
  com o total".

**Relatórios.** Cortesias precisam ser visíveis: um recorte "Cortesias" (qtd
e o que teriam valido a preço de tabela) onde o resumo do período já lista
métodos de pagamento. Se o layout do protótipo não tem lugar, registre como
dívida — mas o dado tem de estar consultável pela API.

---

## Critérios de aceite

- `pnpm turbo run lint typecheck` 11/11 · `pnpm turbo run build` 3/3
  (`NODE_ENV=production`).
- Suítes verdes, acima da linha de base. Casos novos, no mínimo: `done` sem
  comanda; `done` por `BARBER` em atendimento alheio → 403; comanda nascida
  de agendamento vem com itens; `cancel` devolve o agendamento ao estado
  anterior; `close` com total zero sem motivo → 400; `close` com `COURTESY`
  não gera `CashMovement`. As três rotas novas têm caso de isolamento.
- `make responsive --delay=6000` verde em `/app/agenda` (com o drawer aberto,
  se a varredura permitir) e `/app/comandas`.
- **No navegador:** agendamento → "Concluir" → selo `Concluído`, agenda
  reflete, relatório conta o atendimento com R$ 0 → "Abrir comanda" → itens
  já dentro → remover tudo → "Fechar comanda" some e o texto explica → motivo
  → "Fechar como cortesia" → fechada, `AuditLog` com o motivo. Depois: nova
  comanda vazia → "Cancelar comanda" → some de Abertas.
- `grep -rn "disabled" apps/web/components/dashboard/pos/` não devolve
  nenhum `disabled` ligado a regra de negócio.

---

## Ao finalizar

Atualizar `CONTEXT.md`:

- **Cabeçalho** — "Atualizado por último": a regra (concluir e cobrar são
  ações separadas) primeiro, os três defeitos depois, suíte no fim.
- **Tabela de fases** — linha 31 ✅.
- **Endpoints** — `/staff-agenda` ganha `done`; `/orders` ganha `cancel` e a
  mudança de `POST /orders` com `appointmentId`; `close` com `courtesyReason`.
- **Bloco "O que o agente 31 entregou"** — por bloco, com as decisões
  (`BARBER` cancela a própria?; o que "concluídos" conta nos relatórios; causa
  raiz do R$ 0 do drawer).
- **Dívidas técnicas** — a de "Sem marcar `NO_SHOW`" continua com o 29; a de
  "split sem validação de método duplicado" fica. Acrescentar a de
  "Cortesias sem lugar no layout do relatório", se for o caso.
- **Decisões tomadas** — datar a regra de independência entre concluir e
  cobrar, e a existência de `COURTESY` como método.
- **Números finais** — recontar rodando.
