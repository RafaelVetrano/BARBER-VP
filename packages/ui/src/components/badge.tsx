import type { ReactNode } from 'react';
import { AppointmentStatus } from '@barbervp/types';
import { cn } from '../lib/cn';

export type BadgeTone = 'neutral' | 'gold' | 'success' | 'warning' | 'danger' | 'info';

export interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  /** `soft` (padrão) = fundo translúcido; `solid` = preenchido. */
  variant?: 'soft' | 'solid';
  className?: string;
}

// O protótipo monta o fundo como `cor + '26'` (≈15% de opacidade) sobre a
// superfície e usa a própria cor no texto — reproduzido com o modificador de
// opacidade do Tailwind.
const SOFT: Record<BadgeTone, string> = {
  neutral: 'bg-fg-muted/15 text-fg-muted',
  gold: 'bg-gold/15 text-gold',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  danger: 'bg-danger/15 text-danger',
  info: 'bg-info/15 text-info',
};

const SOLID: Record<BadgeTone, string> = {
  neutral: 'bg-fg-muted text-bg',
  gold: 'bg-gold text-bg',
  success: 'bg-success text-bg',
  warning: 'bg-warning text-bg',
  danger: 'bg-danger text-bg',
  info: 'bg-info text-bg',
};

/**
 * Pílula de rótulo — 11px em negrito, raio total, como as etiquetas das
 * tabelas do `Dashboard.dc.html` e o selo "Incluído na assinatura" do wizard.
 */
export function Badge({ children, tone = 'neutral', variant = 'soft', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1',
        'text-[11px] font-semibold leading-none',
        variant === 'soft' ? SOFT[tone] : SOLID[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export interface StatusPillProps {
  label: ReactNode;
  tone: BadgeTone;
  className?: string;
}

/**
 * `Badge` com semântica de status: além da cor, marca `role="status"` para
 * que a mudança seja anunciada — cor sozinha não comunica estado (regra 6).
 */
export function StatusPill({ label, tone, className }: StatusPillProps) {
  return (
    <span role="status">
      <Badge tone={tone} className={className}>
        {label}
      </Badge>
    </span>
  );
}

/**
 * Aparência de cada status de agendamento — cores e rótulos pt-BR extraídos do
 * `STATUS_COLORS` do `Dashboard.dc.html`, ligados ao enum real do schema.
 */
export const APPOINTMENT_STATUS_APPEARANCE: Record<
  AppointmentStatus,
  { label: string; tone: BadgeTone }
> = {
  [AppointmentStatus.SCHEDULED]: { label: 'Pendente', tone: 'warning' },
  [AppointmentStatus.CONFIRMED]: { label: 'Confirmado', tone: 'success' },
  [AppointmentStatus.DONE]: { label: 'Concluído', tone: 'info' },
  [AppointmentStatus.NO_SHOW]: { label: 'Falta', tone: 'danger' },
  [AppointmentStatus.CANCELED]: { label: 'Cancelado', tone: 'neutral' },
};

/** Pílula de status de agendamento a partir do enum — sem strings soltas na UI. */
export function AppointmentStatusPill({
  status,
  className,
}: {
  status: AppointmentStatus;
  className?: string;
}) {
  const appearance = APPOINTMENT_STATUS_APPEARANCE[status];
  return <StatusPill label={appearance.label} tone={appearance.tone} className={className} />;
}
