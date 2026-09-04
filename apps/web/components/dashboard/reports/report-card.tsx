'use client';

import type { ReactNode } from 'react';
import { Button, LockIcon, Skeleton, cn } from '@barbervp/ui';

export interface ReportCardProps {
  title: string;
  /** Linha de apoio abaixo do título — "Pico: sábado, 10h–13h". */
  hint?: ReactNode;
  /** Canto superior direito — o "+12% vs. período anterior". */
  aside?: ReactNode;
  /** Quantas colunas o card ocupa no grid de 3 (`grid-column:span N`). */
  span?: 1 | 2 | 3;
  /** Embaça o conteúdo e cobre com o cadeado do protótipo. */
  locked?: boolean;
  onLockedClick?: () => void;
  loading?: boolean;
  /** Altura do esqueleto — a MESMA do conteúdo final, sem salto de layout. */
  skeletonHeight?: number;
  error?: boolean;
  onRetry?: () => void;
  /** Mensagem própria do bloco quando o período não tem dado nenhum. */
  empty?: string;
  isEmpty?: boolean;
  children: ReactNode;
}

/**
 * A caixa `#181B21` que embrulha TODO bloco da aba Relatórios, com os quatro
 * estados no mesmo lugar: carregando, erro, vazio e o cadeado.
 *
 * O cadeado é POR BLOCO, como no protótipo (`relLockWrapStyle` /
 * `relLockContentStyle`, l.6920–6921): o conteúdo continua desenhado e
 * embaçado por trás do véu, e não substituído por um cartaz. É o que faz o
 * dono ver o formato do que está comprando. Quem decide de fato é o servidor —
 * o `/reports/advanced` responde 403 e nada disto chega ao navegador.
 */
export function ReportCard({
  title,
  hint,
  aside,
  span = 1,
  locked = false,
  onLockedClick,
  loading = false,
  skeletonHeight = 200,
  error = false,
  onRetry,
  empty = 'Sem dados no período.',
  isEmpty = false,
  children,
}: ReportCardProps) {
  return (
    <section
      className={cn(
        'relative flex min-w-0 flex-col gap-3.5 rounded-xl border border-border bg-surface p-5',
        span === 2 && 'lg:col-span-2',
        span === 3 && 'lg:col-span-2 xl:col-span-3',
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-fg">{title}</h3>
          {hint && <p className="mt-0.5 text-xs text-fg-muted">{hint}</p>}
        </div>
        {aside}
      </div>

      <div
        className={cn('min-w-0 flex-1', locked && 'pointer-events-none select-none blur-[5px]')}
        // Bloco trancado NÃO recebe payload (o servidor responde 403), então
        // não há conteúdo para embaçar — mas ele precisa manter a altura do
        // bloco liberado, senão o cadeado encolhe até encavalar no título e a
        // grade inteira se reorganiza ao trocar de plano.
        style={locked ? { minHeight: skeletonHeight } : undefined}
        aria-hidden={locked || undefined}
      >
        {loading ? (
          <div style={{ height: skeletonHeight }}>
            <Skeleton className="h-full w-full rounded-lg" />
          </div>
        ) : error ? (
          <Placeholder height={skeletonHeight}>
            <p className="text-[13px] text-fg-muted">Não foi possível carregar este bloco.</p>
            {onRetry && (
              <Button variant="outline" size="sm" onClick={onRetry}>
                Tentar de novo
              </Button>
            )}
          </Placeholder>
        ) : isEmpty ? (
          <Placeholder height={skeletonHeight}>
            <p className="text-[13px] text-fg-muted">{empty}</p>
          </Placeholder>
        ) : (
          children
        )}
      </div>

      {locked && (
        <button
          type="button"
          onClick={onLockedClick}
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl bg-bg/60 text-center"
        >
          <LockIcon size={22} className="text-gold" />
          <span className="text-xs font-semibold text-fg">Disponível no plano Profissional</span>
        </button>
      )}
    </section>
  );
}

/**
 * Vazio e erro ocupam a MESMA altura do conteúdo carregado — trocar de período
 * para um intervalo sem movimento não pode encolher o card e empurrar a grade
 * inteira para cima.
 */
function Placeholder({ height, children }: { height: number; children: ReactNode }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 text-center"
      style={{ minHeight: height }}
    >
      {children}
    </div>
  );
}
