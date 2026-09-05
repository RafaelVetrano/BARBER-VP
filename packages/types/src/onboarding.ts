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

/**
 * Passos SEM os quais a barbearia não funciona, e por isso obrigatórios para
 * `POST /onboarding/complete` (agente 30):
 *
 * 1 (perfil) — sem nome e telefone a página pública não se identifica;
 * 2 (endereço) — sem endereço o cliente não sabe aonde ir;
 * 4 (serviços) — sem serviço não há o que agendar;
 * 6 (horário) — sem expediente o `AvailabilityService` não monta grade nenhuma.
 *
 * É o complemento exato de `SKIPPABLE_STEPS` (3 e 5, decisão da fase 03), e a
 * lista mora aqui para o servidor recusar e a tela avisar pelo MESMO conjunto.
 */
export const REQUIRED_STEPS: readonly number[] = [1, 2, 4, 6];

/** Rótulo de cada passo, para a mensagem do 409 e para a tela. */
export const ONBOARDING_STEP_LABELS: Record<number, string> = {
  1: 'Dados da barbearia',
  2: 'Endereço',
  3: 'Identidade e link público',
  4: 'Serviços',
  5: 'Equipe',
  6: 'Horário de funcionamento',
};

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
  /**
   * Código IBGE do município (7 dígitos), do seletor de cidade do passo 2.
   *
   * É ele — e não o nome — que casa a resposta do CEP com o item da lista:
   * "Ribeirão Preto" volta da ViaCEP com acento e do IBGE com acento, mas
   * qualquer divergência de grafia (ou de caixa) faria a busca por nome errar
   * um município que o código acerta sempre.
   */
  cityIbgeCode: string | null;
}

/** Uma UF do seletor do passo 2. */
export interface UfOption {
  /** Sigla de 2 letras — é o que `TenantSettings.addressState` guarda. */
  code: string;
  name: string;
}

/** Um município, como o IBGE devolve (`id` é o código de 7 dígitos). */
export interface IbgeCity {
  id: string;
  name: string;
}

/**
 * As 27 unidades federativas. Lista ESTÁTICA de propósito: são 27 itens que não
 * mudam desde 1988, e uma chamada externa para servi-los seria latência sem
 * ganho. Os municípios, esses sim, vêm do IBGE (`GET /onboarding/cities/:uf`).
 */
export const BRAZIL_UFS: readonly UfOption[] = [
  { code: 'AC', name: 'Acre' },
  { code: 'AL', name: 'Alagoas' },
  { code: 'AP', name: 'Amapá' },
  { code: 'AM', name: 'Amazonas' },
  { code: 'BA', name: 'Bahia' },
  { code: 'CE', name: 'Ceará' },
  { code: 'DF', name: 'Distrito Federal' },
  { code: 'ES', name: 'Espírito Santo' },
  { code: 'GO', name: 'Goiás' },
  { code: 'MA', name: 'Maranhão' },
  { code: 'MT', name: 'Mato Grosso' },
  { code: 'MS', name: 'Mato Grosso do Sul' },
  { code: 'MG', name: 'Minas Gerais' },
  { code: 'PA', name: 'Pará' },
  { code: 'PB', name: 'Paraíba' },
  { code: 'PR', name: 'Paraná' },
  { code: 'PE', name: 'Pernambuco' },
  { code: 'PI', name: 'Piauí' },
  { code: 'RJ', name: 'Rio de Janeiro' },
  { code: 'RN', name: 'Rio Grande do Norte' },
  { code: 'RS', name: 'Rio Grande do Sul' },
  { code: 'RO', name: 'Rondônia' },
  { code: 'RR', name: 'Roraima' },
  { code: 'SC', name: 'Santa Catarina' },
  { code: 'SP', name: 'São Paulo' },
  { code: 'SE', name: 'Sergipe' },
  { code: 'TO', name: 'Tocantins' },
];

/** `true` se a sigla é uma das 27 — a validação que a API e a tela compartilham. */
export function isValidUf(code: string): boolean {
  const upper = (code ?? '').trim().toUpperCase();
  return BRAZIL_UFS.some((uf) => uf.code === upper);
}

/**
 * Texto pronto para busca: sem acento e sem caixa, para "ribeirao" achar
 * "Ribeirão Preto" e "sao paulo" achar "São Paulo".
 *
 * Mesma decomposição NFD de `slugify`, mas preservando o espaço — aqui o
 * objetivo é comparar palavras, não montar URL.
 */
export function normalizeSearchText(input: string): string {
  return (input ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
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
  /**
   * Primeiro nome do dono para o vocativo das telas de boas-vindas e de
   * conclusão — **vazio** quando o cadastro não tem nome próprio de gente, e aí
   * a tela cumprimenta sem vocativo. Nunca um pedaço de e-mail (agente 30).
   */
  ownerGreetingName: string;
  /** Link público completo da barbearia: `{publicBaseUrl}/{slug}`. */
  publicUrl: string;
  /**
   * Base do link público, sem barra final — o mesmo valor que `GET /my-page`
   * devolve, para o prefixo do campo de slug e o link do fim do wizard dizerem
   * a mesma coisa.
   */
  publicBaseUrl: string;
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
  /**
   * Código IBGE do município, que a ViaCEP devolve no campo `ibge`. É por ele
   * que o passo 2 SELECIONA a cidade no combo, em vez de casar pelo nome.
   * Vazio quando a ViaCEP não o traz (acontece em CEP recém-criado).
   */
  ibgeCode: string;
}

export interface SlugAvailability {
  slug: string;
  available: boolean;
  /** Sugestão livre quando o slug pedido já existe (`studio-navalha-2`). */
  suggestion?: string;
  /**
   * `true` quando o link é de uma ROTA do produto (`entrar`, `cadastro`,
   * `admin`…), não de outra barbearia. A tela precisa saber a diferença: "já
   * está em uso" convida a tentar de novo mais tarde, e este caso nunca vai
   * ficar livre.
   */
  reserved?: boolean;
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

/**
 * Rótulo curto do dia — é o que cabe nos 36px da linha de horário de
 * funcionamento (`Dashboard.dc.html` l.2508). Indexado por `weekday`, igual a
 * `WEEKDAY_LABELS`.
 */
export const WEEKDAY_SHORT_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;

/**
 * Ordem de exibição da semana: segunda primeiro, domingo por último.
 *
 * O banco guarda `weekday` compatível com `Date#getDay` (0 = domingo), mas
 * toda tela do produto lista a semana começando na segunda — é como o dono lê
 * o expediente da casa (`WEEK_DAYS` do protótipo, l.4399).
 */
export const WEEK_ORDER_MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0] as const;
