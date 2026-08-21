import type { Metadata } from 'next';

/**
 * Superfície de MARKETING: landing de vendas, login, cadastro e recuperação de
 * senha do estabelecimento. É indexada (SPEC.md).
 *
 * Sem providers aqui de propósito — a landing é anônima por definição, e o
 * `EstablishmentAuthProvider` disparava um `POST /auth/refresh` que só podia dar
 * 401 antes da página ficar interativa, na única página do produto cuja
 * velocidade decide se alguém vira cliente. Quem precisa de sessão está no
 * grupo `(auth)` aninhado, que monta os providers.
 */
export const metadata: Metadata = {
  title: {
    default: 'BarberVP — Site institucional',
    template: '%s · BarberVP',
  },
  description: 'Landing de vendas do SaaS, cadastro e login de estabelecimento.',
  robots: { index: true, follow: true },
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
