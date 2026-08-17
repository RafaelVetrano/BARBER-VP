'use client';

import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type ChangeEvent,
} from 'react';
import { cn } from '../lib/cn';
import { useFieldIds } from './field';

export interface OtpInputProps {
  /** Código atual. Só dígitos; mais curto que `length` = caixas vazias à direita. */
  value: string;
  onChange: (value: string) => void;
  /** Disparado quando a última caixa é preenchida (inclusive por colagem). */
  onComplete?: (value: string) => void;
  /** Quantidade de caixas. Padrão 6 (o OTP do BarberVP). */
  length?: number;
  /** Mensagem de erro: pinta as bordas de vermelho e sacode as caixas. */
  error?: string | null;
  /** Rótulo acessível do grupo. */
  label?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  id?: string;
}

const onlyDigits = (s: string) => s.replace(/\D/g, '');

/**
 * Código OTP de 6 dígitos — portado de `ClienteAuth.dc.html`.
 *
 * Comportamento do protótipo, preservado: avanço automático a cada dígito,
 * colagem do código inteiro em qualquer caixa, borda dourada na caixa em foco,
 * borda vermelha e `bvpOtpShake` no erro.
 *
 * Acessibilidade: as caixas ficam num `role="group"` rotulado, cada uma com
 * `aria-label` da posição, e o erro é anunciado por `role="alert"`.
 */
export function OtpInput({
  value,
  onChange,
  onComplete,
  length = 6,
  error,
  label = 'Código de verificação',
  disabled,
  autoFocus,
  className,
  id,
}: OtpInputProps) {
  const ids = useFieldIds(id);
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  // Reinicia a animação de shake a cada novo erro (senão ela só roda uma vez).
  const [shakeKey, setShakeKey] = useState(0);

  useEffect(() => {
    if (error) setShakeKey((k) => k + 1);
  }, [error]);

  const digits = Array.from({ length }, (_, i) => onlyDigits(value)[i] ?? '');

  const commit = (next: string) => {
    onChange(next);
    if (next.length === length) onComplete?.(next);
  };

  const focusAt = (i: number) => refs.current[Math.min(Math.max(i, 0), length - 1)]?.focus();

  const handleChange = (index: number, event: ChangeEvent<HTMLInputElement>) => {
    const typed = onlyDigits(event.target.value);
    if (!typed) return;

    // Digitar numa caixa do meio substitui só ela; colar cai em `handlePaste`.
    const next = digits.slice();
    next[index] = typed[typed.length - 1] as string;
    commit(next.join('').slice(0, length));
    focusAt(index + 1);
  };

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace') {
      event.preventDefault();
      // A string é a única fonte de verdade: apagar um dígito do meio puxa os
      // seguintes para a esquerda (o preenchimento é sempre da esquerda para a
      // direita, então na prática só o último dígito é apagado).
      const next = digits.slice();
      if (next[index]) {
        next[index] = '';
      } else if (index > 0) {
        next[index - 1] = '';
        focusAt(index - 1);
      }
      commit(next.join(''));
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      focusAt(index - 1);
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      focusAt(index + 1);
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const pasted = onlyDigits(event.clipboardData.getData('text')).slice(0, length);
    if (!pasted) return;
    commit(pasted);
    focusAt(pasted.length);
  };

  return (
    <div className={cn('flex w-full flex-col items-center gap-2', className)}>
      <div
        key={shakeKey}
        role="group"
        aria-label={label}
        aria-describedby={error ? ids.errorId : undefined}
        className={cn('flex w-full max-w-[22rem] justify-center gap-2', error && 'animate-bvp-otp-shake')}
      >
        {digits.map((digit, index) => (
          <input
            // A posição é a identidade da caixa: a lista nunca reordena.
            // eslint-disable-next-line react/no-array-index-key
            key={index}
            ref={(el) => {
              refs.current[index] = el;
            }}
            value={digit}
            onChange={(event) => handleChange(index, event)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            onPaste={handlePaste}
            inputMode="numeric"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            maxLength={1}
            disabled={disabled}
            autoFocus={autoFocus && index === 0}
            aria-label={`Dígito ${index + 1} de ${length}`}
            aria-invalid={error ? true : undefined}
            className={cn(
              'h-14 min-w-0 flex-1 basis-0 rounded-control border bg-surface-2 text-center',
              'font-sans text-[22px] font-semibold tabular-nums text-fg',
              'transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-gold/30',
              'disabled:cursor-not-allowed disabled:opacity-50',
              error ? 'border-danger' : 'border-border focus:border-gold',
            )}
          />
        ))}
      </div>

      {error && (
        <span id={ids.errorId} role="alert" className="text-[13px] text-danger">
          {error}
        </span>
      )}
    </div>
  );
}
