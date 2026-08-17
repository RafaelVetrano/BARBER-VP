'use client';

import { forwardRef, type SelectHTMLAttributes } from 'react';
import { ChevronDownIcon } from '../icons';
import { cn } from '../lib/cn';
import { Field, controlClasses, describedBy, useFieldIds, type FieldOwnProps } from './field';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className' | 'children'>,
    FieldOwnProps {
  options: SelectOption[];
  /** Primeira opção neutra e desabilitada (ex.: "Selecione uma categoria"). */
  placeholder?: string;
}

/**
 * Select nativo com a moldura do design system — nativo de propósito: no
 * mobile abre a roda do sistema, que é o comportamento esperado nas sheets.
 * A seta é o mesmo chevron do seletor de unidade do `Dashboard.dc.html`.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, required, hint, error, success, className, id, options, placeholder, ...props },
  ref,
) {
  const ids = useFieldIds(id);

  return (
    <Field label={label} required={required} hint={hint} error={error} ids={ids} className={className}>
      <div className="relative flex w-full items-center">
        <select
          ref={ref}
          id={ids.id}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(ids, error, hint)}
          className={cn(
            controlClasses({ error: !!error, success }),
            'h-12 cursor-pointer appearance-none pr-10',
            // `defaultValue=""` + placeholder mantém o texto em tom mudo.
            'invalid:text-fg-subtle',
          )}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDownIcon
          size={16}
          className="pointer-events-none absolute right-3 text-fg-muted"
        />
      </div>
    </Field>
  );
});
