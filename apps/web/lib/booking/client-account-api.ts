import type { AxiosInstance } from 'axios';
import type {
  ClientAppointmentItem,
  ClientAppointmentsResponse,
  ClientPlanDetail,
  ClientSubscriptionAccount,
  ClientSubscriptionDetail,
  RateAppointmentInput,
  SubscribeInput,
} from '@barbervp/types';

/**
 * Chamadas de `MinhaConta`/`AssinaturaCliente` escopadas à barbearia da URL
 * (`/public/:slug/account/*`). O perfil, a senha e a LGPD são GLOBAIS — essas
 * ficam em `clientApi` de `@barbervp/ui` (a mesma casa do `clientApi.me`).
 */
export const clientAccountApi = {
  async appointments(api: AxiosInstance, slug: string): Promise<ClientAppointmentsResponse> {
    const { data } = await api.get<ClientAppointmentsResponse>(`/public/${slug}/account/appointments`);
    return data;
  },

  async rate(
    api: AxiosInstance,
    slug: string,
    appointmentId: string,
    input: RateAppointmentInput,
  ): Promise<ClientAppointmentItem> {
    const { data } = await api.post<ClientAppointmentItem>(
      `/public/${slug}/account/appointments/${appointmentId}/rate`,
      input,
    );
    return data;
  },

  async plans(api: AxiosInstance, slug: string): Promise<ClientPlanDetail[]> {
    const { data } = await api.get<ClientPlanDetail[]>(`/public/${slug}/account/subscription/plans`);
    return data;
  },

  async subscription(api: AxiosInstance, slug: string): Promise<ClientSubscriptionAccount> {
    const { data } = await api.get<ClientSubscriptionAccount>(`/public/${slug}/account/subscription`);
    return data;
  },

  async subscribe(api: AxiosInstance, slug: string, input: SubscribeInput): Promise<ClientSubscriptionDetail> {
    const { data } = await api.post<ClientSubscriptionDetail>(`/public/${slug}/account/subscription`, input);
    return data;
  },

  async pause(api: AxiosInstance, slug: string): Promise<ClientSubscriptionDetail> {
    const { data } = await api.post<ClientSubscriptionDetail>(`/public/${slug}/account/subscription/pause`);
    return data;
  },

  async resume(api: AxiosInstance, slug: string): Promise<ClientSubscriptionDetail> {
    const { data } = await api.post<ClientSubscriptionDetail>(`/public/${slug}/account/subscription/resume`);
    return data;
  },

  async cancel(api: AxiosInstance, slug: string): Promise<ClientSubscriptionDetail> {
    const { data } = await api.post<ClientSubscriptionDetail>(`/public/${slug}/account/subscription/cancel`);
    return data;
  },
};
