import type { SVGProps } from 'react';

/**
 * Ícones do BarberVP — portados dos SVGs inline dos `.dc.html`.
 *
 * Regra do SPEC (fase 02): **não** trocar por lucide/heroicons. Os `path`
 * abaixo são cópia literal do protótipo (`NAV_DEFS` do `Dashboard.dc.html`,
 * marcadores das sheets do cliente etc.) — é daí que vem a fidelidade visual.
 * Os poucos ícones sem original no bundle estão marcados com `// novo:`.
 *
 * Todos herdam cor via `currentColor` e tamanho via `size`.
 */
export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'width' | 'height'> {
  /** Lado do quadrado em px. Padrão 24. */
  size?: number | string;
}

/** Wrapper comum: viewBox 24, outline, stroke-linecap/join arredondados. */
function Icon({ size = 24, strokeWidth = 1.8, children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * Navegação do dashboard — paths idênticos aos de `NAV_DEFS`
 * (`Dashboard.dc.html`, stroke-width 1.8).
 * ──────────────────────────────────────────────────────────────────────── */

export function GridIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />
    </Icon>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 5h16v15H4zM4 9h16M8 3v4M16 3v4" />
    </Icon>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c0-3 2.5-5 5-5s5 2 5 5M17 11a3 3 0 1 0 0-6M16 20c0-2.5 1.8-4.5 4-5" />
    </Icon>
  );
}

export function ReceiptIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21zM8 8h8M8 12h8M8 16h5" />
    </Icon>
  );
}

export function MoneyIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3v18M16 7c0-2-2-3-4-3s-4 1-4 3 2 3 4 3 4 1 4 3-2 3-4 3-4-1-4-3" />
    </Icon>
  );
}

export function PercentIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 18L18 6M7 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
    </Icon>
  );
}

export function StarIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 2l2.9 6.6 7.1.6-5.4 4.8 1.6 7-6.2-3.9-6.2 3.9 1.6-7-5.4-4.8 7.1-.6z" />
    </Icon>
  );
}

export function ChatIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 5h16v11H8l-4 4z" />
    </Icon>
  );
}

export function SparkleIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z" />
    </Icon>
  );
}

export function BarChartIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 20V10M12 20V4M19 20v-7" />
    </Icon>
  );
}

/** Tesoura da marca — mesma do logo e do item "Serviços & Produtos". */
export function ScissorsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM6 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8l12 10M19 6L7 16" />
    </Icon>
  );
}

export function TeamIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 3h8l2 4v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7zM12 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM9 17h6" />
    </Icon>
  );
}

export function GlobeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.5 2.5 15.5 0 18M12 3c-2.5 2.5-2.5 15.5 0 18" />
    </Icon>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </Icon>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * Controles e feedback
 * ──────────────────────────────────────────────────────────────────────── */

/** Check do protótipo (checkbox, sucesso, OTP) — stroke 2.5 no original. */
export function CheckIcon({ strokeWidth = 2.5, ...props }: IconProps) {
  return (
    <Icon strokeWidth={strokeWidth} {...props}>
      <path d="M5 13l4 4L19 7" />
    </Icon>
  );
}

export function ChevronRightIcon({ strokeWidth = 2, ...props }: IconProps) {
  return (
    <Icon strokeWidth={strokeWidth} {...props}>
      <path d="M9 5l7 7-7 7" />
    </Icon>
  );
}

export function ChevronLeftIcon({ strokeWidth = 2, ...props }: IconProps) {
  return (
    <Icon strokeWidth={strokeWidth} {...props}>
      <path d="M15 5l-7 7 7 7" />
    </Icon>
  );
}

export function ChevronDownIcon({ strokeWidth = 2, ...props }: IconProps) {
  return (
    <Icon strokeWidth={strokeWidth} {...props}>
      <path d="M6 9l6 6 6-6" />
    </Icon>
  );
}

/** Seta "voltar" — no protótipo é o glifo `←` do header das sheets. */
export function ArrowLeftIcon({ strokeWidth = 2, ...props }: IconProps) {
  return (
    <Icon strokeWidth={strokeWidth} {...props}>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </Icon>
  );
}

/** Fechar — no protótipo é o glifo `✕` dos headers de sheet/modal. */
export function CloseIcon({ strokeWidth = 2, ...props }: IconProps) {
  return (
    <Icon strokeWidth={strokeWidth} {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Icon>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 11V7a6 6 0 0 1 12 0v4M5 11h14v10H5z" />
    </Icon>
  );
}

/** Menu hambúrguer da topbar mobile. // novo: o protótipo é desktop-fixo. */
export function MenuIcon({ strokeWidth = 2, ...props }: IconProps) {
  return (
    <Icon strokeWidth={strokeWidth} {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Icon>
  );
}

/** Kebab de ações — no protótipo é o glifo `⋯` das tabelas. */
export function MoreIcon({ strokeWidth = 2.2, ...props }: IconProps) {
  return (
    <Icon strokeWidth={strokeWidth} {...props}>
      <path d="M12 6.5h.01M12 12h.01M12 17.5h.01" />
    </Icon>
  );
}

/** Olho aberto — substitui o emoji 👁 do `ClienteAuth` por ícone de sistema. */
export function EyeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
    </Icon>
  );
}

/** Olho cortado — substitui o emoji 🙈 do `ClienteAuth`. */
export function EyeOffIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10.6 6.7A9.6 9.6 0 0 1 12 6.6c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.2 4M6.3 8.2A17.4 17.4 0 0 0 2.5 13s3.5 6.5 9.5 6.5a9.4 9.4 0 0 0 4-.87" />
      <path d="M10 10.4a3 3 0 0 0 4.2 4.2M3 3l18 18" />
    </Icon>
  );
}

export function CheckCircleIcon({ strokeWidth = 1.75, ...props }: IconProps) {
  return (
    <Icon strokeWidth={strokeWidth} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.2 2.4 2.4 4.6-4.9" />
    </Icon>
  );
}

export function AlertCircleIcon({ strokeWidth = 1.75, ...props }: IconProps) {
  return (
    <Icon strokeWidth={strokeWidth} {...props}>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="8" x2="12" y2="12.5" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </Icon>
  );
}

export function InfoCircleIcon({ strokeWidth = 1.75, ...props }: IconProps) {
  return (
    <Icon strokeWidth={strokeWidth} {...props}>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="11" x2="12" y2="16" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </Icon>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.2l3.4 2" />
    </Icon>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </Icon>
  );
}

export function PlusIcon({ strokeWidth = 2, ...props }: IconProps) {
  return (
    <Icon strokeWidth={strokeWidth} {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20c0-3.6 3.6-6 8-6s8 2.4 8 6" />
    </Icon>
  );
}

/** Spinner do estado `loading` dos botões. // novo: sem original no bundle. */
export function SpinnerIcon({ className, strokeWidth = 2, ...props }: IconProps) {
  return (
    <Icon
      strokeWidth={strokeWidth}
      className={['animate-spin', className].filter(Boolean).join(' ')}
      {...props}
    >
      <path d="M12 3a9 9 0 1 0 9 9" />
    </Icon>
  );
}

/**
 * Ilustração de agenda vazia — cópia do SVG 120×120 de `MinhaConta.dc.html`
 * ("Você ainda não tem horários marcados"). Usada como ilustração padrão do
 * `EmptyState`; a cor vem de `currentColor` (aplicar `text-border`).
 */
export function EmptyCalendarArt({ size = 100, className, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      aria-hidden="true"
      focusable="false"
      className={className}
      {...props}
    >
      <circle cx="60" cy="28" r="16" />
      <rect x="30" y="55" width="60" height="30" rx="6" />
      <line x1="60" y1="85" x2="60" y2="105" />
      <line x1="35" y1="105" x2="85" y2="105" />
    </svg>
  );
}
