import type { Metadata } from 'next';
import { EstablishmentProviders } from '../providers';

/** Painel da barbearia (`/app/*`) — superfície interna, fora do índice (SPEC.md). */
export const metadata: Metadata = {
  title: {
    default: 'BarberVP — Dashboard da barbearia',
    template: '%s · BarberVP',
  },
  description: 'Agenda, equipe, comandas, financeiro, fidelidade e configurações.',
  robots: { index: false, follow: false, nocache: true },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <EstablishmentProviders>{children}</EstablishmentProviders>;
}
