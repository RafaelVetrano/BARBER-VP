'use client';

import { Avatar, Badge, Button, type BadgeTone } from '@barbervp/ui';
import type { ServiceListItem, StaffInviteListItem } from '@barbervp/types';

const STATUS: Record<StaffInviteListItem['status'], { label: string; tone: BadgeTone }> = {
  PENDING: { label: 'Aguardando cadastro', tone: 'warning' },
  ACCEPTED: { label: 'Cadastro concluído', tone: 'success' },
  EXPIRED: { label: 'Expirado', tone: 'neutral' },
  REVOKED: { label: 'Cancelado', tone: 'danger' },
};

const SENT_AT = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

/**
 * Linha de convite (`Dashboard.dc.html` l.2121–2147).
 *
 * O desenho traz uma terceira ação, "Simular cadastro concluído", que era o
 * atalho de demonstração do protótipo. Aqui ela é "Gerar link de cadastro":
 * mesma posição e mesmo peso visual, mas fazendo a coisa real — reemitir o
 * link do `CadastroFuncionario` para o dono concluir o cadastro com o
 * barbeiro ao lado. Fingir o aceite criaria um `Membership` que ninguém pediu.
 */
export function InviteRow({
  invite,
  services,
  busy,
  onResend,
  onCancel,
  onCopyLink,
}: {
  invite: StaffInviteListItem;
  services: ServiceListItem[];
  busy: boolean;
  onResend: () => void;
  onCancel: () => void;
  onCopyLink: () => void;
}) {
  const status = STATUS[invite.status];
  const serviceNames = invite.serviceIds
    .map((id) => services.find((service) => service.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  const isPending = invite.status === 'PENDING';

  return (
    <article className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-surface p-4 md:px-5">
      <Avatar name={invite.name} size="lg" />

      <div className="flex min-w-[160px] flex-1 flex-col gap-0.5">
        <span className="font-display text-[15px] font-bold text-fg">{invite.name}</span>
        <span className="truncate text-xs text-fg-muted">{invite.email}</span>
      </div>

      <div className="flex max-w-[220px] flex-wrap gap-1.5">
        {serviceNames.map((name) => (
          <span
            key={name}
            className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-fg"
          >
            {name}
          </span>
        ))}
      </div>

      <div className="flex min-w-[150px] flex-col items-start gap-1.5">
        <Badge tone={status.tone}>{status.label}</Badge>
        <span className="text-xs text-fg-muted">
          Enviado em {SENT_AT.format(new Date(invite.createdAt))}
        </span>
      </div>

      {isPending && (
        <div className="flex flex-col items-stretch gap-2 md:items-end">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={busy} onClick={onResend}>
              Reenviar email
            </Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={onCancel}>
              Cancelar convite
            </Button>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onCopyLink}
            className="min-h-11 rounded-lg text-[13px] font-medium text-info hover:underline disabled:opacity-50 md:min-h-0"
          >
            Gerar link de cadastro
          </button>
        </div>
      )}
    </article>
  );
}
