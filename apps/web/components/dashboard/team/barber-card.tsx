'use client';

import { Avatar, Badge, Button, type BadgeTone } from '@barbervp/ui';
import { WEEKDAY_LABELS, formatPhone } from '@barbervp/types';
import type { BarberListItem } from '@barbervp/types';

/**
 * Card do grid da aba Equipe (`Dashboard.dc.html` l.2054–2087).
 *
 * A ordem dos blocos é a do desenho: cabeçalho com avatar/nome/WhatsApp e o
 * selo de status à direita, as pílulas dos serviços, o par
 * "Dias de trabalho"/"Comissão" separado por uma divisória, e os dois botões.
 */
export function BarberCard({
  barber,
  onEdit,
  onViewAgenda,
}: {
  barber: BarberListItem;
  onEdit: () => void;
  onViewAgenda: () => void;
}) {
  const status = statusOf(barber);

  return (
    <article
      className={`flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 ${
        // O desenho apaga o card do barbeiro que não está atendendo (`b.cardStyle`).
        barber.active ? '' : 'opacity-60'
      }`}
    >
      <div className="flex items-center gap-3">
        <Avatar name={barber.name} src={barber.avatarUrl} size="lg" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate font-display text-[15px] font-bold text-fg">{barber.name}</span>
          <span className="truncate text-xs text-fg-muted">
            {barber.phone ? formatPhone(barber.phone) : 'Sem WhatsApp cadastrado'}
          </span>
        </div>
        <Badge tone={status.tone} className="ml-auto shrink-0">
          {status.label}
        </Badge>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {barber.serviceNames.length > 0 ? (
          barber.serviceNames.map((name) => (
            <span
              key={name}
              className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-fg"
            >
              {name}
            </span>
          ))
        ) : (
          // Sem serviço marcado o barbeiro não aparece em nenhum passo do
          // agendamento — vale um aviso, não uma fileira de pílulas vazia.
          <span className="text-[11px] font-medium text-warning">
            Nenhum serviço marcado — não aparece no agendamento
          </span>
        )}
      </div>

      <dl className="flex flex-col gap-2 border-t border-border pt-2">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-xs text-fg-muted">Dias de trabalho</dt>
          <dd className="text-right text-[13px] font-semibold text-fg">{workDaysLabel(barber)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-xs text-fg-muted">Comissão</dt>
          <dd className="text-right text-[13px] font-semibold text-gold">
            {barber.commissionLabel ?? 'Sem regra'}
          </dd>
        </div>
      </dl>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1" onClick={onEdit}>
          Editar
        </Button>
        <Button variant="outline" size="sm" className="flex-1" onClick={onViewAgenda}>
          Ver agenda
        </Button>
      </div>
    </article>
  );
}

/**
 * "Inativo pelo plano" é um estado à parte de "Inativo" (protótipo l.2027): o
 * primeiro volta sozinho no upgrade, o segundo foi decisão do dono.
 */
function statusOf(barber: BarberListItem): { label: string; tone: BadgeTone } {
  if (barber.active) {
    return { label: 'Ativo', tone: 'success' };
  }
  return barber.inactiveByPlan
    ? { label: 'Inativo pelo plano', tone: 'danger' }
    : { label: 'Inativo', tone: 'neutral' };
}

/**
 * "Seg a Sex", "Seg, Qua e Sex", "Todos os dias" — o rótulo compacto do card.
 *
 * Faixa contínua vira "X a Y"; o resto sai enumerado. Sem isto o card teria de
 * mostrar sete siglas e brigar por espaço com o selo de status.
 */
function workDaysLabel(barber: BarberListItem): string {
  const working = barber.workSchedule.filter((day) => !day.isDayOff).map((day) => day.weekday);
  if (working.length === 0) return 'Nenhum';
  if (working.length === 7) return 'Todos os dias';

  const short = (weekday: number) => WEEKDAY_LABELS[weekday]!.slice(0, 3);
  const contiguous = working.every((weekday, index) => index === 0 || weekday === working[index - 1]! + 1);

  if (contiguous && working.length > 2) {
    return `${short(working[0]!)} a ${short(working[working.length - 1]!)}`;
  }
  const labels = working.map(short);
  return labels.length === 1
    ? labels[0]!
    : `${labels.slice(0, -1).join(', ')} e ${labels[labels.length - 1]}`;
}
