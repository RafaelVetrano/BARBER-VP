import type { AxiosInstance } from 'axios';
import type {
  AuthClient,
  AuthMembership,
  AuthUser,
  CepLookupResult,
  ChangeClientPasswordInput,
  ClientSession,
  EmailCheckResult,
  EstablishmentSession,
  ExportedClientData,
  OnboardingState,
  OtpChallenge,
  OtpVerifyResult,
  SlugAvailability,
  UpdateClientProfileInput,
} from '@barbervp/types';

/**
 * Chamadas de auth e onboarding, tipadas pelos contratos de `@barbervp/types`.
 *
 * Cada função recebe o `AxiosInstance` em vez de importar o singleton: assim os
 * providers das quatro apps usam o MESMO código, e um teste pode passar um
 * cliente próprio.
 */

// ── Estabelecimento ─────────────────────────────────────────────────────────

export interface RegisterEstablishmentInput {
  name: string;
  phone: string;
  email: string;
  password: string;
  shopName: string;
  acceptTerms: boolean;
}

export interface LinkClientAccountInput {
  email: string;
  password: string;
  shopName: string;
  acceptTerms: boolean;
}

export const establishmentApi = {
  checkEmail: async (client: AxiosInstance, email: string): Promise<EmailCheckResult> =>
    (await client.post<EmailCheckResult>('/auth/check-email', { email })).data,

  register: async (
    client: AxiosInstance,
    input: RegisterEstablishmentInput,
  ): Promise<EstablishmentSession> =>
    (await client.post<EstablishmentSession>('/auth/register', input)).data,

  linkAccount: async (
    client: AxiosInstance,
    input: LinkClientAccountInput,
  ): Promise<EstablishmentSession> =>
    (await client.post<EstablishmentSession>('/auth/register/link', input)).data,

  login: async (
    client: AxiosInstance,
    input: { email: string; password: string; tenantId?: string },
  ): Promise<EstablishmentSession> =>
    (await client.post<EstablishmentSession>('/auth/login', input)).data,

  refresh: async (client: AxiosInstance): Promise<EstablishmentSession> =>
    (await client.post<EstablishmentSession>('/auth/refresh')).data,

  logout: async (client: AxiosInstance): Promise<void> => {
    await client.post('/auth/logout');
  },

  me: async (client: AxiosInstance): Promise<AuthUser & { memberships: AuthMembership[] }> =>
    (await client.get<AuthUser & { memberships: AuthMembership[] }>('/auth/me')).data,

  switchContext: async (client: AxiosInstance, tenantId: string): Promise<EstablishmentSession> =>
    (await client.post<EstablishmentSession>('/auth/context', { tenantId })).data,

  changePassword: async (
    client: AxiosInstance,
    input: { currentPassword: string; newPassword: string },
  ): Promise<void> => {
    await client.post('/auth/password/change', input);
  },

  forgotPassword: async (client: AxiosInstance, email: string): Promise<{ message: string }> =>
    (await client.post<{ message: string }>('/auth/password/forgot', { email })).data,

  resetPassword: async (
    client: AxiosInstance,
    input: { token: string; password: string },
  ): Promise<void> => {
    await client.post('/auth/password/reset', input);
  },
};

// ── Cliente final ───────────────────────────────────────────────────────────

export interface ClientRegisterInput {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  confirmEmail: string;
  password: string;
  confirmPassword: string;
  acceptTerms: boolean;
  marketingOptIn: boolean;
}

export const clientApi = {
  login: async (
    client: AxiosInstance,
    input: { identifier: string; password: string },
  ): Promise<ClientSession> =>
    (await client.post<ClientSession>('/client-auth/login', input)).data,

  register: async (client: AxiosInstance, input: ClientRegisterInput): Promise<OtpChallenge> =>
    (await client.post<OtpChallenge>('/client-auth/register', input)).data,

  verifyOtp: async (
    client: AxiosInstance,
    input: { challengeId: string; code: string },
  ): Promise<OtpVerifyResult> =>
    (await client.post<OtpVerifyResult>('/client-auth/otp/verify', input)).data,

  resendOtp: async (
    client: AxiosInstance,
    input: { challengeId: string; channel?: 'WHATSAPP' | 'SMS' | 'EMAIL' },
  ): Promise<OtpChallenge> =>
    (await client.post<OtpChallenge>('/client-auth/otp/resend', input)).data,

  requestCall: async (client: AxiosInstance, challengeId: string): Promise<OtpChallenge> =>
    (await client.post<OtpChallenge>('/client-auth/otp/call', { challengeId })).data,

  forgotPassword: async (client: AxiosInstance, identifier: string): Promise<OtpChallenge> =>
    (await client.post<OtpChallenge>('/client-auth/password/forgot', { identifier })).data,

  resetPassword: async (
    client: AxiosInstance,
    input: { resetToken: string; password: string; confirmPassword: string },
  ): Promise<void> => {
    await client.post('/client-auth/password/reset', input);
  },

  refresh: async (client: AxiosInstance): Promise<ClientSession> =>
    (await client.post<ClientSession>('/client-auth/refresh')).data,

  logout: async (client: AxiosInstance): Promise<void> => {
    await client.post('/client-auth/logout');
  },

  me: async (client: AxiosInstance): Promise<AuthClient> =>
    (await client.get<AuthClient>('/client-auth/me')).data,

  // ── "Meus dados" (fase 05) ─────────────────────────────────────────────

  updateProfile: async (
    client: AxiosInstance,
    input: UpdateClientProfileInput,
  ): Promise<AuthClient> => (await client.patch<AuthClient>('/client-auth/me', input)).data,

  requestPhoneChange: async (client: AxiosInstance, phone: string): Promise<OtpChallenge> =>
    (await client.post<OtpChallenge>('/client-auth/me/phone', { phone })).data,

  confirmPhoneChange: async (
    client: AxiosInstance,
    input: { challengeId: string; code: string },
  ): Promise<AuthClient> => (await client.post<AuthClient>('/client-auth/me/phone/confirm', input)).data,

  changePassword: async (client: AxiosInstance, input: ChangeClientPasswordInput): Promise<void> => {
    await client.post('/client-auth/password/change', input);
  },

  // ── LGPD (regra 6) ───────────────────────────────────────────────────────

  exportData: async (client: AxiosInstance): Promise<ExportedClientData> =>
    (await client.get<ExportedClientData>('/client-auth/me/export')).data,

  deleteAccount: async (client: AxiosInstance): Promise<void> => {
    await client.post('/client-auth/me/delete', { confirm: true });
  },
};

// ── Onboarding ──────────────────────────────────────────────────────────────

export const onboardingApi = {
  getState: async (client: AxiosInstance): Promise<OnboardingState> =>
    (await client.get<OnboardingState>('/onboarding')).data,

  checkSlug: async (client: AxiosInstance, slug: string): Promise<SlugAvailability> =>
    (await client.get<SlugAvailability>('/onboarding/slug', { params: { slug } })).data,

  lookupCep: async (client: AxiosInstance, cep: string): Promise<CepLookupResult> =>
    (await client.get<CepLookupResult>(`/onboarding/cep/${cep.replace(/\D/g, '')}`)).data,

  saveProfile: async (
    client: AxiosInstance,
    input: OnboardingState['profile'],
  ): Promise<OnboardingState> =>
    (await client.put<OnboardingState>('/onboarding/profile', input)).data,

  saveLocation: async (
    client: AxiosInstance,
    input: OnboardingState['location'],
  ): Promise<OnboardingState> =>
    (await client.put<OnboardingState>('/onboarding/location', input)).data,

  saveIdentity: async (
    client: AxiosInstance,
    input: OnboardingState['identity'],
  ): Promise<OnboardingState> =>
    (await client.put<OnboardingState>('/onboarding/identity', input)).data,

  saveServices: async (
    client: AxiosInstance,
    services: OnboardingState['services'],
  ): Promise<OnboardingState> =>
    (await client.put<OnboardingState>('/onboarding/services', { services })).data,

  saveTeam: async (
    client: AxiosInstance,
    barbers: Array<{ id?: string; name: string; phone?: string | null }>,
  ): Promise<OnboardingState> =>
    (await client.put<OnboardingState>('/onboarding/team', { barbers })).data,

  saveBusinessHours: async (
    client: AxiosInstance,
    hours: OnboardingState['businessHours'],
  ): Promise<OnboardingState> =>
    (await client.put<OnboardingState>('/onboarding/business-hours', { hours })).data,

  complete: async (client: AxiosInstance): Promise<OnboardingState> =>
    (await client.post<OnboardingState>('/onboarding/complete')).data,
};
