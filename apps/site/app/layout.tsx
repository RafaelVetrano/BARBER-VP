import type { Metadata, Viewport } from 'next';
import { Inter, Sora } from 'next/font/google';
import { colors } from '@barbervp/config/tokens';
import './globals.css';

// Sora nos títulos, Inter no corpo (SPEC.md → Design system).
const sora = Sora({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-sora',
  display: 'swap',
});

// 800/900 entram por causa da landing de vendas (fase 10): ela é só Inter, sem
// Sora, e os títulos do protótipo são 800.
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'BarberVP — Site institucional',
    template: '%s · BarberVP',
  },
  description: 'Landing de vendas do SaaS, cadastro e login de estabelecimento.',
  robots: { index: true, follow: true },
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
      {/* Sem `Providers` aqui: eles moram em `(auth)/layout.tsx`, porque a
          landing não tem sessão, query nem toast para gerenciar — e pagava
          três `POST /auth/refresh` de 401 por visita. */}
      <body>{children}</body>
    </html>
  );
}
