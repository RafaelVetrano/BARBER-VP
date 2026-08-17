import type { ReactNode } from 'react';
import { cn } from '@barbervp/ui';

export interface AuthSplitLayoutProps {
  /** Painel da esquerda: arte, headline e prova social. */
  aside: ReactNode;
  children: ReactNode;
  /** Proporção do painel de arte no desktop (o protótipo usa 45% e 50%). */
  asideWidth?: '45' | '50';
}

/**
 * Moldura das telas de auth do site — o split de duas colunas dos protótipos
 * `Login Estabelecimento` e `Cadastro Estabelecimento`.
 *
 * Responsividade (regra 1): o protótipo é desktop-fixo e só colapsa em
 * `max-width: 860px`. Aqui a construção é mobile-first — uma coluna por padrão,
 * com o painel de arte virando uma faixa curta no topo — e o split só entra a
 * partir de `lg` (1024px), largura em que as duas colunas realmente cabem sem
 * espremer o formulário de 432px.
 */
export function AuthSplitLayout({ aside, children, asideWidth = '45' }: AuthSplitLayoutProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg lg:flex-row">
      <aside
        className={cn(
          'relative isolate flex shrink-0 flex-col justify-between overflow-hidden',
          // Mobile: faixa de identidade; desktop: coluna inteira.
          'min-h-[13rem] px-6 py-6 lg:min-h-dvh lg:px-12 lg:py-12',
          asideWidth === '45' ? 'lg:w-[45%]' : 'lg:w-1/2',
        )}
      >
        {aside}
      </aside>

      <main
        className={cn(
          'relative flex flex-1 flex-col items-center bg-surface',
          'px-5 py-10 sm:px-8 lg:justify-center lg:px-12 lg:py-16',
        )}
      >
        {/* O fio dourado do protótipo: horizontal no mobile, vertical no desktop. */}
        <span
          aria-hidden="true"
          className={cn(
            'absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold to-transparent',
            'lg:inset-y-0 lg:left-0 lg:right-auto lg:h-auto lg:w-px lg:bg-gradient-to-b',
          )}
        />
        <div className="w-full max-w-[27rem]">{children}</div>
      </main>
    </div>
  );
}
