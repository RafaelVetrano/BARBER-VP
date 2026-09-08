'use client';

import { forwardRef, useState, type InputHTMLAttributes } from 'react';
import {
  PASSWORD_REQUIREMENT_LABELS,
  isPasswordValid,
  passwordChecks,
  passwordStrength,
} from '@barbervp/types';
import { EyeIcon, EyeOffIcon } from '../icons';
import { cn } from '../lib/cn';
import { Field, controlClasses, describedBy, useFieldIds, type FieldOwnProps } from './field';

// A régua da senha (8+ com maiúscula, número e especial; força em 4 níveis)
// mora em `@barbervp/types` desde a fase 03: a API valida com a MESMA função,
// então o indicador visual nunca discorda do 400 que o servidor devolve.
export { isPasswordValid, passwordChecks, passwordStrength };

// Uma barra por requisito atendido — 4 requisitos, 4 barras.
const STRENGTH_LABEL = ['', 'Muito fraca', 'Fraca', 'Quase lá', 'Forte'] as const;

export interface PasswordInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'type'>,
    FieldOwnProps {
  /** Mostra as 4 barras de força + a lista de requisitos. Ligado no cadastro. */
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
 *
 * Sob as barras vai a LISTA dos requisitos com ✓/○ ao vivo: "Força da senha:
 * Fraca" não diz QUAL requisito falta, e a régua nova (uma barra por
 * requisito) só faz sentido se der para ler quais barras são quais.
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(function PasswordInput(
  { label, required, hint, error, success, className, id, showStrength = false, value = '', ...props },
  ref,
) {
  const ids = useFieldIds(id);
  const [visible, setVisible] = useState(false);
  const typed = String(value);
  const score = passwordStrength(typed);
  const checks = passwordChecks(typed);

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

          {/* Uma linha por requisito: é isto que diz o que ainda falta. */}
          <ul className="flex flex-col gap-0.5" aria-live="polite">
            {PASSWORD_REQUIREMENT_LABELS.map(({ key, label: requirement }) => {
              const met = checks[key];
              return (
                <li
                  key={key}
                  className={cn(
                    'flex items-center gap-1.5 text-[11.5px] font-medium transition-colors',
                    met ? 'text-success' : 'text-fg-muted',
                  )}
                >
                  <span aria-hidden="true" className="w-3 shrink-0 text-center">
                    {met ? '✓' : '○'}
                  </span>
                  <span>
                    <span className="sr-only">{met ? 'Requisito atendido: ' : 'Falta: '}</span>
                    {requirement}
                  </span>
                </li>
              );
            })}
          </ul>

          <span className="text-xs text-fg-muted">
            {score > 0 ? `Força da senha: ${STRENGTH_LABEL[score]}` : ' '}
          </span>
        </div>
      )}
    </Field>
  );
});
