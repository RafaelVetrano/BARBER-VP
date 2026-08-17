/**
 * Dados REAIS do bundle, consolidados em `agentes/SPEC.md` → Seed.
 *
 * Este arquivo é o destino de todo array que estava hardcoded nos `.dc.html`
 * (regra inviolável 2: zero dado mockado no frontend). Se um número aqui
 * divergir do SPEC, o SPEC vence.
 */

import { featuresForTier, PlanTier } from '@barbervp/types';

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

export const BANK_ACCOUNT = {
  name: 'Conta corrente principal',
  bank: 'Banco do Brasil',
  agency: '1234-5',
  account: '98765-4',
  balanceCents: 1_284_500,
} as const;

export const ACCOUNTS_PAYABLE = [
  { description: 'Aluguel do salão', category: 'Ocupação', supplier: 'Imobiliária Centro', amountCents: 320_000, dueInDays: 5 },
  { description: 'Energia elétrica', category: 'Utilidades', supplier: 'Enel', amountCents: 48_700, dueInDays: 12 },
  { description: 'Reposição de produtos', category: 'Estoque', supplier: 'Distribuidora BarberPro', amountCents: 96_400, dueInDays: -3 },
  { description: 'Internet e telefone', category: 'Utilidades', supplier: 'Vivo', amountCents: 19_900, dueInDays: 20 },
] as const;

export const ACCOUNTS_RECEIVABLE = [
  { description: 'Convênio empresa Alfa — outubro', category: 'Convênio', customer: 'Alfa Tecnologia', amountCents: 145_000, dueInDays: 8 },
  { description: 'Pacote corporativo — time comercial', category: 'Convênio', customer: 'Beta Consultoria', amountCents: 89_000, dueInDays: -2 },
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
