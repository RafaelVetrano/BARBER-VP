import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** `surface-2` é o card do dashboard; `surface-3`, o card dentro de sheet. */
  tone?: 'default' | 'raised';
  /** Remove o padding interno (tabelas ocupam a caixa inteira). */
  flush?: boolean;
  /** Realce dourado — cards de plano/upsell do protótipo. */
  highlighted?: boolean;
}

/**
 * Caixa base do design system: fundo de superfície, borda `--line`, raio 12px
 * (`Dashboard.dc.html`) ou 16px nos blocos dentro das sheets do cliente.
 */
export function Card({ tone = 'default', flush = false, highlighted = false, className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col rounded-xl border',
        tone === 'default' ? 'bg-surface-2' : 'bg-surface-3',
        highlighted ? 'border-gold/40 shadow-gold' : 'border-border',
        !flush && 'p-4',
        className,
      )}
      {...props}
    />
  );
}

export interface CardHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Ação à direita do título (botão, filtro, link "ver todos"). */
  action?: ReactNode;
  className?: string;
}

export function CardHeader({ title, description, action, className }: CardHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h3 className="font-display text-base font-bold text-fg">{title}</h3>
        {description && <p className="mt-1 text-[13px] text-fg-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
