'use client';

import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { CheckIcon } from '../icons';
import { cn } from '../lib/cn';
import { Field, controlClasses, describedBy, useFieldIds, type FieldOwnProps } from './field';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'>, FieldOwnProps {
  /** Adorno à esquerda dentro do campo (ícone de busca, prefixo). */
  addonLeft?: ReactNode;
  /** Adorno à direita — substitui o check verde de `success`. */
  addonRight?: ReactNode;
}

/**
 * Campo de texto. Erro em vermelho e sucesso com check verde à direita,
 * como nos formulários de `ClienteAuth.dc.html`.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, required, hint, error, success, className, addonLeft, addonRight, id, ...props },
  ref,
) {
  const ids = useFieldIds(id);
  const right = addonRight ?? (success ? <CheckIcon size={16} className="text-success" /> : null);

  return (
    <Field label={label} required={required} hint={hint} error={error} ids={ids} className={className}>
      <div className="relative flex w-full items-center">
        {addonLeft && (
          <span className="pointer-events-none absolute left-3 flex text-fg-muted" aria-hidden="true">
            {addonLeft}
          </span>
        )}
        <input
          ref={ref}
          id={ids.id}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(ids, error, hint)}
          className={cn(
            controlClasses({ error: !!error, success }),
            'h-12',
            addonLeft && 'pl-10',
            right && 'pr-10',
          )}
          {...props}
        />
        {right && <span className="absolute right-3 flex items-center">{right}</span>}
      </div>
    </Field>
  );
});
