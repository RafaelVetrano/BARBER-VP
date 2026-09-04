import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Moldura das páginas legais (`/privacidade`, `/termos`).
 *
 * Elas existem porque TRÊS telas do produto já apontavam para cá desde as
 * fases 03/05 e o agente 27 — o cadastro do estabelecimento, o registro do
 * cliente e o bloco "Privacidade e dados" de Meu perfil —, e as duas rotas
 * respondiam 404. Um aceite de termos que leva a lugar nenhum é pior do que
 * não pedir aceite.
 *
 * Layout próprio, e não a moldura da landing: aqui não há nav de vendas nem
 * âncoras de seção, só texto legível e o caminho de volta.
 */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-[760px] items-center justify-between px-5 py-5">
          <Link href="/" className="font-display text-lg font-bold text-fg">
            Barber<span className="text-gold">VP</span>
          </Link>
          <Link
            href="/"
            className="flex min-h-11 items-center text-[13px] font-medium text-fg-muted hover:text-fg"
          >
            Voltar ao site
          </Link>
        </div>
      </header>

      <main className="mx-auto flex max-w-[760px] flex-col gap-6 px-5 py-10 pb-20">{children}</main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[760px] flex-wrap items-center gap-x-5 gap-y-1 px-5 py-6 text-[13px] text-fg-muted">
          <Link href="/termos" className="flex min-h-11 items-center hover:text-fg">
            Termos de Uso
          </Link>
          <Link href="/privacidade" className="flex min-h-11 items-center hover:text-fg">
            Política de Privacidade
          </Link>
        </div>
      </footer>
    </div>
  );
}
