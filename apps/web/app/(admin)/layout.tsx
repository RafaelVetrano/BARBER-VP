import type { Metadata } from 'next';
import { EstablishmentProviders } from '../providers';

/**
 * Super Admin (`/admin/*`) — superfície interna, fora do índice (SPEC.md).
 *
 * Usa a MESMA sessão de estabelecimento: o `SUPER_ADMIN` é um `User` com a flag
 * `isSuperAdmin`, não uma audiência à parte. O `QueryClient` é próprio deste
 * grupo, separado do cache do painel.
 */
export const metadata: Metadata = {
  title: {
    default: 'BarberVP — Super Admin',
    template: '%s · BarberVP',
  },
  description: 'Tenants, planos do SaaS, billing e impersonação auditada.',
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <EstablishmentProviders>{children}</EstablishmentProviders>;
}
