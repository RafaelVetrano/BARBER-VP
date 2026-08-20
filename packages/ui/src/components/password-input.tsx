'use client';

import { forwardRef, useState, type InputHTMLAttributes } from 'react';
import { isPasswordValid, passwordStrength } from '@barbervp/types';
import { EyeIcon, EyeOffIcon } from '../icons';
import { cn } from '../lib/cn';
import { Field, controlClasses, describedBy, useFieldIds, type FieldOwnProps } from './field';

// A régua da senha (mínimo 8 com letra e número, força em 4 níveis) mora em
// `@barbervp/types` desde a fase 03: a API valida com a MESMA função, então o
// indicador visual nunca discorda do 400 que o servidor devolve.
export { isPasswordValid, passwordStrength };

const STRENGTH_LABEL = ['', 'Fraca', 'Fraca', 'Média', 'Forte'] as const;

export interface PasswordInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'type'>,
    FieldOwnProps {
  /** Mostra as 4 barras de força + rótulo. Ligado nas telas de cadastro. */
  showStrength?: boolean;
  /** Valor controlado — necessário para o medidor de força. */
  value?: string;
}

/**
 * Campo de senha com alternância mostrar/ocultar e indicador de força de 4
 * barras — portado de `ClienteAuth.dc.html`.
 *
 * O protótipo usava os emojis 👁/🙈 no botão; aqui virou ícone do design
 * system, com `aria-label` que muda de acordo com o estado.
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(function PasswordInput(
  { label, required, hint, error, success, className, id, showStrength = false, value = '', ...props },
  ref,
) {
  const ids = useFieldIds(id);
  const [visible, setVisible] = useState(false);
  const score = passwordStrength(String(value));

  return (
    <Field label={label} required={required} hint={hint} error={error} ids={ids} className={className}>
      <div className="relative flex w-full items-center">
        <input
          ref={ref}
          id={ids.id}
          type={visible ? 'text' : 'password'}
          value={value}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(ids, error, hint)}
          className={cn(controlClasses({ error: !!error, success }), 'h-12 pr-11')}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
          aria-pressed={visible}
          className={cn(
            // 44px no dedo, 40px no mouse (fase 09 — varredura responsiva).
            'absolute right-1 grid size-11 place-items-center rounded-control text-fg-muted md:size-10',
            'transition-colors hover:text-fg',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold',
          )}
        >
          {visible ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
        </button>
      </div>

      {showStrength && (
        <div className="flex flex-col gap-1.5 pt-0.5">
          <div className="flex gap-1" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className={cn(
                  'h-1 flex-1 rounded-sm transition-colors duration-200',
                  i >= score
                    ? 'bg-border'
                    : score <= 1
                      ? 'bg-danger'
                      : score <= 3
                        ? 'bg-gold'
                        : 'bg-success',
                )}
              />
            ))}
          </div>
          <span className="text-xs text-fg-muted" aria-live="polite">
            {score > 0 ? `Força da senha: ${STRENGTH_LABEL[score]}` : ' '}
          </span>
        </div>
      )}
    </Field>
  );
});
