'use client';

import { useState } from 'react';
import { ToastProvider } from '@barbervp/ui';
import { Gallery } from './gallery';

/** Os 3 breakpoints de referência do projeto (agentes/agente-02). */
const VIEWPORTS = [
  { label: 'Nativo', width: null },
  { label: '360', width: 360 },
  { label: '768', width: 768 },
  { label: '1440', width: 1440 },
] as const;

/**
 * Casca do playground: barra de inspeção + galeria.
 *
 * Escolher 360/768/1440 recarrega a mesma rota dentro de um `<iframe>` com
 * aquela largura exata (`?frame=1` esconde esta barra), então o que se vê é a
 * página renderizada de verdade naquele breakpoint — media query, container
 * query e scroll incluídos —, e não um `transform: scale`.
 */
export function PlaygroundShell() {
  const [width, setWidth] = useState<number | null>(null);

  return (
    <ToastProvider>
      <div className="min-h-dvh bg-bg">
        <div className="sticky top-0 z-40 flex flex-wrap items-center gap-3 border-b border-border bg-bg/95 px-4 py-3 backdrop-blur sm:px-6">
          <span className="text-[11px] uppercase tracking-wide text-fg-muted">Viewport</span>
          <div
            role="radiogroup"
            aria-label="Largura de inspeção"
            className="flex gap-1 rounded-xl border border-border bg-surface-2 p-1"
          >
            {VIEWPORTS.map((viewport) => {
              const selected = width === viewport.width;
              return (
                <button
                  key={viewport.label}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setWidth(viewport.width)}
                  className={[
                    'h-11 md:h-8 rounded-lg px-3 text-[13px] font-semibold transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold',
                    selected ? 'bg-gold text-bg' : 'text-fg-muted hover:text-fg',
                  ].join(' ')}
                >
                  {viewport.label}
                </button>
              );
            })}
          </div>
          <a
            href="/playground/shell"
            className="ml-auto flex min-h-11 items-center text-[13px] font-semibold text-gold underline md:min-h-0"
          >
            Ver AppShell
          </a>
        </div>

        {width === null ? (
          <Gallery />
        ) : (
          <div className="overflow-x-auto p-4 sm:p-6">
            <div className="mx-auto w-fit">
              <p className="mb-2 text-[11px] uppercase tracking-wide text-fg-muted">{width}px</p>
              <iframe
                key={width}
                title={`Playground em ${width}px`}
                src="/playground?frame=1"
                width={width}
                className="h-[80dvh] rounded-2xl border border-border bg-bg"
              />
            </div>
          </div>
        )}
      </div>
    </ToastProvider>
  );
}
