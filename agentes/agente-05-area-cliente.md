# Agente 05 — Área do cliente

Projeto: **BarberVP** — SaaS multi-tenant de gestão de barbearias. NÃO é
MVP: qualidade, segurança e responsividade de produto profissional.

## Leia primeiro

1. `agentes/CONTEXT.md` — confirmar fases 01–04 ✅
2. `agentes/SPEC.md` — Modelo de dados (ClientPlan/ClientSubscription/
   SubscriptionUsage), Seed (planos de assinatura), dívida técnica de LGPD
3. `.dc.html` desta fase: `MinhaConta.dc.html`, `AssinaturaCliente.dc.html`

## Regras invioláveis (valem nesta sessão)

1. Responsividade obrigatória — sheet mobile-first (mesmo padrão de
   `Modal`/`Drawer` da fase 02: bottom-sheet < 768px, modal centrado ≥
   768px).
2. Zero dado mockado — `UPCOMING_INIT`/`HISTORY_INIT`/`PLANOS_ASSINATURA`
   do protótipo viram consulta real.
3. Isolamento de tenant é sagrado — o cliente é global, mas cada
   agendamento/assinatura pertence a um tenant; um cliente só vê seus
   próprios dados, nunca de outro cliente, mesmo dentro do mesmo tenant.
4. Regras de negócio estruturais: **débito de uso de assinatura atômico**
   (`UPDATE ... WHERE used < quota RETURNING *`), renovação de ciclo via
   job.
5. Pagamento da assinatura atrás de `PaymentAdapter` mock (cartão ou Pix,
   ambos simulados).
6. Segurança: LGPD — exportação e exclusão de dados do cliente. **O
   protótipo não mostra exportação na UI** (só "Excluir minha conta") — é
   dívida técnica registrada em `CONTEXT.md`; implementar mesmo assim
   (endpoint de exportação em JSON, mesmo sem botão visível ainda, ou
   adicionar o botão como melhoria sobre o protótipo).

## Sua tarefa nesta sessão

Escopo: `MinhaConta` (agendamentos, dados, segurança, notificações) +
assinatura/fidelidade do cliente + LGPD. NÃO entra: gestão desses planos
pelo lado da barbearia (isso é do agente 07 — aqui só o consumo pelo
cliente).

### Tarefas backend

- **Perfil do cliente**: dados globais (`Client`) + perfil por barbearia
  (`ClientProfile`: notas do barbeiro sobre o cliente, tags, preferências).
- **Agendamentos do cliente**: próximos (com remarcar/cancelar respeitando
  a política de antecedência do tenant) e histórico (com "agendar de novo"
  e avaliação por estrelas para atendimentos concluídos ainda não
  avaliados).
- **Assinatura do cliente**:
  - Listar planos do tenant ativo (fonte real do seed: Corte Semanal R$120,
    Corte + Barba Quinzenal R$150, Clube Completo R$220 — mas o endpoint
    deve ler do banco, não do seed diretamente).
  - Assinar: escolher forma de pagamento (cartão com número/validade/CVV/
    nome, OU Pix com QR mock) via `PaymentAdapter` mock — cobrança
    simulada, ciclo de cobrança no dia configurado no plano.
  - Status da assinatura: em dia / pagamento pendente / pausada; ação de
    pausar (mantém dados, zera cobrança até reativar), reativar, cancelar
    (perde usos restantes do ciclo, sem multa).
  - **Débito de uso atômico** ao concluir um agendamento coberto pela
    assinatura (chamado pelo fechamento de comanda da fase 07 e também
    pelo fluxo de agendamento da fase 04 quando aplicável).
  - Renovação de ciclo via job BullMQ mock (liga de verdade na fase 09;
    aqui a lógica de renovação deve existir e ser testável isoladamente).
  - Histórico de cobranças (lista simples: data, valor, status).
- **LGPD**: consentimento versionado (aceite de termos no registro, com
  timestamp e versão do documento), exportação dos dados do cliente em
  JSON (perfil, histórico de agendamentos, assinaturas), solicitação de
  exclusão com anonimização que preserva integridade financeira (não
  apagar `Order`/`Payment` históricos, anonimizar o vínculo com o
  `Client`). Separar claramente LGPD de preferências de notificação, como o
  protótipo já faz (`MinhaConta` tem seção "Notificações" com toggles de
  WhatsApp/e-mail separada da seção de segurança/exclusão de conta).
- **Preferências de notificação** por canal (WhatsApp, e-mail) — liga nos
  templates da fase 09.

### Tarefas frontend (`apps/booking`)

- `MinhaConta` com as 3 abas reais: **Agendamentos** (sub-abas Próximos/
  Histórico), **Assinatura** (só aparece se o tenant tiver assinaturas
  habilitadas no plano — feature `fidelidadeAssinaturas`, Avançado), **Meus
  dados** (editar perfil com validação campo a campo, alterar senha,
  toggles de notificação, sair, excluir conta com checkbox de confirmação
  "entendo que é irreversível").
- `AssinaturaCliente`: tela de detalhe do plano (serviços incluídos,
  economia mensal calculada vs. avulso, "como funciona") → pagamento →
  sucesso, como sheet reaproveitável (mesmo padrão de `ClienteAuth`).
- Badge "Incluído na assinatura" / preço R$0 no wizard de agendamento
  (fase 04) quando o serviço está coberto e há uso disponível no ciclo.
- Responsivo mobile-first em toda a área.

## Critérios de aceite

- Assinar um plano mock, agendar um serviço coberto, ver o saldo de usos
  decrementar corretamente (atômico — testar concorrência).
- Exportação LGPD retorna um JSON completo do cliente.
- Cancelamento/pausa/reativação de assinatura refletem no status
  corretamente.
- Checklist de responsividade aplicado a `MinhaConta` e `AssinaturaCliente`.

## Ao finalizar

Atualizar `agentes/CONTEXT.md`: fase 05 ✅, endpoints criados, decisão sobre
como a exportação LGPD ficou exposta na UI (já que o protótipo não mostrava
botão), dívidas técnicas remanescentes.
