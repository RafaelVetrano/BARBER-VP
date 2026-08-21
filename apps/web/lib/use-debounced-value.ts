'use client';

import { useEffect, useState } from 'react';

/**
 * Segura um valor por `delayMs` antes de propagá-lo.
 *
 * A busca global dispara uma requisição por valor propagado; sem isto, digitar
 * "João" mandaria quatro.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
