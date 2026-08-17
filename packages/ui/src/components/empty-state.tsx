import type { ReactNode } from 'react';
import { EmptyCalendarArt } from '../icons';
import { cn } from '../lib/cn';

export interface EmptyStateProps {
  /** Frase principal — no protótipo, "Você ainda não tem horários marcados". */
  message: ReactNode;
  /** Linha de apoio opcional abaixo da mensagem. */
  description?: ReactNode;
  /** Ilustração. Padrão: a agenda vazia de `MinhaConta.dc.html`. */
  illustration?: ReactNode;
  /** Botão de saída do vazio (o CTA "Agendar horário"). */
  action?: ReactNode;
  className?: string;
}

/**
 * Estado vazio — ilustração em traço `--line`, texto secundário e CTA,
 * exatamente como o vazio de "Meus horários" da `MinhaConta.dc.html`.
 */
export function EmptyState({ message, description, illustration, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex w-full flex-col items-center gap-4 px-6 py-12 text-center sm:py-14',
        className,
      )}
    >
      <span className="text-border">{illustration ?? <EmptyCalendarArt />}</span>
      <p className="max-w-sm text-[15px] leading-relaxed text-fg-muted">{message}</p>
      {description && <p className="max-w-sm text-[13px] text-fg-muted">{description}</p>}
      {action}
    </div>
  );
}
