import type { Metadata, Viewport } from 'next';
import { Inter, Sora } from 'next/font/google';
import { colors } from '@barbervp/config/tokens';
import { Providers } from './providers';
import './globals.css';

// Sora nos títulos, Inter no corpo (SPEC.md → Design system).
const sora = Sora({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-sora',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'BarberVP — Dashboard da barbearia',
    template: '%s · BarberVP',
  },
  description: 'Agenda, equipe, comandas, financeiro, fidelidade e configurações.',
  // Superfície interna — fora do índice de busca (SPEC.md).
  robots: { index: false, follow: false, nocache: true },
};

export const viewport: Viewport = {
  // Tema escuro fixo — o produto não tem alternância claro/escuro.
  themeColor: colors.bg,
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${sora.variable} ${inter.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
