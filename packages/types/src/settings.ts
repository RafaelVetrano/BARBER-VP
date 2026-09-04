/**
 * Configurações (Barbearia/Unidades/Plano/Preferências) e Minha Página —
 * fase 07.
 */

import type { OnboardingBusinessHour } from './onboarding';
import type { PlanMarketing } from './features';

// ── Barbearia ────────────────────────────────────────────────────────────

/**
 * Um dia no expediente DA CASA (`Dashboard.dc.html` l.2506–2530).
 *
 * É o `OnboardingBusinessHour` mais o intervalo de almoço: o wizard não
 * pergunta almoço (são 6 passos, não 7), mas a aba Configurações desenha um
 * toggle "Almoço" por dia. `lunchStart`/`lunchEnd` nulos = a casa não fecha
 * para o almoço — e é assim que todo tenant nasce.
 */
export interface TenantBusinessHour extends OnboardingBusinessHour {
  /** Minutos desde a meia-noite. `null` nos dois = sem intervalo. */
  lunchStart: number | null;
  lunchEnd: number | null;
}

/** Fusos que a barbearia pode escolher (`Dashboard.dc.html` l.2495–2500). */
export const TENANT_TIMEZONES = [
  { value: 'America/Sao_Paulo', label: 'América/São Paulo (GMT-3)' },
  { value: 'America/Manaus', label: 'América/Manaus (GMT-4)' },
  { value: 'America/Noronha', label: 'América/Noronha (GMT-2)' },
  { value: 'America/Rio_Branco', label: 'América/Rio Branco (GMT-5)' },
] as const;

export type TenantTimezone = (typeof TENANT_TIMEZONES)[number]['value'];

export interface BarbershopSettings {
  name: string;
  document: string | null;
  address: string | null;
  phone: string | null;
  timezone: string;
  businessHours: TenantBusinessHour[];
}

export interface UpdateBarbershopSettingsDto {
  name?: string;
  document?: string | null;
  address?: string | null;
  phone?: string | null;
  timezone?: string;
  businessHours?: TenantBusinessHour[];
}

// ── Unidades (multi-unidade — Avançado) ──────────────────────────────────

/**
 * Coluna "Status" da tabela de unidades (`Dashboard.dc.html` l.2568).
 *
 * DERIVADO, nunca digitado: uma unidade desligada é `INACTIVE`; uma unidade
 * ligada que ainda não tem barbeiro nenhum é `SETUP` ("Em configuração" — é
 * exatamente o estado em que o protótipo cria toda unidade nova, l.7034); o
 * resto é `ACTIVE`.
 */
export type UnitStatus = 'ACTIVE' | 'SETUP' | 'INACTIVE';

export interface UnitItem {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  isDefault: boolean;
  active: boolean;
  barberCount: number;
  status: UnitStatus;
}

export interface UpsertUnitDto {
  name: string;
  address?: string | null;
  phone?: string | null;
}

// ── Plano do SaaS ────────────────────────────────────────────────────────

export interface SaasPlanOption {
  id: string;
  code: string;
  name: string;
  priceCents: number;
  tier: number;
  maxBarbers: number | null;
  isPopular: boolean;
  features: Record<string, boolean>;
  /**
   * Bullets do card na grade de comparação (`Dashboard.dc.html` l.2632).
   * `null` = plano sem cópia de marketing — o card mostra só nome e preço.
   */
  marketing: PlanMarketing | null;
}

export interface SaasInvoiceItem {
  id: string;
  amountCents: number;
  status: 'PAID' | 'PENDING' | 'FAILED';
  /**
   * Fatura PENDENTE que passou do vencimento — o "Atrasado" da terceira cor da
   * tabela (`Dashboard.dc.html` l.2670). Não é um status novo no banco: é
   * `PENDING` + tempo, e quem faz essa conta é a API.
   */
  overdue: boolean;
  issuedAt: string;
  paidAt: string | null;
}

export interface CurrentPlanResponse {
  plan: SaasPlanOption;
  /**
   * Próxima renovação, ISO-8601. `null` quando não há assinatura ativa — a
   * tela escreve "—" em vez de fingir que renova hoje.
   */
  renewsAt: string | null;
  status: string;
  invoices: SaasInvoiceItem[];
  availablePlans: SaasPlanOption[];
  barbersInUse: number;
}

/**
 * O que o dono vê ANTES de confirmar a troca (`modalTrocarPlano`, l.3483).
 *
 * As duas listas saem do diff REAL entre o `features` do plano atual e o do
 * plano escolhido, mais o efeito colateral do teto de barbeiros. Nada aqui é
 * escrito no frontend: trocar o `features` de um plano no super admin muda
 * este texto sem tocar em uma linha de tela.
 */
export interface PlanChangePreview {
  planId: string;
  planName: string;
  priceCents: number;
  currentPlanName: string;
  isDowngrade: boolean;
  /** Frases de "Você vai ganhar". Vazio = bloco não aparece. */
  gained: string[];
  /** Frases de "Você vai perder". Vazio = bloco não aparece. */
  lost: string[];
  /**
   * Barbeiros que o downgrade vai desligar, na ordem em que serão desligados.
   * Alimenta a frase de perda mais concreta do modal.
   */
  barbersToDeactivate: string[];
}

export interface ChangePlanDto {
  planId: string;
}

// ── Preferências ─────────────────────────────────────────────────────────

export interface PreferencesSettings {
  bloquearFaltasAtivo: boolean;
  bloquearFaltasQtd: number;
  antecedenciaMinima: number;
  cancelamentoHoras: number;
  /**
   * Meta de faturamento do mês, em centavos. `null` = sem meta — o gráfico do
   * Dashboard não desenha a linha tracejada (fase 13).
   */
  monthlyGoalCents: number | null;
}

/**
 * Opções dos três seletores da aba Preferências (`Dashboard.dc.html`
 * l.2694/2712/2724).
 *
 * Ficam no contrato compartilhado porque a API valida contra os MESMOS
 * limites que a tela oferece. A lista é a granularidade do controle, não o
 * valor do tenant: o valor vem sempre de `PreferencesSettings`, e um valor
 * gravado fora da lista (um tenant antigo, uma alteração por API) continua
 * válido e é adicionado ao seletor em tempo de render — a tela nunca troca
 * silenciosamente a política da barbearia por estar fora do menu.
 */
export const FALTAS_OPTIONS = [1, 2, 3, 4, 5] as const;

/** Minutos. */
export const ANTECEDENCIA_OPTIONS = [30, 60, 120, 240, 720] as const;

/** Horas. */
export const CANCELAMENTO_OPTIONS = [1, 3, 12, 24] as const;

export interface UpdatePreferencesDto {
  bloquearFaltasAtivo?: boolean;
  bloquearFaltasQtd?: number;
  antecedenciaMinima?: number;
  cancelamentoHoras?: number;
  /** `null` limpa a meta. */
  monthlyGoalCents?: number | null;
}

// A calculadora de preço mudou de casa: o protótipo a desenha na aba
// "Serviços & Produtos" (l.1856), não em Configurações. Contrato e fórmula
// vivem em `./price-calculator`.

// ── Minha Página ─────────────────────────────────────────────────────────

export interface TenantPhotoItem {
  id: string;
  url: string;
  sortOrder: number;
}

export interface MyPageSettings {
  slug: string;
  /** Link completo da página pública — o que o botão "Copiar" leva. */
  publicUrl: string;
  /**
   * Base do link, SEM barra final. É o prefixo cinza do campo de URL
   * personalizada: o protótipo escreve "barberos.app/" no HTML, aqui o domínio
   * vem do ambiente e nunca do desenho.
   */
  publicBaseUrl: string;
  sobre: string | null;
  instagram: string | null;
  address: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  showServices: boolean;
  showReviews: boolean;
  showPhotos: boolean;
  showBusinessHours: boolean;
  photos: TenantPhotoItem[];
}

export interface UpdateMyPageDto {
  slug?: string;
  sobre?: string | null;
  instagram?: string | null;
  address?: string | null;
  showServices?: boolean;
  showReviews?: boolean;
  showPhotos?: boolean;
  showBusinessHours?: boolean;
}

export interface AddTenantPhotoDto {
  url: string;
}

/** Slots de imagem única da página — a galeria tem endpoint próprio. */
export type MyPageImageSlot = 'logo' | 'cover';

/**
 * Linha da tabela "Avaliações recebidas" (`Dashboard.dc.html` l.2429).
 *
 * Diferente de `PublicReview`: aqui vêm TODAS as avaliações da barbearia,
 * publicadas ou não, porque a tabela é justamente onde o dono decide quais
 * aparecem no site.
 */
export interface MyPageReviewItem {
  id: string;
  /** ISO-8601. */
  createdAt: string;
  authorName: string;
  /** 1 a 5. */
  rating: number;
  comment: string | null;
  /** Barbeiro avaliado — `null` quando a nota é da barbearia. */
  barberName: string | null;
  published: boolean;
}

export interface UpdateMyPageReviewDto {
  published: boolean;
}
