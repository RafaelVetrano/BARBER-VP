/**
 * Dados REAIS do bundle, consolidados em `agentes/SPEC.md` → Seed.
 *
 * Este arquivo é o destino de todo array que estava hardcoded nos `.dc.html`
 * (regra inviolável 2: zero dado mockado no frontend). Se um número aqui
 * divergir do SPEC, o SPEC vence.
 */

import {
  ACCOUNT_PAYABLE_CATEGORIES,
  ACCOUNT_RECEIVABLE_CATEGORIES,
  featuresForTier,
  PlanTier,
} from '@barbervp/types';

// ───────────────────────────────────────────────────────── Tenants ──────────

export const DEMO_TENANT = {
  slug: 'barbearia-central',
  name: 'Barbearia Central',
  timezone: 'America/Sao_Paulo',
  email: 'contato@barbeariacentral.com.br',
  phone: '551133334444',
} as const;

/** Existe só para a suíte de isolamento — fica vazio de propósito. */
export const ISOLATION_TENANT = {
  slug: 'barbearia-isolamento',
  name: 'Barbearia Isolamento (fixture)',
  timezone: 'America/Sao_Paulo',
} as const;

// ─────────────────────────────────────────────────── Planos do SaaS ─────────

export const SAAS_PLANS = [
  {
    code: 'essencial',
    name: 'Essencial',
    priceCents: 4_900,
    tier: PlanTier.ESSENCIAL,
    maxBarbers: 2,
    isPopular: false,
    sortOrder: 0,
    features: featuresForTier(PlanTier.ESSENCIAL),
    // Bullets da landing (`BarberVP Vendas.dc.html` → PLANS). Não são as
    // feature flags acima: aqui é o que o dono lê antes de assinar, lá é o que
    // o backend libera depois. Um fala de venda, o outro de permissão.
    marketing: {
      baseLabel: null,
      features: [
        'Agenda inteligente',
        'Até 2 barbeiros',
        'Agendamentos ilimitados',
        'Controle de clientes',
        'Financeiro básico (caixa)',
        'Relatórios essenciais',
        'Link de agendamento',
        'Notificações',
        'WhatsApp básico',
        'IA (50 msgs/mês)',
      ],
    },
  },
  {
    code: 'profissional',
    name: 'Profissional',
    priceCents: 8_900,
    tier: PlanTier.PROFISSIONAL,
    maxBarbers: 4,
    isPopular: true, // "★ Mais popular" na landing
    sortOrder: 1,
    features: featuresForTier(PlanTier.PROFISSIONAL),
    marketing: {
      baseLabel: 'Tudo do Essencial, mais:',
      features: [
        'Até 4 barbeiros',
        'WhatsApp completo',
        'Comissões automáticas',
        'Contas a pagar/receber',
        'Programa de fidelidade',
        'Sorteio automático',
        'Relatórios avançados',
        'IA (200 msgs/mês)',
      ],
    },
  },
  {
    code: 'avancado',
    name: 'Avançado',
    priceCents: 13_900,
    tier: PlanTier.AVANCADO,
    maxBarbers: null, // ilimitado
    isPopular: false,
    sortOrder: 2,
    features: featuresForTier(PlanTier.AVANCADO),
    marketing: {
      baseLabel: 'Tudo do Profissional, mais:',
      features: [
        'Barbeiros ilimitados',
        'Múltiplas unidades',
        'Assinaturas de clientes',
        'Calculadora de preço inteligente',
        'Suporte prioritário',
        'IA ilimitada',
      ],
    },
  },
] as const;

/**
 * O tenant demo assina o Avançado.
 *
 * Decisão da fase 05: o SPEC original tinha o demo no Profissional (fase 01),
 * mas o próprio seed já semeia `ClientPlan`/`ClientSubscription` reais desde
 * então — e a aba "Assinatura" da `MinhaConta` só aparece com a feature
 * `fidelidadeAssinaturas`, que é Avançado. Deixar o demo no Profissional
 * tornaria o próprio dado semeado invisível na tela que existe para mostrá-lo.
 * Ver decisão em `agentes/CONTEXT.md`.
 */
export const DEMO_PLAN_CODE = 'avancado';

// ───────────────────────────────────────────────────────── Serviços ─────────

export const SERVICES = [
  { key: 'corte', name: 'Corte Masculino', durationMin: 45, priceCents: 4_500, category: 'Cabelo' },
  { key: 'barba', name: 'Barba', durationMin: 30, priceCents: 3_500, category: 'Barba' },
  {
    key: 'corte-barba',
    name: 'Corte + Barba',
    durationMin: 70,
    priceCents: 7_000,
    category: 'Combo',
    isCombo: true,
  },
  {
    key: 'sobrancelha',
    name: 'Sobrancelha',
    durationMin: 15,
    priceCents: 2_000,
    category: 'Estética',
  },
  {
    key: 'pigmentacao',
    name: 'Pigmentação',
    durationMin: 40,
    priceCents: 6_000,
    category: 'Estética',
  },
  {
    key: 'corte-infantil',
    name: 'Corte Infantil',
    durationMin: 30,
    priceCents: 3_500,
    category: 'Cabelo',
  },
  {
    key: 'relaxamento',
    name: 'Relaxamento',
    durationMin: 50,
    priceCents: 5_500,
    category: 'Cabelo',
  },
] as const;

export type ServiceKey = (typeof SERVICES)[number]['key'];

/**
 * Composição dos combos (`ServiceComboPart`) — o `COMBO_ID`/`PAIR_IDS` do
 * `AgendamentoWizard.dc.html`, agora como regra de catálogo. Escolher Corte
 * Masculino e Barba juntos vira "Corte + Barba": R$ 70 em vez de R$ 80.
 */
export const SERVICE_COMBOS: Array<{ combo: ServiceKey; parts: ServiceKey[] }> = [
  { combo: 'corte-barba', parts: ['corte', 'barba'] },
];

// ──────────────────────────────────────────────────────── Barbeiros ─────────

export const BARBERS = [
  { key: 'carlos', name: 'Carlos Silva', specialty: 'Fade', ratingBps: 490 },
  { key: 'rafael', name: 'Rafael Souza', specialty: 'Barba clássica', ratingBps: 480 },
  { key: 'diego', name: 'Diego Alves', specialty: 'Cortes modernos', ratingBps: 500 },
  { key: 'bruno', name: 'Bruno Costa', specialty: 'Navalha', ratingBps: 470 },
] as const;

export type BarberKey = (typeof BARBERS)[number]['key'];

/** Pigmentação é exclusiva do Diego Alves; o resto todos atendem. */
export const EXCLUSIVE_SERVICES: Partial<Record<ServiceKey, BarberKey[]>> = {
  pigmentacao: ['diego'],
};

// ─────────────────────────────────────── Horários (minutos da meia-noite) ───

export const MIN = {
  '09:00': 9 * 60,
  '12:00': 12 * 60,
  '13:00': 13 * 60,
  '18:00': 18 * 60,
  '20:00': 20 * 60,
} as const;

/** Seg–Sex 09:00–20:00 · Sáb 09:00–18:00 · Dom fechado. */
export const BUSINESS_HOURS = [
  { weekday: 0, opensAt: 0, closesAt: 0, closed: true },
  { weekday: 1, opensAt: MIN['09:00'], closesAt: MIN['20:00'], closed: false },
  { weekday: 2, opensAt: MIN['09:00'], closesAt: MIN['20:00'], closed: false },
  { weekday: 3, opensAt: MIN['09:00'], closesAt: MIN['20:00'], closed: false },
  { weekday: 4, opensAt: MIN['09:00'], closesAt: MIN['20:00'], closed: false },
  { weekday: 5, opensAt: MIN['09:00'], closesAt: MIN['20:00'], closed: false },
  { weekday: 6, opensAt: MIN['09:00'], closesAt: MIN['18:00'], closed: false },
] as const;

// ───────────────────────────────── Planos de assinatura do cliente ──────────

export const CLIENT_PLANS = [
  {
    name: 'Corte Semanal',
    description: '4 cortes por mês — um por semana, sempre com o barbeiro que você escolher.',
    priceCents: 12_000,
    isPopular: false,
    sortOrder: 0,
    items: [{ service: 'corte' as ServiceKey, quota: 4 }],
  },
  {
    name: 'Corte + Barba Quinzenal',
    description: 'Dois cortes e duas barbas por mês. O mais escolhido da casa.',
    priceCents: 15_000,
    isPopular: true,
    sortOrder: 1,
    items: [
      { service: 'corte' as ServiceKey, quota: 2 },
      { service: 'barba' as ServiceKey, quota: 2 },
    ],
  },
  {
    name: 'Clube Completo',
    description: 'Quatro cortes e quatro barbas por mês, com prioridade na agenda.',
    priceCents: 22_000,
    isPopular: false,
    sortOrder: 2,
    items: [
      { service: 'corte' as ServiceKey, quota: 4 },
      { service: 'barba' as ServiceKey, quota: 4 },
    ],
  },
] as const;

/** Cobrança todo dia 5 (SPEC). */
export const CLIENT_PLAN_BILLING_DAY = 5;

// ─────────────────────────────────────────────────────────── Produtos ──────

export const PRODUCTS = [
  { name: 'Pomada Modeladora Matte', priceCents: 4_500, costCents: 2_200, stock: 24, estoqueMin: 6 },
  { name: 'Óleo para Barba 30ml', priceCents: 3_900, costCents: 1_800, stock: 15, estoqueMin: 5 },
  { name: 'Shampoo Anticaspa 250ml', priceCents: 3_200, costCents: 1_500, stock: 4, estoqueMin: 6 },
  { name: 'Cera Fixação Forte', priceCents: 4_200, costCents: 2_000, stock: 11, estoqueMin: 4 },
  { name: 'Kit Barba (óleo + balm)', priceCents: 8_900, costCents: 4_500, stock: 7, estoqueMin: 3 },
  { name: 'Minoxidil Capilar 60ml', priceCents: 6_900, costCents: 3_400, stock: 2, estoqueMin: 5 },
] as const;

// ──────────────────────────────────────────────────────────── Clientes ─────

/**
 * `password` só existe no André Martins — dá um login pronto pra conferir a
 * fase 05 (`MinhaConta`/`AssinaturaCliente`) sem passar pelo fluxo de OTP do
 * registro. Os demais seguem sem senha, como desde a fase 01 (contas que só
 * entrariam pelo cadastro completo).
 */
export const CLIENTS = [
  {
    name: 'André Martins',
    phone: '5511987650001',
    email: 'andre.martins@exemplo.com',
    password: 'BarberVP@2026',
  },
  { name: 'Bruno Ferreira', phone: '5511987650002', email: 'bruno.ferreira@exemplo.com' },
  { name: 'Caio Nogueira', phone: '5511987650003', email: null },
  { name: 'Daniel Prado', phone: '5511987650004', email: 'daniel.prado@exemplo.com' },
  { name: 'Eduardo Lima', phone: '5511987650005', email: null },
  { name: 'Felipe Ramos', phone: '5511987650006', email: 'felipe.ramos@exemplo.com' },
  { name: 'Gustavo Teixeira', phone: '5511987650007', email: null },
  { name: 'Henrique Barros', phone: '5511987650008', email: 'henrique.barros@exemplo.com' },
  { name: 'Igor Sampaio', phone: '5511987650009', email: null },
  { name: 'João Vitor Alves', phone: '5511987650010', email: 'joao.alves@exemplo.com' },
] as const;

// ───────────────────────────────────────────────────────── Avaliações ──────

/**
 * As avaliações da página pública (`MOCK_REVIEWS` de
 * `Agendamento Publico.dc.html`). Regra 2: array do protótipo vira seed.
 *
 * `daysAgo` alimenta o "há 3 dias" da tela, que é calculado no cliente a partir
 * de `createdAt` — nenhum texto de data fica congelado no banco.
 */
export const REVIEWS = [
  {
    authorName: 'João P.',
    rating: 5,
    comment: 'Melhor degradê da cidade, agendei em 30 segundos pelo link.',
    barberKey: 'carlos' as BarberKey,
    daysAgo: 3,
  },
  {
    authorName: 'Lucas F.',
    rating: 5,
    comment: 'Nunca mais esqueci horário, o lembrete no WhatsApp salva.',
    barberKey: null,
    daysAgo: 7,
  },
  {
    authorName: 'André S.',
    rating: 5,
    comment: 'Ambiente top e o Diego é um artista.',
    barberKey: 'diego' as BarberKey,
    daysAgo: 14,
  },
  {
    authorName: 'Rodrigo M.',
    rating: 5,
    comment: 'Barba feita na navalha com o Bruno, saí outro homem.',
    barberKey: 'bruno' as BarberKey,
    daysAgo: 21,
  },
  {
    authorName: 'Vinícius A.',
    rating: 4,
    comment: 'Atendimento ótimo. Só achei o horário de sábado disputado demais.',
    barberKey: null,
    daysAgo: 30,
  },
] as const;

// ──────────────────────────────────────────────────── Contas de acesso ─────

export const USERS = {
  superAdmin: {
    email: 'admin@barbervp.com.br',
    name: 'Super Admin BarberVP',
    password: 'BarberVP@2026',
  },
  owner: {
    email: 'dono@barbeariacentral.com.br',
    name: 'Marcos Vinícius Pereira',
    password: 'BarberVP@2026',
  },
  manager: {
    email: 'gerente@barbeariacentral.com.br',
    name: 'Patrícia Nunes',
    password: 'BarberVP@2026',
  },
  /** Login do barbeiro que usa o `DashboardFuncionario`. */
  barber: {
    email: 'carlos@barbeariacentral.com.br',
    name: 'Carlos Silva',
    password: 'BarberVP@2026',
    barberKey: 'carlos' as BarberKey,
  },
} as const;

// ────────────────────────────────────────────── Comissões e fidelidade ─────

export const COMMISSION_RULES = [
  { name: 'Comissão padrão', type: 'FIXED' as const, percentBps: 4_000, tiers: [] },
  {
    name: 'Comissão por faixa de faturamento',
    type: 'TIERED' as const,
    percentBps: null,
    // SPEC: até R$5.000 → 40%, até R$8.000 → 45%, acima → 50%.
    tiers: [
      { upToCents: 500_000, percentBps: 4_000, sortOrder: 0 },
      { upToCents: 800_000, percentBps: 4_500, sortOrder: 1 },
      { upToCents: null, percentBps: 5_000, sortOrder: 2 },
    ],
  },
] as const;

export const LOYALTY_PROGRAM = {
  active: true,
  /** R$ 1,00 gasto = 1 ponto. */
  gastoPorPonto: 100,
  pontosParaDesconto: 100,
  /** R$ 10,00 de desconto a cada 100 pontos. */
  valorDesconto: 1_000,
  expiracaoMeses: 12,
} as const;

// ────────────────────────────────────────── Automações de WhatsApp ─────────

export const WHATSAPP_TEMPLATES = [
  {
    event: 'CONFIRMATION' as const,
    enabled: true,
    offsetMinutes: null,
    template:
      'Olá {nome}! Seu horário na Barbearia Central está confirmado para {data} às {horario} com {barbeiro} ({servico}). Até lá!',
  },
  {
    event: 'REMINDER' as const,
    enabled: true,
    offsetMinutes: 24 * 60,
    template:
      'Oi {nome}, passando pra lembrar: amanhã ({data}) às {horario} você tem {servico} com {barbeiro}. Precisa remarcar? {link_agendamento}',
  },
  {
    event: 'CANCELLATION' as const,
    enabled: true,
    offsetMinutes: null,
    template:
      '{nome}, seu horário de {data} às {horario} foi cancelado. Quando quiser, é só reagendar: {link_agendamento}',
  },
  {
    event: 'BIRTHDAY' as const,
    enabled: false,
    offsetMinutes: null,
    template:
      'Feliz aniversário, {nome}! 🎉 A Barbearia Central te espera com um mimo especial: {link_agendamento}',
  },
  {
    event: 'REACTIVATION' as const,
    enabled: false,
    offsetMinutes: null,
    template:
      'Faz um tempo que a gente não te vê, {nome}. Bora dar um trato no visual? {link_agendamento}',
  },
  {
    event: 'REVIEW' as const,
    enabled: false,
    offsetMinutes: 120,
    template:
      '{nome}, como foi seu atendimento com {barbeiro}? Sua opinião ajuda muito a gente a melhorar.',
  },
] as const;

// ──────────────────────────────────────────────── Financeiro de exemplo ────
//
// Linhas e categorias REAIS de `CONTAS_PAGAR_DATA`/`CONTAS_RECEBER_DATA`/
// `CONTAS_BANCARIAS_DATA` (`Dashboard.dc.html`) — regra 2 (zero dado
// mockado) nomeia `CONTAS_PAGAR_DATA` explicitamente. As datas do bundle
// (jul/2026) viram deslocamento relativo a partir do seed (`dueInDays`), pra
// nunca ficarem "vencidas" por causa da data de quando o seed rodou; o
// `status` de cada linha é o mesmo do bundle.

export const CATEGORIAS_PAGAR = ACCOUNT_PAYABLE_CATEGORIES;
export const CATEGORIAS_RECEBER = ACCOUNT_RECEIVABLE_CATEGORIES;

export const BANK_ACCOUNTS = [
  {
    name: 'Nubank PJ',
    type: 'Pix / Transferência / Cartão',
    balanceCents: 842_000,
    acceptedMethods: ['PIX', 'CREDIT', 'DEBIT'] as const,
  },
  {
    name: 'Dinheiro em espécie',
    type: 'Caixa físico',
    balanceCents: 74_000,
    acceptedMethods: ['CASH'] as const,
  },
] as const;

export const ACCOUNTS_PAYABLE = [
  { description: 'Aluguel do salão', category: 'Aluguel', supplier: 'Imobiliária Silva & Cia', installment: 8, installments: 12, amountCents: 220_000, dueInDays: -20, status: 'PAID' as const },
  { description: 'Produtos de revenda', category: 'Produtos', supplier: 'Barber Supply Distribuidora', installment: 1, installments: 1, amountCents: 89_000, dueInDays: 6, status: 'PENDING' as const },
  { description: 'Conta de energia', category: 'Energia', supplier: 'Enel Distribuição', installment: 1, installments: 1, amountCents: 42_000, dueInDays: 8, status: 'PENDING' as const },
  { description: 'Assinatura sistema de gestão', category: 'Software', supplier: 'SaaS Gestão Barber', installment: 1, installments: 1, amountCents: 18_900, dueInDays: 10, status: 'PENDING' as const },
  { description: 'Internet e telefone', category: 'Internet', supplier: 'Vivo Empresas', installment: 1, installments: 1, amountCents: 21_000, dueInDays: -2, status: 'PAID' as const },
  { description: 'Manutenção de equipamentos', category: 'Manutenção', supplier: 'Barber Tech Serviços', installment: 3, installments: 6, amountCents: 35_000, dueInDays: 25, status: 'PENDING' as const },
  { description: 'Produtos de revenda', category: 'Produtos', supplier: 'Hair Pro Cosméticos', installment: 1, installments: 1, amountCents: 48_000, dueInDays: 13, status: 'PENDING' as const },
  { description: 'Água e esgoto', category: 'Água', supplier: 'Sabesp', installment: 1, installments: 1, amountCents: 9_500, dueInDays: -5, status: 'PAID' as const },
  { description: 'Marketing digital', category: 'Marketing', supplier: 'Agência Digital Barber', installment: 1, installments: 1, amountCents: 35_100, dueInDays: 7, status: 'PENDING' as const },
  { description: 'Serviços contábeis', category: 'Contabilidade', supplier: 'Escritório Contábil ABC', installment: 1, installments: 1, amountCents: 158_500, dueInDays: -3, status: 'PENDING' as const },
] as const;

export const ACCOUNTS_RECEIVABLE = [
  { description: 'Mensalidade Clube do Corte', category: 'Mensalidade', customer: 'João Pedro', installment: 2, installments: 12, amountCents: 12_990, dueInDays: 4, status: 'PENDING' as const },
  { description: 'Mensalidade Clube do Corte', category: 'Mensalidade', customer: 'Rafael Nunes', installment: 4, installments: 12, amountCents: 8_990, dueInDays: 6, status: 'PENDING' as const },
  { description: 'Mensalidade Clube do Corte', category: 'Mensalidade', customer: 'Bruno Carvalho', installment: 6, installments: 12, amountCents: 8_990, dueInDays: 8, status: 'PENDING' as const },
  { description: 'Venda parcelada — Kit de produtos', category: 'Venda parcelada', customer: 'Marina Costa', installment: 1, installments: 3, amountCents: 26_000, dueInDays: 10, status: 'PENDING' as const },
  { description: 'Mensalidade Clube do Corte', category: 'Mensalidade', customer: 'André Souza', installment: 9, installments: 12, amountCents: 8_990, dueInDays: -8, status: 'RECEIVED' as const },
  { description: 'Venda parcelada — Máquina de corte', category: 'Venda parcelada', customer: 'Gabriel Lima', installment: 2, installments: 4, amountCents: 17_500, dueInDays: 16, status: 'PENDING' as const },
  { description: 'Mensalidade Clube do Corte', category: 'Mensalidade', customer: 'Lucas Ferreira', installment: 5, installments: 12, amountCents: 8_990, dueInDays: -12, status: 'RECEIVED' as const },
  { description: 'Venda parcelada — Produtos premium', category: 'Venda parcelada', customer: 'Thiago Melo', installment: 3, installments: 3, amountCents: 22_000, dueInDays: 24, status: 'PENDING' as const },
] as const;

export const RAFFLES = [
  {
    name: 'Sorteio Kit Barba Premium',
    description: 'Concorra a um kit completo de barba. 1 cupom a cada 10 pontos.',
    prize: 'Kit Barba Premium',
    status: 'ACTIVE' as const,
    pointsPerEntry: 10,
    startsInDays: -10,
    endsInDays: 20,
  },
  {
    name: 'Sorteio Corte Grátis por 3 meses',
    description: 'Campanha encerrada de setembro.',
    prize: '3 meses de corte grátis',
    status: 'FINISHED' as const,
    pointsPerEntry: 20,
    startsInDays: -70,
    endsInDays: -40,
  },
] as const;
