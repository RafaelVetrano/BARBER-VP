/**
 * Contratos de autenticação compartilhados entre a API e as 4 apps web.
 *
 * Tudo que precisa dar exatamente o mesmo resultado nos dois lados mora aqui:
 * normalização de telefone, regra de senha, forma do slug e o formato das
 * respostas de auth. A API valida com estas funções; o frontend valida com as
 * MESMAS — assim a mensagem de erro do formulário nunca discorda do backend.
 */

import type { Role } from './enums';

// ── Sessão e tokens ─────────────────────────────────────────────────────────

/** Claim `aud` do JWT — separa o universo do painel do universo do cliente. */
export const TokenAudience = {
  ESTABLISHMENT: 'bvp:establishment',
  CLIENT: 'bvp:client',
} as const;
export type TokenAudience = (typeof TokenAudience)[keyof typeof TokenAudience];

/**
 * Cookies httpOnly do refresh token. Nomes distintos porque as duas sessões
 * coexistem no mesmo navegador: o dono pode estar logado no painel e, na aba
 * ao lado, agendando como cliente.
 */
export const REFRESH_COOKIE = {
  ESTABLISHMENT: 'bvp_rt',
  CLIENT: 'bvp_crt',
} as const;

/** Conteúdo do access token, já decodificado. */
export interface AccessTokenClaims {
  sub: string;
  aud: TokenAudience;
  /** Tenant ativo da sessão — `null` enquanto o usuário não escolheu contexto. */
  tid: string | null;
  /** Papéis do principal NO tenant ativo (vazio para cliente). */
  rol: Role[];
  sa: boolean;
  /** Id da `AuthSession` que emitiu este par. */
  sid: string;
  exp: number;
  iat: number;
}

// ── Respostas de auth ───────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  /** Foto do menu do avatar — `null` cai nas iniciais. */
  avatarUrl: string | null;
  isSuperAdmin: boolean;
  /** `true` quando este login também tem conta de cliente vinculada. */
  hasClientAccount: boolean;
}

export interface AuthMembership {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantStatus: string;
  role: Role;
  /** `false` enquanto o wizard de configuração não foi concluído. */
  onboardingDone: boolean;
  onboardingStep: number;
}

/** Resposta de login/registro/refresh do estabelecimento. */
export interface EstablishmentSession {
  accessToken: string;
  /** Segundos até o access token expirar (o refresh vai no cookie httpOnly). */
  expiresIn: number;
  user: AuthUser;
  memberships: AuthMembership[];
  /** Membership ativo — `null` só quando o usuário não tem nenhum tenant. */
  activeTenantId: string | null;
}

export interface AuthClient {
  id: string;
  name: string;
  /** E.164 sem formatação. */
  phone: string;
  email: string | null;
  phoneVerified: boolean;
  marketingOptIn: boolean;
  /** Preferências de notificação por canal (fase 05) — `MinhaConta` → "Notificações". */
  notifyWhatsapp: boolean;
  notifyEmail: boolean;
}

/**
 * Versão vigente dos termos de uso/privacidade — carimbada em `Client.consentAt`
 * a cada aceite (registro) e em toda ação que reafirma consentimento. Subir este
 * valor não precisa de migration: é constante de código, lida pelos dois lados.
 */
export const CURRENT_TERMS_VERSION = '2026-08-16';

export interface ClientSession {
  accessToken: string;
  expiresIn: number;
  client: AuthClient;
}

/**
 * Resultado de `POST /auth/check-email` — é o que decide qual dos três estados
 * do Cadastro Estabelecimento a tela mostra.
 */
export interface EmailCheckResult {
  /** `available`: segue o cadastro normal. */
  status: 'available' | 'establishment' | 'client';
  /** Presente só em `client`: identifica a conta para o card de vínculo. */
  account?: { name: string; emailMasked: string; initials: string };
}

/** Desafio OTP em aberto (registro ou recuperação de senha do cliente). */
export interface OtpChallenge {
  challengeId: string;
  /** Destino mascarado, pronto para exibição: `(16) 9 ****-9999`. */
  destinationMasked: string;
  channel: 'WHATSAPP' | 'SMS' | 'EMAIL' | 'CALL';
  expiresInSeconds: number;
  /** Cooldown do "Reenviar código" — 59s, como no protótipo. */
  resendInSeconds: number;
}

/** Resposta da verificação de OTP: ou entra na conta, ou libera a troca de senha. */
export type OtpVerifyResult =
  | { kind: 'session'; session: ClientSession }
  | { kind: 'password-reset'; resetToken: string; expiresInSeconds: number };

// ── Regras de validação (idênticas na API e no formulário) ──────────────────

/**
 * Caracteres especiais aceitos — lista EXPLÍCITA, e não "tudo que não é letra
 * nem dígito".
 *
 * A diferença importa na prática: `ç`, `á` e `ã` são LETRAS, não especiais.
 * Quem digitasse `Senhaç123` com uma regra frouxa veria o requisito acender
 * sem entender por quê; com esta lista, o requisito só acende com um dos
 * caracteres abaixo — e a tela mostra quais são.
 *
 * Espaço fica de fora de propósito: senha que depende de um espaço no fim é
 * senha que o usuário perde ao copiar e colar.
 */
export const PASSWORD_SPECIAL_CHARS = '!@#$%^&*()-_=+[]{};:\'",.<>/?\\|`~';

const SPECIAL_RE = new RegExp(`[${PASSWORD_SPECIAL_CHARS.replace(/[\\^\]-]/g, '\\$&')}]`);

/** Comprimento mínimo — o mesmo número que a tela promete no placeholder. */
export const PASSWORD_MIN_LENGTH = 8;

/**
 * Os QUATRO requisitos da senha, avaliados um a um.
 *
 * Quatro, não cinco: **minúscula não é requisito** (decidido pelo dono do
 * produto em 2026-09-04). `SENHA@2026` é senha válida. A lista da tela e as
 * quatro barrinhas do `PasswordInput` saem daqui, então elas batem com o 400
 * do servidor por construção — não por coincidência.
 */
export interface PasswordChecks {
  /** Pelo menos 8 caracteres. */
  length: boolean;
  /** Pelo menos uma letra maiúscula (`Ç` e `Á` contam — são maiúsculas). */
  upper: boolean;
  /** Pelo menos um dígito. */
  digit: boolean;
  /** Pelo menos um de `PASSWORD_SPECIAL_CHARS`. */
  special: boolean;
}

export function passwordChecks(password: string): PasswordChecks {
  const value = password ?? '';
  return {
    length: value.length >= PASSWORD_MIN_LENGTH,
    upper: /\p{Lu}/u.test(value),
    digit: /\d/.test(value),
    special: SPECIAL_RE.test(value),
  };
}

/** Rótulos dos requisitos — a MESMA lista que a tela desenha, na mesma ordem. */
export const PASSWORD_REQUIREMENT_LABELS: ReadonlyArray<{ key: keyof PasswordChecks; label: string }> = [
  { key: 'length', label: 'Mínimo 8 caracteres' },
  { key: 'upper', label: 'Uma letra maiúscula' },
  { key: 'digit', label: 'Um número' },
  { key: 'special', label: `Um caractere especial (${PASSWORD_SPECIAL_CHARS.slice(0, 8)}…)` },
];

/** Mensagem única de recusa — API e formulário dizem a MESMA frase. */
export const PASSWORD_RULE_MESSAGE =
  'A senha precisa de no mínimo 8 caracteres, com maiúscula, número e caractere especial.';

/** Senha válida = os quatro requisitos atendidos. Nada além disso. */
export function isPasswordValid(password: string): boolean {
  const checks = passwordChecks(password);
  return checks.length && checks.upper && checks.digit && checks.special;
}

/**
 * Força da senha = quantos dos QUATRO requisitos ela cumpre.
 *
 * Antes a escada era própria (8 chars → +letra/número → +10 chars → +especial)
 * e não tinha relação com o que o servidor exigia. Agora uma barra por
 * requisito: as 4 barrinhas e a lista de ✓/○ contam a mesma história, e "4 de
 * 4" é exatamente o ponto em que o botão para de devolver 400.
 */
export function passwordStrength(password: string): 0 | 1 | 2 | 3 | 4 {
  if (!password) return 0;
  const checks = passwordChecks(password);
  const met = [checks.length, checks.upper, checks.digit, checks.special].filter(Boolean).length;
  return met as 0 | 1 | 2 | 3 | 4;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

/**
 * Telefone brasileiro em E.164 sem `+` — `5516999990001`.
 *
 * O protótipo trabalha com 11 dígitos (DDD + 9 + número). Guardamos com o 55
 * na frente porque `Client.phone` é a identidade global do cliente e o WhatsApp
 * exige o código do país.
 */
export function normalizePhone(input: string): string | null {
  const digits = (input ?? '').replace(/\D/g, '');
  const local = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
  // 11 dígitos = celular com o 9; 10 = fixo (aceito no telefone da barbearia).
  if (local.length !== 11 && local.length !== 10) return null;
  return `55${local}`;
}

/** Só celular serve de identidade do cliente — fixo não recebe WhatsApp/SMS. */
export function normalizeMobilePhone(input: string): string | null {
  const normalized = normalizePhone(input);
  if (!normalized || normalized.length !== 13) return null;
  return normalized;
}

/** `5516999990001` → `(16) 9 9999-9001` — a máscara de `ClienteAuth`. */
export function formatPhone(e164: string): string {
  const local = e164.replace(/\D/g, '').replace(/^55/, '');
  if (local.length === 11) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 3)} ${local.slice(3, 7)}-${local.slice(7)}`;
  }
  if (local.length === 10) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  }
  return e164;
}

/** `(16) 9 ****-9001` — usado no cabeçalho da tela de OTP. */
export function maskPhoneForDisplay(e164: string): string {
  const local = e164.replace(/\D/g, '').replace(/^55/, '');
  if (local.length !== 11) return formatPhone(e164);
  return `(${local.slice(0, 2)}) ${local.slice(2, 3)} ****-${local.slice(7)}`;
}

/** `lucas.andrade@email.com` → `l***********e@email.com`. */
export function maskEmailForDisplay(email: string): string {
  const [user = '', domain = ''] = email.split('@');
  if (!domain) return email;
  const visible = user.length <= 2 ? user : `${user[0]}${'*'.repeat(user.length - 2)}${user.at(-1)}`;
  return `${visible}@${domain}`;
}

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;
export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 63;

/**
 * Slug da URL pública (`/agendar/{slug}`) — a mesma normalização que o
 * `onBizSlug` do wizard aplica enquanto se digita: minúsculas e `[a-z0-9-]`.
 */
export function slugify(input: string): string {
  return (input ?? '')
    .normalize('NFD')
    // Remove os acentos que a decomposição isolou (bloco combining marks).
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, '');
}

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}

/** Iniciais para o avatar do card de vínculo (`Lucas Andrade` → `LA`). */
export function initialsFromName(name: string): string {
  return (name ?? '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase();
}
