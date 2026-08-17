/**
 * Contratos do wizard "Configurar Barbearia" (6 passos reais do
 * `BarberVP Configurar Barbearia.dc.html`).
 *
 * O wizard é retomável: cada passo tem endpoint próprio e grava
 * `TenantSettings.onboardingStep`, então fechar o navegador no passo 4 e voltar
 * depois — de outro dispositivo — continua de onde parou.
 */

export const ONBOARDING_STEPS = 6;

/** Passos que o rodapé do protótipo deixa pular ("Pular etapa"). */
export const SKIPPABLE_STEPS: readonly number[] = [3, 5];

export interface OnboardingProfile {
  name: string;
  phone: string | null;
  instagram: string | null;
  description: string | null;
}

export interface OnboardingLocation {
  zip: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
}

export interface OnboardingIdentity {
  slug: string;
  logoUrl: string | null;
  coverUrl: string | null;
}

export interface OnboardingService {
  id?: string;
  name: string;
  durationMin: number;
  priceCents: number;
}

export interface OnboardingBarber {
  id?: string;
  name: string;
  phone: string | null;
  /** `true` no dono — a linha fixa "Você" do passo 5, que não pode ser removida. */
  isOwner?: boolean;
}

/** Horário de um dia da semana. `0` = domingo (`Date#getDay`). */
export interface OnboardingBusinessHour {
  weekday: number;
  /** Minutos desde a meia-noite, no fuso do tenant (540 = 09:00). */
  opensAt: number;
  closesAt: number;
  closed: boolean;
}

/** Estado completo do wizard — alimenta o `GET /onboarding` que retoma a sessão. */
export interface OnboardingState {
  step: number;
  completed: boolean;
  ownerFirstName: string;
  publicUrl: string;
  profile: OnboardingProfile;
  location: OnboardingLocation;
  identity: OnboardingIdentity;
  services: OnboardingService[];
  barbers: OnboardingBarber[];
  businessHours: OnboardingBusinessHour[];
  /** Faixa de plano sugerida pela quantidade de profissionais (passo 5). */
  planHint: { barbers: number; tier: 'Essencial' | 'Profissional' | 'Avançado' };
}

/** Resposta do lookup de CEP (proxy da API para a ViaCEP). */
export interface CepLookupResult {
  zip: string;
  street: string;
  neighborhood: string;
  city: string;
  state: string;
  complement: string;
}

export interface SlugAvailability {
  slug: string;
  available: boolean;
  /** Sugestão livre quando o slug pedido já existe (`studio-navalha-2`). */
  suggestion?: string;
}

/**
 * Serviços pré-populados no passo 4 — os mesmos do protótipo. Vêm da API (o
 * frontend nunca carrega array próprio, regra 2), mas a lista canônica mora
 * aqui para API e testes concordarem.
 */
export const SUGGESTED_SERVICES: readonly OnboardingService[] = [
  { name: 'Corte degradê', durationMin: 45, priceCents: 4_500 },
  { name: 'Corte na tesoura', durationMin: 50, priceCents: 5_000 },
  { name: 'Barba', durationMin: 30, priceCents: 3_500 },
  { name: 'Corte + Barba', durationMin: 75, priceCents: 7_000 },
];

/** Horário padrão sugerido no passo 6: Seg–Sex 09–20, Sáb 09–18, Dom fechado. */
export const DEFAULT_BUSINESS_HOURS: readonly OnboardingBusinessHour[] = [
  { weekday: 0, opensAt: 540, closesAt: 1_080, closed: true },
  { weekday: 1, opensAt: 540, closesAt: 1_200, closed: false },
  { weekday: 2, opensAt: 540, closesAt: 1_200, closed: false },
  { weekday: 3, opensAt: 540, closesAt: 1_200, closed: false },
  { weekday: 4, opensAt: 540, closesAt: 1_200, closed: false },
  { weekday: 5, opensAt: 540, closesAt: 1_200, closed: false },
  { weekday: 6, opensAt: 540, closesAt: 1_080, closed: false },
];

export const WEEKDAY_LABELS = [
  'Domingo',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
] as const;

/** `540` → `09:00`. */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** `09:00` → `540`. Devolve `null` para entrada malformada. */
export function timeToMinutes(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec((time ?? '').trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 24 || m > 59) return null;
  return h * 60 + m;
}
