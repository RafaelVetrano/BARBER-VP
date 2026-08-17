'use client';

import { useQuery } from '@tanstack/react-query';
import type { HealthResponse } from '@barbervp/types';
import { get } from '../lib/api-client';
import { getApiClient } from '../lib/browser-client';
import { AlertCircleIcon, CheckCircleIcon, SpinnerIcon } from '../icons';
import { cn } from '../lib/cn';

/**
 * Prova viva do encanamento axios + TanStack Query nas 4 apps: consulta o
 * `GET /health` real da API. Nenhum dado é mockado — se a API estiver fora,
 * a UI mostra o erro.
 */
export function ApiStatus({ className }: { className?: string }) {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['health'],
    queryFn: () => get<HealthResponse>(getApiClient(), '/health'),
    refetchInterval: 30_000,
  });

  const tone = isPending ? 'pending' : isError || data?.status !== 'ok' ? 'down' : 'up';

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-4 py-3 text-sm',
        tone === 'up' && 'border-success/30 bg-success/10 text-success',
        tone === 'down' && 'border-danger/30 bg-danger/10 text-danger',
        tone === 'pending' && 'border-border bg-surface-2 text-fg-muted',
        className,
      )}
      role="status"
      aria-live="polite"
    >
      {tone === 'pending' && <SpinnerIcon size={16} />}
      {tone === 'up' && <CheckCircleIcon size={16} />}
      {tone === 'down' && <AlertCircleIcon size={16} />}

      <span className="font-medium">
        {tone === 'pending' && 'Consultando a API…'}
        {tone === 'up' && 'API no ar'}
        {tone === 'down' && 'API indisponível'}
      </span>

      {data && (
        <span className="text-xs text-fg-muted">
          postgres: {data.services.database.status} · redis: {data.services.redis.status}
        </span>
      )}
      {isError && <span className="text-xs opacity-80">{(error as Error).message}</span>}
    </div>
  );
}
