# Agente 07 — Dashboard II (financeiro)

Projeto: **BarberVP** — SaaS multi-tenant de gestão de barbearias. NÃO é
MVP: qualidade, segurança e responsividade de produto profissional.

## Leia primeiro

1. `agentes/CONTEXT.md` — confirmar fases 01–06 ✅
2. `agentes/SPEC.md` — Modelo de dados (Order/Payment/CommissionRule/
   CashRegister/AccountPayable/AccountReceivable), Feature flags por tier
3. `.dc.html` desta fase: `Dashboard.dc.html` (abas restantes: Comandas,
   Financeiro — com sub-abas Caixa/Contas a pagar/Contas a receber/Vales/
   Contas bancárias/Fluxo de caixa —, Comissões, Fidelidade — pontos e
   sorteios —, WhatsApp, Assistente IA, Relatórios, Configurações — sub-abas
   Barbearia/Unidades/Plano/Preferências —, Minha Página)

## Regras invioláveis (valem nesta sessão)

1. Responsividade obrigatória — Comandas (POS) em duas colunas ≥ `lg`,
   bottom-sheet com subtotal sempre visível no mobile; gráficos responsivos
   com legenda abaixo no mobile.
2. Zero dado mockado — `BARBEIROS_COMISSAO_DATA`/`CONTAS_PAGAR_DATA`/
   `FLUXO_CAIXA_DATA`/`PLANOS_DATA`/`SORTEIOS_*` do protótipo viram consulta
   real.
3. Isolamento de tenant é sagrado — nenhum dado financeiro vaza entre
   tenants; reabertura de comanda auditada.
4. Regras de negócio estruturais: **fechamento de comanda em transação
   única**, feature gates **sempre server-side** (nunca só esconder botão
   no frontend).
5. WhatsApp automático (aniversário, reativação, avaliação, lembrete,
   confirmação, cancelamento) atrás de `NotificationAdapter` mock — os
   templates existem e são editáveis, mas o envio real fica pra fase 09.
6. Segurança: reabertura de comanda só `MANAGER+`, com auditoria; feature
   flags do plano SaaS aplicadas no endpoint (403), nunca só no cliente.

## Sua tarefa nesta sessão

Escopo: Comandas (POS), Financeiro completo, Comissões, Fidelidade (pontos
+ sorteios + gestão de assinaturas do lado da barbearia), WhatsApp
(automações e templates), Assistente IA (interface de chat — "Navalha"),
Relatórios, Configurações (Barbearia/Unidades/Plano/Preferências), Minha
Página (branding público). NÃO entra: super admin.

### Tarefas backend

- **Comanda**: abrir (com ou sem agendamento vinculado — walk-in também
  vira comanda), itens de serviço/produto com quantidade, desconto
  (percentual ou fixo), resgate de pontos de fidelidade (`useLoyalty`),
  pagamento por método (Pix/Dinheiro/Débito/Crédito) ou **split entre
  métodos** ("Dividir", visto no protótipo). **Fechamento em transação
  única**: valida que a soma dos pagamentos bate com o total, baixa
  estoque de produtos vendidos, gera `CommissionEntry` por
  `CommissionRule` de cada barbeiro envolvido, marca `Appointment` como
  `DONE` (se vinculado), debita `SubscriptionUsage` se algum item foi pago
  por assinatura, credita pontos de fidelidade (`Math.round(subtotal)` no
  protótipo — ajustar pela config real `gastoPorPonto`). Reabertura de
  comanda fechada só `MANAGER+`, com `AuditLog`.
- **Comissões**: `CommissionRule` por barbeiro — tipo `FIXED` (% único) ou
  `TIERED` (faixas por faturamento no período, ex. seed real: até R$5000 →
  40%, até R$8000 → 45%, acima → 50%); extrato por período (cliente,
  serviço, valor); "fechar período" trava o cálculo; `Vale` (adiantamento)
  descontado automaticamente na comissão do mês.
- **Caixa**: abrir com saldo inicial, fechar com valor conferido
  (conferência simples — diferença entre esperado e contado registrada).
- **Contas a pagar/receber**: categoria (`Aluguel`, `Produtos`, `Energia`,
  `Software`, `Internet`, `Manutenção`, `Água`, `Marketing`,
  `Contabilidade`, `Outro` para pagar; `Mensalidade`, `Venda parcelada`,
  `Outro` para receber), fornecedor/cliente, parcela (`n/N`), vencimento,
  status (pago/pendente/vencido para pagar; recebido/pendente para
  receber) — marcar como pago/recebido individualmente. `BankAccount`
  (nome, tipo, saldo, formas de pagamento aceitas). Fluxo de caixa mensal
  agregado (entradas vs. saídas).
- **Fidelidade**: programa de pontos configurável (`gastoPorPonto`,
  `pontosParaDesconto`, `valorDesconto`, expiração em meses); sorteios
  automáticos (nome, prêmio, elegibilidade, data de sorteio, aviso via
  WhatsApp) com lista de participantes e histórico de encerrados
  (ganhador); **gestão de planos de assinatura do cliente pela barbearia**
  (criar/editar/arquivar plano, ver assinantes com uso do ciclo e status de
  pagamento) — feature `fidelidadeAssinaturas`, só Avançado.
- **Relatórios**: faturamento por período/barbeiro/serviço, ticket médio,
  ocupação, distribuição por forma de pagamento, taxa de retorno de
  clientes por faixa de dias sem visita, no-show — endpoints agregados
  eficientes em SQL (não N+1). Relatórios avançados atrás da feature
  `relatoriosAvancados`.
- **WhatsApp**: `WhatsappAutomationConfig` por evento (lembrete,
  confirmação, cancelamento, aniversário, reativação, avaliação) com
  template parametrizado (`{nome}`, `{data}`, `{horario}`, `{servico}`,
  `{barbeiro}`, `{link_agendamento}`) e liga/desliga por automação;
  automações além do básico (aniversário/reativação/avaliação) atrás da
  feature `whatsappCompleto`.
- **Assistente IA**: endpoint de chat simples ("Navalha") com limite de
  mensagens por mês conforme plano (Essencial 50, Profissional 200,
  Avançado ilimitado) — a inteligência em si pode ser um adapter próprio
  (fora do escopo desta fase detalhar o provedor de LLM; deixar interface
  pronta e configurável).
- **Configurações**: dados da barbearia (nome, CNPJ, endereço, telefone,
  fuso horário, horário de funcionamento), **Unidades** (multi-unidade,
  feature `multiUnidades`, só Avançado — nome, endereço, contagem de
  barbeiros, status), **Plano** (plano atual, preço, renovação, histórico
  de faturas, trocar de plano), **Preferências** (bloqueio de agendamento
  online após N faltas — padrão 3, antecedência mínima para agendar,
  antecedência de cancelamento). **Calculadora de preço inteligente**
  atrás da feature `calculadoraPreco`, só Avançado (endpoint sugere preço
  de serviço a partir de custo/margem — escopo simples nesta fase).
- **Minha Página**: branding da página pública (slug, texto "sobre",
  toggles de seções visíveis — serviços/avaliações/fotos/horário,
  Instagram, endereço) — é o `TenantSettings` que a fase 04 já consome em
  leitura; aqui entra a escrita.

### Tarefas frontend

- Módulos restantes pixel-faithful e responsivos. Comandas (POS): catálogo
  + comanda em duas colunas ≥ `lg`; no mobile, comanda como bottom-sheet
  com subtotal sempre visível. Gráficos (fluxo de caixa, distribuição por
  forma de pagamento, faixas de retorno) responsivos, legendas abaixo no
  mobile.
- Upsell discreto (não bloqueio silencioso) quando uma feature está fora do
  plano: usar o padrão `openUpgradeModal` do protótipo (modal explicando o
  benefício + CTA de upgrade), nunca apenas esconder o botão sem
  explicação.

## Critérios de aceite

- Ciclo completo agendamento → comanda → fechamento → comissão → relatório
  batendo os valores esperados.
- Transação de fechamento de comanda coberta por teste (baixa de estoque,
  comissão, débito de assinatura, pontos — tudo ou nada).
- Feature flags testadas: usuário de plano Essencial recebe 403 ao tentar
  acessar endpoint de Contas a pagar/Comissões/Fidelidade/WhatsApp
  completo/Relatórios avançados; plano Profissional recebe 403 em
  Assinaturas/Multi-unidades/Calculadora de preço.
- Checklist de responsividade aplicado, com atenção especial ao POS.

## Ao finalizar

Atualizar `agentes/CONTEXT.md`: fase 07 ✅, endpoints criados, decisões
(ex.: fórmula final de pontos de fidelidade, formato do relatório
agregado), dívidas técnicas (ex.: provedor de LLM do Assistente IA fica
como interface pronta, sem chave real).
