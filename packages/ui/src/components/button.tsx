'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { SpinnerIcon } from '../icons';
import { cn } from '../lib/cn';

export type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Mostra spinner, mantém a largura e bloqueia o clique. */
  loading?: boolean;
  /** Texto exibido enquanto `loading` (padrão: mantém o filho). */
  loadingText?: string;
  /** Ocupa 100% da largura — padrão dos CTAs em sheet mobile. */
  fullWidth?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
}

/**
 * Botão do design system.
 *
 * Variantes portadas do protótipo:
 * - `primary`: preenchido em dourado com texto escuro (`onHeroCta` da landing,
 *   `continueButtonStyle` do wizard, submits do `ClienteAuth`).
 * - `outline`: borda `--line` e texto claro ("Compartilhar", "Criar conta").
 * - `ghost`: sem borda nem fundo ("Fazer outro agendamento").
 * - `danger`: destrutivo (excluir conta). Texto **escuro** sobre o vermelho —
 *   texto claro sobre `#E05B5B` dá 3.25:1 e reprovaria em AA.
 *
 * Desabilitado usa o mesmo tratamento do protótipo: fundo `--line`,
 * texto mudo e `cursor-not-allowed`.
 */
/**
 * Classes do botão, isoladas para quem precisa da mesma aparência num elemento
 * que NÃO é `<button>` — um `<Link>` do Next, por exemplo ("Cadastrar
 * barbearia →" do login, que precisa ser âncora de verdade porque o site é
 * indexado).
 */
export function buttonClasses({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
} = {}): string {
  return cn(
    'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-sans font-semibold',
    'transition-colors duration-150 active:translate-y-px',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
    'disabled:pointer-events-none disabled:active:translate-y-0',

    // 44px abaixo de `md` e a altura do protótipo a partir dali: `md` é onde
    // o ponteiro deixa de ser o dedo. Abaixo disso, 40px reprova o mínimo de
    // alvo de toque das WCAG (fase 09 — varredura responsiva).
    size === 'sm' && 'h-11 md:h-10 rounded-control px-4 text-[13px]',
    size === 'md' && 'h-12 rounded-xl px-5 text-[15px]',
    size === 'lg' && 'h-[52px] rounded-xl px-6 text-base',

    variant === 'primary' && 'bg-gold text-bg hover:bg-gold-hover',
    variant === 'outline' &&
      'border border-border bg-transparent text-fg hover:border-border-strong hover:bg-surface-3',
    variant === 'ghost' && 'bg-transparent text-fg-muted hover:bg-surface-3 hover:text-fg',
    variant === 'danger' && 'bg-danger text-bg hover:brightness-110',

    // Estado desabilitado idêntico ao do protótipo, para todas as variantes.
    'disabled:border-transparent disabled:bg-border disabled:text-fg-subtle disabled:opacity-40 disabled:hover:bg-border',

    fullWidth && 'w-full',
    className,
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    loadingText,
    fullWidth = false,
    iconLeft,
    iconRight,
    className,
    children,
    disabled,
    type = 'button',
    ...props
  },
  ref,
) {
  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, fullWidth, className })}
      {...props}
    >
      {loading ? <SpinnerIcon size={18} /> : iconLeft}
      {loading && loadingText ? loadingText : children}
      {!loading && iconRight}
    </button>
  );
});

export interface IconButtonProps extends Omit<ButtonProps, 'iconLeft' | 'iconRight' | 'fullWidth' | 'loadingText'> {
  /** Obrigatório: o botão só tem ícone, precisa de nome acessível. */
  'aria-label': string;
}

/**
 * Botão quadrado só com ícone — o `←` / `✕` dos headers de sheet e o kebab
 * das tabelas do dashboard. Alvo de toque de 44px no tamanho `md`.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { size = 'md', variant = 'ghost', className, ...props },
  ref,
) {
  return (
    <Button
      ref={ref}
      size={size}
      variant={variant}
      className={cn(
        'shrink-0 rounded-full p-0',
        // Mesma regra do `Button` pequeno: 44px no dedo, 36px no mouse.
        size === 'sm' && 'size-11 md:size-9',
        size === 'md' && 'size-11',
        size === 'lg' && 'size-12',
        className,
      )}
      {...props}
    />
  );
});
