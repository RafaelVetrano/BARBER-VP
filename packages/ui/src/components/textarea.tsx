'use client';

import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '../lib/cn';
import { Field, controlClasses, describedBy, useFieldIds, type FieldOwnProps } from './field';

export interface TextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'>,
    FieldOwnProps {}

/**
 * Área de texto — o campo "Observações (opcional)" do wizard: 72px de altura,
 * mesmo raio e fundo do `Input`, sem alça de redimensionar.
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, required, hint, error, success, className, id, rows = 3, ...props },
  ref,
) {
  const ids = useFieldIds(id);

  return (
    <Field label={label} required={required} hint={hint} error={error} ids={ids} className={className}>
      <textarea
        ref={ref}
        id={ids.id}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(ids, error, hint)}
        className={cn(controlClasses({ error: !!error, success }), 'resize-none py-2.5 leading-relaxed')}
        {...props}
      />
    </Field>
  );
});
