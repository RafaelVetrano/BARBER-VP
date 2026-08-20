'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Contador regressivo do "Reenviar código".
 *
 * O protótipo fixa 59s; aqui o valor inicial vem do desafio devolvido pela API
 * (`resendInSeconds`), que por sua vez sai do env — então mudar o cooldown é
 * mudar uma variável, não caçar o número em dois lugares.
 */
export function useResendCountdown() {
  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const start = useCallback(
    (from: number) => {
      stop();
      setSeconds(from);
      timerRef.current = setInterval(() => {
        setSeconds((current) => {
          if (current <= 1) {
            stop();
            return 0;
          }
          return current - 1;
        });
      }, 1_000);
    },
    [stop],
  );

  useEffect(() => stop, [stop]);

  return {
    seconds,
    canResend: seconds <= 0,
    /** `0:59` — o formato do protótipo. */
    label: `0:${String(seconds).padStart(2, '0')}`,
    start,
    stop,
  };
}
