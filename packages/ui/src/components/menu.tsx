'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { MoreIcon } from '../icons';
import { cn } from '../lib/cn';
import { IconButton } from './button';

export interface MenuItem {
  label: ReactNode;
  onSelect: () => void;
  /** Ação destrutiva — rótulo em vermelho, separada por uma linha acima. */
  destructive?: boolean;
  disabled?: boolean;
}

export interface MenuProps {
  items: MenuItem[];
  /** Nome acessível do gatilho (ex.: "Ações de João Pedro"). */
  label: string;
  /** Alinhamento do painel em relação ao gatilho. */
  align?: 'start' | 'end';
  /**
   * Conteúdo do gatilho. Padrão: o kebab `⋯` das tabelas.
   *
   * A página pública do booking usa o avatar do cliente no lugar — mesma
   * mecânica de menu (teclado, ESC, clique fora), gatilho diferente.
   */
  trigger?: ReactNode;
  className?: string;
}

/**
 * Menu kebab — o `⋯` das tabelas do `Dashboard.dc.html`.
 *
 * Fecha no ESC, no clique fora e ao escolher um item; navega com ↑/↓. É o
 * lugar das ações secundárias quando a `ResponsiveTable` colapsa em cards.
 */
export function Menu({ items, label, align = 'end', trigger, className }: MenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const focusItem = (index: number) => {
    const buttons = rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    if (!buttons?.length) return;
    const target = buttons[(index + buttons.length) % buttons.length];
    target?.focus();
  };

  return (
    <div ref={rootRef} className={cn('relative shrink-0', className)}>
      <IconButton
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        size="sm"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
            requestAnimationFrame(() => focusItem(0));
          }
        }}
      >
        {trigger ?? <MoreIcon size={18} />}
      </IconButton>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className={cn(
            'absolute top-[calc(100%+4px)] z-40 w-44 animate-bvp-fade rounded-xl border border-border bg-surface-3 p-1.5 shadow-menu',
            align === 'end' ? 'right-0' : 'left-0',
          )}
        >
          {items.map((item, index) => (
            <button
              // Os itens do menu são fixos por linha e não reordenam.
              // eslint-disable-next-line react/no-array-index-key
              key={index}
              role="menuitem"
              type="button"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  focusItem(index + 1);
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  focusItem(index - 1);
                }
              }}
              className={cn(
                'block w-full rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold',
                'disabled:cursor-not-allowed disabled:opacity-40',
                item.destructive
                  ? 'mt-1 border-t border-border pt-2 text-danger hover:bg-danger/10'
                  : 'text-fg hover:bg-surface-2',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
