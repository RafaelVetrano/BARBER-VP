import type { Metadata, Viewport } from 'next';
import { Inter, Sora } from 'next/font/google';
import { colors } from '@barbervp/config/tokens';
import './globals.css';

/**
 * Layout RAIZ do frontend único (fase 11).
 *
 * Aqui mora só o que é universal às quatro superfícies: `<html>`/`<body>`, as
 * fontes e a folha de estilo global. Providers, metadata de indexação e tema
 * ficam no layout de cada route group — `(marketing)`, `(booking)`,
 * `(dashboard)` e `(admin)` têm exigências diferentes, e misturá-las aqui faria
 * a landing carregar TanStack Query e disparar refresh de sessão à toa.
 */

// Sora nos títulos, Inter no corpo (SPEC.md → Design system).
const sora = Sora({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-sora',
  display: 'swap',
});

// 800/900 entram por causa da landing de vendas (fase 10): ela é só Inter, sem
// Sora, e os títulos do protótipo são 800. Declarar o peso não baixa o arquivo:
// o navegador só busca a face que a página realmente renderiza.
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'BarberVP',
    template: '%s · BarberVP',
  },
  description: 'Sistema de gestão para barbearias: agenda, comandas, financeiro e clube de assinaturas.',
};

export const viewport: Viewport = {
  // Tema escuro fixo — o produto não tem alternância claro/escuro. A landing é
  // a única exceção e sobrescreve este `viewport` na própria rota.
  themeColor: colors.bg,
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${sora.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
