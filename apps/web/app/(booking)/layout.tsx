import type { Metadata } from 'next';
import { ClientProviders } from '../providers';

/**
 * Superfície de BOOKING público — `/{slug}` e a raiz explicativa `/agendar`.
 * Indexada: a página da barbearia é o cartão de visitas do negócio.
 */
export const metadata: Metadata = {
  title: {
    default: 'BarberVP — Booking público',
    template: '%s · BarberVP',
  },
  description: 'Página pública da barbearia por slug, wizard de agendamento e área do cliente.',
  robots: { index: true, follow: true },
};

export default function BookingLayout({ children }: { children: React.ReactNode }) {
  return <ClientProviders>{children}</ClientProviders>;
}
