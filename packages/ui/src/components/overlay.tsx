'use client';

import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon } from '../icons';
import { cn } from '../lib/cn';
import {
  useEscapeKey,
  useFocusTrap,
  useIsMounted,
  useMountTransition,
  useScrollLock,
} from '../lib/use-overlay';
import { IconButton } from './button';

export interface OverlayProps {
  open: boolean;
  /** Chamado por ESC, clique no fundo e botão ✕. */
  onClose: () => void;
  /** Título do cabeçalho — também é o nome acessível do diálogo. */
  title?: ReactNode;
  /** Ações no canto do cabeçalho (à esquerda do ✕). */
  headerAction?: ReactNode;
  /** Rodapé fixo, fora da área rolável (CTA das sheets do protótipo). */
  footer?: ReactNode;
  /** Esconde o botão ✕. O ESC e o clique no fundo continuam valendo. */
  hideCloseButton?: boolean;
  /** Impede fechar clicando no fundo (fluxos com dados não salvos). */
  dismissOnOverlayClick?: boolean;
  /** Nome acessível quando não há `title` visível. */
  'aria-label'?: string;
  className?: string;
  children: ReactNode;
}

interface OverlayRootProps extends OverlayProps {
  /** Classes do painel — é o que diferencia `Modal` de `Drawer`. */
  panelClassName: string;
  durationMs: number;
}

/** Alça de arrastar do bottom-sheet — some no modal/drawer de desktop. */
function SheetHandle() {
  return (
    <span
      aria-hidden="true"
      className="absolute left-1/2 top-2.5 z-10 h-1 w-9 -translate-x-1/2 rounded-full bg-border md:hidden"
    />
  );
}

/**
 * Base de `Modal` e `Drawer`: portal, trava de scroll, foco preso, ESC,
 * clique no fundo e transição de entrada/saída.
 *
 * A responsividade é **só CSS**: o protótipo trocava de layout com
 * `ResizeObserver`/`window.innerWidth >= 768`, aqui o mesmo corte de 768px
 * (`md:` do Tailwind) vive nas classes. Além de dispensar JS, some o risco de
 * divergência entre servidor e cliente na hidratação.
 */
function OverlayRoot({
  open,
  onClose,
  title,
  headerAction,
  footer,
  hideCloseButton,
  dismissOnOverlayClick = true,
  className,
  panelClassName,
  durationMs,
  children,
  ...rest
}: OverlayRootProps) {
  const isMounted = useIsMounted();
  const { mounted, state } = useMountTransition(open, durationMs);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useScrollLock(mounted);
  useFocusTrap(panelRef, mounted && state === 'open');
  useEscapeKey(mounted, onClose);

  if (!isMounted || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex" data-state={state}>
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={dismissOnOverlayClick ? onClose : undefined}
        className={cn(
          'absolute inset-0 cursor-default bg-black transition-opacity duration-200',
          state === 'open' ? 'opacity-60' : 'opacity-0',
        )}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : rest['aria-label']}
        tabIndex={-1}
        data-state={state}
        className={cn(
          'relative flex max-h-full min-h-0 flex-col overflow-hidden bg-surface outline-none',
          panelClassName,
          className,
        )}
      >
        <SheetHandle />

        {(title || !hideCloseButton || headerAction) && (
          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3">
            {title && (
              <h2 id={titleId} className="min-w-0 flex-1 truncate px-1 font-display text-base font-bold text-fg">
                {title}
              </h2>
            )}
            {!title && <span className="flex-1" />}
            {headerAction}
            {!hideCloseButton && (
              // `md` (44px) e não `sm`: fechar uma sheet é o alvo mais usado do
              // celular, e 36px fica abaixo do mínimo de toque da regra 1.
              <IconButton aria-label="Fechar" onClick={onClose}>
                <CloseIcon size={18} />
              </IconButton>
            )}
          </header>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">{children}</div>

        {footer && <div className="shrink-0 border-t border-border p-5">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Diálogo responsivo — **bottom-sheet abaixo de 768px, modal centrado a
 * partir de 768px**, exatamente como `ClienteAuth`, `MinhaConta`,
 * `AgendamentoWizard` e `AssinaturaCliente` fazem no protótipo.
 *
 * Mobile: colado embaixo, largura total (teto de 480px), topo arredondado em
 * 24px, alça de arrastar, altura de 92vh e deslize vertical na curva
 * `cubic-bezier(.32,.72,0,1)`.
 * Desktop: centrado, 480px, raio 16px, entrada em escala + opacidade.
 */
export function Modal({ className, ...props }: OverlayProps) {
  return (
    <OverlayRoot
      {...props}
      durationMs={300}
      className={className}
      panelClassName={cn(
        // ── Mobile: bottom-sheet ──
        'mx-auto mt-auto w-full max-w-[480px] rounded-t-3xl shadow-sheet',
        'h-[92dvh] max-h-[92dvh]',
        'transition-transform duration-300 ease-sheet',
        'data-[state=closed]:translate-y-full data-[state=open]:translate-y-0',
        // ── Desktop (≥768px): modal centrado ──
        'md:m-auto md:h-auto md:max-h-[90dvh] md:w-[480px] md:rounded-2xl md:shadow-modal',
        'md:transition-[transform,opacity] md:duration-200 md:ease-out',
        'md:data-[state=closed]:translate-y-0 md:data-[state=closed]:scale-95 md:data-[state=closed]:opacity-0',
        'md:data-[state=open]:scale-100 md:data-[state=open]:opacity-100',
      )}
    />
  );
}

export interface DrawerProps extends OverlayProps {
  /** Lado de onde o painel entra no desktop. Padrão `right`. */
  side?: 'left' | 'right';
}

/**
 * Painel lateral — o drawer de cliente/agendamento do `Dashboard.dc.html`.
 *
 * Abaixo de 768px vira o mesmo bottom-sheet do `Modal` (regra 1: nada de
 * painel lateral de 420px numa tela de 360px); a partir de 768px desliza da
 * borda escolhida, com altura total.
 */
export function Drawer({ side = 'right', className, ...props }: DrawerProps) {
  return (
    <OverlayRoot
      {...props}
      durationMs={300}
      className={className}
      panelClassName={cn(
        // ── Mobile: bottom-sheet ──
        'mx-auto mt-auto w-full max-w-[480px] rounded-t-3xl shadow-sheet',
        'h-[92dvh] max-h-[92dvh]',
        'transition-transform duration-300 ease-sheet',
        'data-[state=closed]:translate-y-full data-[state=open]:translate-y-0',
        // ── Desktop (≥768px): painel lateral de altura total ──
        'md:m-0 md:h-full md:max-h-full md:w-[440px] md:rounded-none md:shadow-modal',
        'md:data-[state=closed]:translate-y-0',
        side === 'right'
          ? 'md:ml-auto md:border-l md:border-border md:data-[state=closed]:translate-x-full'
          : 'md:mr-auto md:border-r md:border-border md:data-[state=closed]:-translate-x-full',
        'md:data-[state=open]:translate-x-0',
      )}
    />
  );
}
