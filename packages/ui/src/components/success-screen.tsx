'use client';

import type { ReactNode } from 'react';
import { CloseIcon } from '../icons';
import { cn } from '../lib/cn';
import { IconButton } from './button';

export interface SuccessSummaryRow {
  /** Ícone ou avatar à esquerda da linha. */
  icon?: ReactNode;
  /** Conteúdo da linha (serviço, barbeiro, data…). */
  label: ReactNode;
  /** Destaca em dourado e negrito — a linha de valor do resumo. */
  emphasis?: boolean;
}

export interface SuccessScreenProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Resumo do que foi confirmado. */
  summary?: SuccessSummaryRow[];
  /** Rodapé do resumo separado por linha tracejada (ex.: código da reserva). */
  code?: { label: ReactNode; value: ReactNode };
  /** Botões de ação, um por linha (Adicionar ao calendário, Compartilhar…). */
  actions?: ReactNode;
  /** Bloco de instruções em caixa com borda. */
  note?: ReactNode;
  /** Exibe o ✕ no canto. */
  onClose?: () => void;
  className?: string;
}

/**
 * Tela de confirmação — consolida as duas variações de sucesso do protótipo
 * (fim do `AgendamentoWizard` e da `AssinaturaCliente`), que só diferiam no
 * texto: círculo dourado com `bvpSuccessPop`, check desenhado com
 * `bvpCheckDraw`, título em Sora, resumo e ações.
 */
export function SuccessScreen({
  title,
  subtitle,
  summary,
  code,
  actions,
  note,
  onClose,
  className,
}: SuccessScreenProps) {
  return (
    <div className={cn('relative flex w-full flex-col items-center px-1 py-6 text-center', className)}>
      {onClose && (
        <IconButton
          aria-label="Fechar"
          size="sm"
          onClick={onClose}
          className="absolute right-0 top-0 text-fg-muted"
        >
          <CloseIcon size={18} />
        </IconButton>
      )}

      <div className="grid size-[88px] shrink-0 animate-bvp-success-pop place-items-center rounded-full bg-gold">
        <svg
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M5 13l4 4L19 7"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="24"
            className="animate-bvp-check-draw text-bg"
          />
        </svg>
      </div>

      <h2 className="mt-5 font-display text-2xl font-bold text-fg">{title}</h2>
      {subtitle && <p className="mt-1.5 text-sm text-fg-muted">{subtitle}</p>}

      {(summary?.length || code) && (
        <div className="mt-6 flex w-full flex-col gap-2.5 rounded-2xl bg-surface-3 p-4 text-left">
          {summary?.map((row, index) => (
            <div
              // As linhas do resumo são estáticas e não reordenam.
              // eslint-disable-next-line react/no-array-index-key
              key={index}
              className="flex items-center gap-2"
            >
              {row.icon && <span className="flex w-4 shrink-0 justify-center">{row.icon}</span>}
              <span
                className={cn(
                  'min-w-0 flex-1 text-sm',
                  row.emphasis ? 'font-semibold text-gold' : 'text-fg',
                )}
              >
                {row.label}
              </span>
            </div>
          ))}

          {code && (
            <div className="mt-0.5 flex justify-between gap-3 border-t border-dashed border-border pt-2.5">
              <span className="text-[13px] text-fg-muted">{code.label}</span>
              <span className="font-mono text-[13px] text-fg-muted">{code.value}</span>
            </div>
          )}
        </div>
      )}

      {actions && <div className="mt-6 flex w-full flex-col gap-3">{actions}</div>}

      {note && (
        <div className="mt-6 w-full rounded-xl border border-border p-3.5 text-left text-[13px] leading-relaxed text-fg-muted">
          {note}
        </div>
      )}
    </div>
  );
}
