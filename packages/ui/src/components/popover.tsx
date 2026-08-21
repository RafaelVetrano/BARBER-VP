'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cn } from '../lib/cn';
import { useEscapeKey } from '../lib/use-overlay';

export interface PopoverProps {
  /** Nome acessível do gatilho e do painel. */
  label: string;
  /** Conteúdo do botão que abre o painel. */
  trigger: ReactNode;
  /** Cabeçalho do painel — visível só no bottom-sheet do mobile. */
  title?: ReactNode;
  /** Largura do painel no desktop, em px (240 no seletor de unidade, 320 no sino). */
  width?: number;
  /** Alinhamento do painel em relação ao gatilho, no desktop. */
  align?: 'start' | 'end';
  /** Classes do BOTÃO gatilho — o visual do gatilho é do chamador. */
  triggerClassName?: string;
  /**
   * Classes da RAIZ. O padrão é `shrink-0`, que é o certo para ícones de
   * tamanho fixo; um gatilho com texto que precisa truncar (o seletor de
   * unidade) passa `min-w-0 shrink` para poder encolher junto com a topbar.
   */
  className?: string;
  /** Controle externo (a busca abre por Ctrl+K, não só por clique). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Recebe uma função de fechar — itens do painel fecham ao serem escolhidos. */
  children: (close: () => void) => ReactNode;
}

/**
 * Painel suspenso da topbar do `Dashboard.dc.html` — seletor de unidade, sino
 * e menu do avatar.
 *
 * Duas diferenças deliberadas em relação ao protótipo:
 *
 * - **Bottom-sheet abaixo de 768px.** Um painel de 320px ancorado no canto
 *   direito não cabe numa tela de 360px; abaixo do corte ele vira sheet de
 *   largura total, o mesmo padrão do `Modal`/`Drawer` (regra 1).
 * - **O fundo é um elemento real.** O protótipo tem `anyMenuOpen`, um `<div>`
 *   fixo que fecha o menu ao clique; aqui ele existe pelo mesmo motivo e ainda
 *   escurece no mobile. Sem ele, clique fora não fecha e o menu fica preso
 *   aberto — que é exatamente o defeito apontado na auditoria.
 */
export function Popover({
  label,
  trigger,
  title,
  width = 240,
  align = 'end',
  triggerClassName,
  className,
  open: controlledOpen,
  onOpenChange,
  children,
}: PopoverProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);

  const setOpen = useCallback(
    (next: boolean) => {
      if (controlledOpen === undefined) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [controlledOpen, onOpenChange],
  );

  const close = useCallback(() => setOpen(false), [setOpen]);

  useEscapeKey(open, () => {
    close();
    triggerRef.current?.focus();
  });

  // Trava o scroll só enquanto o painel é sheet (mobile). No desktop ele é um
  // dropdown ancorado e travar a página seria gratuito.
  useEffect(() => {
    if (!open || typeof window === 'undefined') return;
    if (window.matchMedia('(min-width: 768px)').matches) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <div className={cn('relative shrink-0', className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen(!open)}
        className={cn(
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
          triggerClassName,
        )}
      >
        {trigger}
      </button>

      {open && (
        <>
          {/* O `anyMenuOpen` do protótipo: fecha ao clicar fora, em qualquer lugar. */}
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            onClick={close}
            className="fixed inset-0 z-40 cursor-default bg-black/60 md:bg-transparent"
          />

          <div
            id={panelId}
            role="dialog"
            aria-label={label}
            style={{ ['--bvp-popover-w' as string]: `${width}px` }}
            className={cn(
              'z-50 flex flex-col overflow-hidden border border-border bg-surface-3 shadow-menu',
              // ── Mobile: bottom-sheet ──
              'fixed inset-x-0 bottom-0 max-h-[80dvh] animate-bvp-up rounded-t-3xl',
              // ── ≥ 768px: dropdown ancorado no gatilho ──
              'md:absolute md:inset-x-auto md:bottom-auto md:top-[calc(100%+8px)]',
              'md:max-h-[70dvh] md:w-[var(--bvp-popover-w)] md:animate-bvp-fade md:rounded-xl',
              align === 'end' ? 'md:right-0' : 'md:left-0',
            )}
          >
            {title && (
              <p className="shrink-0 px-4 pb-2 pt-4 text-[13px] font-semibold text-fg md:px-2.5 md:pb-1 md:pt-2">
                {title}
              </p>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] md:pb-1.5">
              {children(close)}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export interface PopoverItemProps {
  children: ReactNode;
  onSelect?: () => void;
  /** Rótulo em vermelho (o "Sair" do menu do avatar). */
  destructive?: boolean;
  /** Item corrente — dourado sobre fundo dourado translúcido. */
  selected?: boolean;
  /** Ícone/selo à direita (o cadeado de "+ Nova unidade"). */
  trailing?: ReactNode;
  className?: string;
}

/** Linha do painel — 13px medium, raio 7px, como o protótipo. */
export function PopoverItem({
  children,
  onSelect,
  destructive,
  selected,
  trailing,
  className,
}: PopoverItemProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-center justify-between gap-2 rounded-[7px] px-2.5 py-2.5 text-left',
        'text-[13px] font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold',
        destructive
          ? 'text-danger hover:bg-danger/10'
          : selected
            ? 'bg-gold/10 text-gold'
            : 'text-fg hover:bg-surface-2',
        className,
      )}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing && <span className="shrink-0">{trailing}</span>}
    </button>
  );
}

/** Divisor do painel — a linha `#2A2F38` entre "Configurações" e "Sair". */
export function PopoverDivider() {
  return <div aria-hidden="true" className="my-1 h-px bg-border" />;
}
