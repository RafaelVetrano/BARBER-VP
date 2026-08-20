'use client';

import { useCallback, useEffect, useState } from 'react';
import { NAV_LINKS, signupHref } from './content';
import { SCROLL_OFFSET_PX } from './palette';

/**
 * Nav sticky da landing.
 *
 * Ilha client por dois motivos: o scroll suave com deslocamento (a nav sticky
 * cobriria o título da seção) e o drawer de mobile. O protótipo é desktop-fixo e
 * não tem versão mobile da nav — abaixo de `md` as âncoras viram hambúrguer,
 * como manda `responsividade.md`.
 */
export function LandingNav() {
  const [open, setOpen] = useState(false);

  const goTo = useCallback((id: string) => {
    setOpen(false);
    const el = document.getElementById(id);
    if (!el) {
      return;
    }
    // `scrollTo` absoluto (e não `scrollIntoView`) porque só ele aceita o
    // deslocamento da nav sticky. `prefers-reduced-motion` desliga o `smooth`:
    // rolagem animada longa é gatilho de enjoo para quem pediu menos movimento.
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({
      top: el.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET_PX,
      behavior: reduce ? 'auto' : 'smooth',
    });
  }, []);

  // Drawer aberto trava o scroll do fundo; Esc fecha. Sem isso o usuário rola a
  // página atrás do menu e se perde.
  useEffect(() => {
    if (!open) {
      return;
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <header
      className="sticky top-0 z-50 border-b border-[var(--bvp-line)] bg-[var(--bvp-header)] backdrop-blur-[14px]"
    >
      <div className="mx-auto flex h-[66px] max-w-[1180px] items-center gap-4 px-5 sm:px-6 md:gap-6">
        <a href="/" className="flex h-11 flex-shrink-0 items-center gap-2.5 no-underline">
          <span
            className="flex h-[30px] w-[30px] items-center justify-center rounded-lg text-[16px] font-extrabold"
            style={{
              background: `linear-gradient(135deg, var(--bvp-gold-2), var(--bvp-gold))`,
              color: 'var(--bvp-on-gold)',
              boxShadow: '0 2px 12px rgba(232,163,61,.4)',
            }}
            aria-hidden
          >
            B
          </span>
          <span className="font-sans text-[18px] font-extrabold tracking-[-.4px] text-[var(--bvp-txt)]">
            Barber<span className="text-[var(--bvp-gold)]">VP</span>
          </span>
          <span className="ml-0.5 hidden rounded-[5px] border border-[var(--bvp-line-2)] px-1.5 py-0.5 text-[10px] font-semibold tracking-[.5px] text-[var(--bvp-txt-3)] lg:inline">
            PARA DONOS
          </span>
        </a>

        {/* Âncoras: só a partir de `md`. Abaixo disso vivem no drawer. */}
        <nav className="hidden min-w-0 flex-1 justify-center gap-4 md:flex lg:gap-[26px]">
          {NAV_LINKS.map((link) => (
            <button
              key={link.id}
              type="button"
              onClick={() => goTo(link.id)}
              className="whitespace-nowrap text-[14px] font-medium text-[var(--bvp-txt-2)] transition-colors hover:text-[var(--bvp-txt)]"
            >
              {link.label}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex flex-shrink-0 items-center gap-2 md:ml-0">
          <a
            href="/entrar"
            className="flex h-11 items-center px-1.5 text-[14px] font-semibold text-[var(--bvp-txt-2)] no-underline transition-colors hover:text-[var(--bvp-txt)]"
          >
            Entrar
          </a>
          <a
            href={signupHref()}
            className="hidden h-10 items-center whitespace-nowrap rounded-[10px] px-4 text-[13.5px] font-semibold no-underline transition-colors md:flex"
            style={{ background: 'var(--bvp-gold)', color: 'var(--bvp-on-gold)' }}
          >
            Teste grátis
          </a>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="bvp-nav-drawer"
            aria-label={open ? 'Fechar menu' : 'Abrir menu'}
            className="flex h-11 w-11 items-center justify-center rounded-[10px] border border-[var(--bvp-line-2)] text-[var(--bvp-txt)] md:hidden"
          >
            <span aria-hidden className="text-[18px] leading-none">
              {open ? '✕' : '☰'}
            </span>
          </button>
        </div>
      </div>

      {open ? (
        <div
          id="bvp-nav-drawer"
          className="border-t border-[var(--bvp-line)] bg-[var(--bvp-surface)] md:hidden"
        >
          <nav className="mx-auto flex max-w-[1180px] flex-col px-5 py-2">
            {NAV_LINKS.map((link) => (
              <button
                key={link.id}
                type="button"
                onClick={() => goTo(link.id)}
                className="flex min-h-[44px] items-center border-b border-[var(--bvp-line)] text-left text-[15px] font-medium text-[var(--bvp-txt)] last:border-b-0"
              >
                {link.label}
              </button>
            ))}
            <a
              href={signupHref()}
              className="mt-3 mb-3 flex min-h-[48px] items-center justify-center rounded-[11px] text-[15px] font-bold no-underline"
              style={{ background: 'var(--bvp-gold)', color: 'var(--bvp-on-gold)' }}
            >
              Teste grátis
            </a>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
