import type { AxiosInstance } from 'axios';
import type {
  AppointmentSummary,
  AvailabilityResponse,
  BookingQuote,
  CreateAppointmentResult,
  PublicBarbershop,
} from '@barbervp/types';

/**
 * Chamadas do booking a partir do NAVEGADOR.
 *
 * Usa a instância axios do `ClientAuthProvider`: é ela que anexa o access token
 * quando há sessão (para o selo "Incluído na assinatura" e para o agendamento
 * sair na conta certa) e renova em silêncio quando expira. Sem sessão, as
 * mesmas rotas respondem a versão anônima — nenhuma delas exige token.
 */
export const bookingApi = {
  /** Recarrega a página pública já com o que depende da sessão. */
  async page(api: AxiosInstance, slug: string): Promise<PublicBarbershop> {
    const { data } = await api.get<PublicBarbershop>(`/public/${slug}`);
    return data;
  },

  /** Preço, combo e cobertura de assinatura da seleção corrente. */
  async quote(api: AxiosInstance, slug: string, serviceIds: string[]): Promise<BookingQuote> {
    const { data } = await api.get<BookingQuote>(`/public/${slug}/quote`, {
      params: { serviceIds: serviceIds.join(',') },
    });
    return data;
  },

  async availability(
    api: AxiosInstance,
    slug: string,
    params: { serviceIds: string[]; barberId?: string | null; date?: string; days?: number },
  ): Promise<AvailabilityResponse> {
    const { data } = await api.get<AvailabilityResponse>(`/public/${slug}/availability`, {
      params: {
        serviceIds: params.serviceIds.join(','),
        ...(params.barberId ? { barberId: params.barberId } : {}),
        ...(params.date ? { date: params.date } : {}),
        ...(params.days ? { days: params.days } : {}),
      },
    });
    return data;
  },

  async create(
    api: AxiosInstance,
    slug: string,
    body: {
      serviceIds: string[];
      barberId?: string | null;
      startsAt: string;
      notes?: string;
      guestName?: string;
      guestPhone?: string;
    },
  ): Promise<CreateAppointmentResult> {
    const { data } = await api.post<CreateAppointmentResult>(`/public/${slug}/appointments`, body);
    return data;
  },

  /** Segunda metade do guest booking verificado. */
  async confirm(
    api: AxiosInstance,
    slug: string,
    body: { challengeId: string; code: string },
  ): Promise<CreateAppointmentResult> {
    const { data } = await api.post<CreateAppointmentResult>(
      `/public/${slug}/appointments/confirm`,
      body,
    );
    return data;
  },

  async cancel(
    api: AxiosInstance,
    slug: string,
    code: string,
    body: { phone?: string; reason?: string },
  ): Promise<AppointmentSummary> {
    const { data } = await api.post<AppointmentSummary>(
      `/public/${slug}/appointments/${code}/cancel`,
      body,
    );
    return data;
  },

  /** Remarcar da `MinhaConta` (fase 05) — mesmo endpoint da fase 04. */
  async reschedule(
    api: AxiosInstance,
    slug: string,
    code: string,
    body: { startsAt: string; barberId?: string | null; phone?: string },
  ): Promise<AppointmentSummary> {
    const { data } = await api.post<AppointmentSummary>(
      `/public/${slug}/appointments/${code}/reschedule`,
      body,
    );
    return data;
  },
};
