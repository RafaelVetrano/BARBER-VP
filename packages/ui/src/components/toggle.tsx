'use client';

import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { CheckIcon } from '../icons';
import { cn } from '../lib/cn';
import { useFieldIds } from './field';

interface ToggleBaseProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'className'> {
  label?: ReactNode;
  /** Linha secundária abaixo do rótulo. */
  description?: ReactNode;
  /** Mensagem de erro — o caso típico é o aceite de termos não marcado. */
  error?: ReactNode;
  className?: string;
}

/**
 * Caixa de seleção — 24×24, raio 6, dourada quando marcada, com o mesmo
 * check do protótipo (`AgendamentoWizard` na lista de serviços,
 * `ClienteAuth` nos termos de uso).
 *
 * O `input` nativo fica invisível mas presente (`peer`), então teclado,
 * leitor de tela e `required` funcionam sem nenhum ARIA extra.
 */
export const Checkbox = forwardRef<HTMLInputElement, ToggleBaseProps>(function Checkbox(
  { label, description, error, className, id, ...props },
  ref,
) {
  const ids = useFieldIds(id);
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-start gap-3">
        <span className="relative flex shrink-0 items-center">
          <input
            ref={ref}
            id={ids.id}
            type="checkbox"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? ids.errorId : undefined}
            className={cn(
              'peer size-6 cursor-pointer appearance-none rounded-md border-[1.5px] bg-transparent transition-colors checked:border-gold checked:bg-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50',
              error ? 'border-danger' : 'border-border',
            )}
            {...props}
          />
          <CheckIcon
            size={14}
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-bg opacity-0 peer-checked:opacity-100"
          />
        </span>
        {(label || description) && (
          <label htmlFor={ids.id} className="flex min-h-11 cursor-pointer select-none flex-col justify-center text-[13px] leading-snug md:min-h-0 md:block">
            <span className="text-fg">{label}</span>
            {description && <span className="mt-0.5 block text-fg-muted">{description}</span>}
          </label>
        )}
      </div>
      {error && (
        <span id={ids.errorId} role="alert" className="pl-9 text-xs text-danger">
          {error}
        </span>
      )}
    </div>
  );
});

/**
 * Botão de rádio — 24×24 circular, anel dourado com miolo preenchido quando
 * selecionado (escolha de barbeiro no `AgendamentoWizard`).
 */
export const Radio = forwardRef<HTMLInputElement, ToggleBaseProps>(function Radio(
  { label, description, className, id, ...props },
  ref,
) {
  const ids = useFieldIds(id);
  return (
    <div className={cn('flex items-start gap-3', className)}>
      <span className="relative flex shrink-0 items-center">
        <input
          ref={ref}
          id={ids.id}
          type="radio"
          className="peer size-6 cursor-pointer appearance-none rounded-full border-[1.5px] border-border bg-transparent transition-colors checked:border-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50"
          {...props}
        />
        <span className="pointer-events-none absolute left-1/2 top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold opacity-0 peer-checked:opacity-100" />
      </span>
      {(label || description) && (
        <label htmlFor={ids.id} className="flex min-h-11 cursor-pointer select-none flex-col justify-center text-[13px] leading-snug md:min-h-0 md:block">
          <span className="text-fg">{label}</span>
          {description && <span className="mt-0.5 block text-fg-muted">{description}</span>}
        </label>
      )}
    </div>
  );
});

/**
 * Interruptor — trilho 44×24 com botão de 18px, portado do "Lembrar meus
 * dados neste aparelho" do wizard. É um `checkbox` com `role="switch"`.
 */
export const Switch = forwardRef<HTMLInputElement, ToggleBaseProps>(function Switch(
  { label, description, className, id, ...props },
  ref,
) {
  const ids = useFieldIds(id);
  return (
    <div className={cn('flex items-center justify-between gap-4', className)}>
      {(label || description) && (
        <label htmlFor={ids.id} className="flex min-h-11 min-w-0 cursor-pointer select-none flex-col justify-center text-[13px] leading-snug md:min-h-0 md:block">
          <span className="text-fg">{label}</span>
          {description && <span className="mt-0.5 block text-fg-muted">{description}</span>}
        </label>
      )}
      <span className="relative flex shrink-0 items-center">
        <input
          ref={ref}
          id={ids.id}
          type="checkbox"
          role="switch"
          className="peer h-6 w-11 cursor-pointer appearance-none rounded-full bg-border transition-colors checked:bg-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50"
          {...props}
        />
        <span className="pointer-events-none absolute left-[3px] size-[18px] rounded-full bg-fg transition-transform duration-150 peer-checked:translate-x-5" />
      </span>
    </div>
  );
});
