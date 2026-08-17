import { cn } from '../lib/cn';

export interface SkeletonProps {
  /** `text` = barra baixa; `block` = bloco; `circle` = avatar. */
  variant?: 'text' | 'block' | 'circle';
  className?: string;
}

/**
 * Bloco de carregamento — o esqueleto dos horários do
 * `AgendamentoWizard.dc.html` (barras `#1F232B` de 44px de altura).
 *
 * O protótipo usa blocos estáticos; aqui eles pulsam com `bvpShimmer`, que a
 * regra global de `prefers-reduced-motion` já neutraliza.
 */
export function Skeleton({ variant = 'block', className }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'block animate-bvp-shimmer bg-surface-3',
        variant === 'text' && 'h-3 rounded-sm',
        variant === 'block' && 'h-11 rounded-control',
        variant === 'circle' && 'size-10 rounded-full',
        className,
      )}
    />
  );
}

export interface SkeletonGroupProps {
  /** Texto lido por leitores de tela enquanto carrega. */
  label?: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * Envelope de um bloco de esqueletos: marca a região como ocupada, para o
 * leitor de tela anunciar "carregando" em vez de ler caixas vazias.
 */
export function SkeletonGroup({ label = 'Carregando…', className, children }: SkeletonGroupProps) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
