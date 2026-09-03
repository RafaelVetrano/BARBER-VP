'use client';

import { useEffect, useState } from 'react';
import { Avatar, EmptyState, cn } from '@barbervp/ui';
import type { StaffAgendaDay, StaffAppointmentItem, StaffAgendaResponse } from '@barbervp/types';
import {
  STATUS_BLOCK_CLASSES,
  minutesOfDay,
  minutesToLabel,
  shouldWarnNoShow,
  todayKey,
} from './agenda-shared';

/** Altura de um minuto na grade, em px. 60min = 66px — a proporção do protótipo. */
/**
 * Escala vertical da grade, em px por minuto.
 *
 * No CELULAR ela é maior de propósito: o bloco do agendamento é um alvo de
 * toque (abre o drawer), e a 1.1 px/min um atendimento de 30 minutos rendia
 * 31px de altura — abaixo dos 44px de dedo. A 1.6, o mesmo atendimento dá
 * 46px. A grade fica mais alta e rola mais; é o preço honesto de um alvo que
 * o dedo acerta.
 */
const PX_PER_MINUTE_COMPACT = 1.6;
const PX_PER_MINUTE_WIDE = 1.1;

/** Altura mínima de um bloco para o texto ainda caber. */
/**
 * Piso de altura do bloco. No celular ele é o próprio mínimo de toque: um
 * atendimento curto (15 min) desenha 44px e avança sobre o horário seguinte —
 * é o que qualquer agenda faz com evento curto, e é preferível a um alvo que
 * não dá para acertar.
 */
const MIN_BLOCK_HEIGHT_COMPACT = 44;
const MIN_BLOCK_HEIGHT_WIDE = 22;

export interface AgendaDayGridProps {
  day: StaffAgendaDay;
  agenda: StaffAgendaResponse;
  onOpenAppointment: (appointment: StaffAppointmentItem) => void;
  /** Clique em espaço vago → criação rápida já com barbeiro e hora. */
  onPickSlot: (barberId: string, time: string) => void;
}

/**
 * Visão Dia (`Dashboard.dc.html` l.442–481): trilho de horas à esquerda e uma
 * coluna por barbeiro, com os atendimentos posicionados por horário.
 *
 * A régua vertical vem de `gridStartMinutes`/`gridEndMinutes` da API — o
 * protótipo cravava 08:00–20:00, aqui o expediente é o real da barbearia.
 */
export function AgendaDayGrid({
  day,
  agenda,
  onOpenAppointment,
  onPickSlot,
}: AgendaDayGridProps) {
  const { gridStartMinutes: start, gridEndMinutes: end, timezone, slotIntervalMinutes } = agenda;
  const span = end - start;

  const compact = useCompactGrid();
  const pxPerMinute = compact ? PX_PER_MINUTE_COMPACT : PX_PER_MINUTE_WIDE;
  const minBlockHeight = compact ? MIN_BLOCK_HEIGHT_COMPACT : MIN_BLOCK_HEIGHT_WIDE;

  const nowMinutes = useNowMinutes(timezone);
  const isToday = day.date === todayKey();
  const showNowLine = isToday && nowMinutes >= start && nowMinutes <= end;

  if (day.barbers.length === 0) {
    return <EmptyState message="Nenhum barbeiro ativo para exibir nesta agenda." />;
  }

  if (span <= 0) {
    return (
      <EmptyState
        message="Ninguém trabalha neste dia"
        description="Sem expediente na escala e sem horário de funcionamento configurado para esta data."
      />
    );
  }

  const height = span * pxPerMinute;

  // Uma marca a cada 30min; só as horas cheias recebem rótulo, como no protótipo.
  const marks: Array<{ minute: number; label: string }> = [];
  for (let minute = Math.ceil(start / 30) * 30; minute < end; minute += 30) {
    marks.push({ minute, label: minute % 60 === 0 ? minutesToLabel(minute) : '' });
  }

  return (
    <div className="flex overflow-hidden rounded-xl border border-border bg-surface">
      {/* ── Trilho de horas ── */}
      <div className="w-[52px] shrink-0 border-r border-border">
        <div className="h-14 border-b border-border" />
        <div className="relative" style={{ height }}>
          {marks.map((mark) => (
            <span
              key={mark.minute}
              className="absolute right-2 -translate-y-1/2 text-[11px] font-medium tabular-nums text-fg-subtle"
              style={{ top: (mark.minute - start) * pxPerMinute }}
            >
              {mark.label}
            </span>
          ))}
        </div>
      </div>

      {/* ── Colunas por barbeiro ── */}
      <div className="relative flex flex-1 overflow-x-auto">
        {day.barbers.map((column) => {
          const open = column.workStartMinutes !== null && column.workEndMinutes !== null;

          return (
            <div
              key={column.barberId}
              className="flex min-w-[170px] flex-1 flex-col border-r border-border last:border-r-0"
            >
              <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-2.5">
                <Avatar name={column.barberName} src={column.avatarUrl} size="sm" />
                <span className="truncate text-[13px] font-medium text-fg">{column.barberName}</span>
              </div>

              <div className="relative" style={{ height }}>
                {/* Fora do expediente — inclusive o dia inteiro em folga. */}
                <OutOfHours
                  from={start}
                  to={open ? column.workStartMinutes! : end}
                  gridStart={start}
                  pxPerMinute={pxPerMinute}
                  label={open ? undefined : 'Sem expediente'}
                />
                {open && (
                  <OutOfHours
                    from={column.workEndMinutes!}
                    to={end}
                    gridStart={start}
                    pxPerMinute={pxPerMinute}
                  />
                )}

                {/* Grade de meia hora — dá o mesmo ritmo visual do trilho. */}
                {marks.map((mark) => (
                  <div
                    key={mark.minute}
                    className={cn(
                      'pointer-events-none absolute inset-x-0 border-t',
                      mark.minute % 60 === 0 ? 'border-border' : 'border-border/40',
                    )}
                    style={{ top: (mark.minute - start) * pxPerMinute }}
                  />
                ))}

                {/* Cliques em vago: uma faixa por slot, atrás dos blocos. */}
                {open && (
                  <SlotTargets
                    from={column.workStartMinutes!}
                    to={column.workEndMinutes!}
                    gridStart={start}
                    interval={slotIntervalMinutes}
                    pxPerMinute={pxPerMinute}
                    barberName={column.barberName}
                    onPick={(time) => onPickSlot(column.barberId, time)}
                  />
                )}

                {/* Almoço — a faixa hachurada do protótipo (l.458). */}
                {column.lunchStartMinutes !== null && column.lunchEndMinutes !== null && (
                  <Band
                    from={column.lunchStartMinutes}
                    to={column.lunchEndMinutes}
                    gridStart={start}
                    pxPerMinute={pxPerMinute}
                    label="Almoço"
                  />
                )}

                {column.blocks.map((block) => (
                  <Band
                    key={block.id}
                    from={block.startMinutes}
                    to={block.endMinutes}
                    gridStart={start}
                    pxPerMinute={pxPerMinute}
                    label={block.reason ?? 'Bloqueado'}
                  />
                ))}

                {column.appointments.map((appointment) => {
                  const from = minutesOfDay(appointment.startsAt, timezone);
                  const tone = STATUS_BLOCK_CLASSES[appointment.status];

                  return (
                    <button
                      key={appointment.id}
                      type="button"
                      onClick={() => onOpenAppointment(appointment)}
                      className={cn(
                        'absolute inset-x-1 flex flex-col gap-px overflow-hidden rounded-md border px-1.5 py-1 pl-2 text-left',
                        tone.block,
                      )}
                      style={{
                        top: (from - start) * pxPerMinute,
                        height: Math.max(appointment.durationMin * pxPerMinute - 2, minBlockHeight),
                      }}
                    >
                      <ServiceAccent services={appointment.services} />
                      <span className="flex items-center gap-1">
                        <span className={cn('text-[11px] font-semibold tabular-nums', tone.text)}>
                          {minutesToLabel(from)}
                        </span>
                        {shouldWarnNoShow(appointment) && (
                          <span
                            title={`Cliente com ${appointment.clientNoShowCount} faltas`}
                            className="text-[11px] text-warning"
                          >
                            ⚠
                          </span>
                        )}
                      </span>
                      <span className="truncate text-xs font-medium text-fg">
                        {appointment.clientName}
                      </span>
                      <span className="truncate text-[11px] text-fg-muted">
                        {appointment.services.map((service) => service.name).join(' + ')}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* ── Linha "agora" (l.475–478) ── */}
        {showNowLine && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-danger"
            style={{ top: 56 + (nowMinutes - start) * pxPerMinute }}
          >
            <span className="absolute left-1 -top-2 rounded px-1.5 text-[10px] font-semibold text-fg bg-danger">
              agora
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Faixa hachurada — almoço e bloqueios. */
/**
 * Faixa de acento com a "Cor na agenda" do serviço (`Service.color`, escolhida
 * no catálogo — protótipo l.1993).
 *
 * O TOM do bloco continua sendo o do status, como o protótipo desenha a agenda
 * (`STATUS_COLORS`, l.5041): a cor do serviço entra como faixa lateral, para
 * que o campo do catálogo tenha efeito sem apagar a leitura de status. Serviço
 * sem cor definida não desenha faixa nenhuma.
 */
function ServiceAccent({ services }: { services: StaffAppointmentItem['services'] }) {
  const color = services.find((service) => service.color)?.color;
  if (!color) return null;

  return (
    <span
      aria-hidden
      className="absolute inset-y-0 left-0 w-1 rounded-l"
      style={{ background: color }}
    />
  );
}

function Band({
  from,
  to,
  gridStart,
  pxPerMinute,
  label,
}: {
  from: number;
  to: number;
  gridStart: number;
  pxPerMinute: number;
  label: string;
}) {
  return (
    <div
      className="absolute inset-x-0 flex items-center justify-center border-y border-border bg-[repeating-linear-gradient(45deg,theme(colors.border.DEFAULT),theme(colors.border.DEFAULT)_6px,theme(colors.surface.3)_6px,theme(colors.surface.3)_12px)] text-[11px] font-semibold text-fg-muted"
      style={{ top: (from - gridStart) * pxPerMinute, height: (to - from) * pxPerMinute }}
    >
      <span className="truncate px-2">{label}</span>
    </div>
  );
}

/** Sombreado de fora-de-expediente. */
function OutOfHours({
  from,
  to,
  gridStart,
  pxPerMinute,
  label,
}: {
  from: number;
  to: number;
  gridStart: number;
  pxPerMinute: number;
  label?: string;
}) {
  if (to <= from) return null;
  return (
    <div
      aria-hidden
      className="absolute inset-x-0 flex items-center justify-center bg-bg/60"
      style={{ top: (from - gridStart) * pxPerMinute, height: (to - from) * pxPerMinute }}
    >
      {label && <span className="text-[11px] text-fg-subtle">{label}</span>}
    </div>
  );
}

/**
 * Alvos de clique em horário vago (regra da fase: "clique em slot vago abre
 * criação rápida"). Ficam ATRÁS dos blocos de agendamento, então um horário
 * ocupado abre o drawer e não o modal de criação.
 *
 * **Só a partir de `md`.** A faixa de um slot tem a altura do próprio slot na
 * grade — 15 min viram ~17px —, e não há como esticá-la para os 44px de dedo
 * sem desalinhar o horário que ela representa, que é a única coisa que ela
 * significa. No celular o caminho é o "+ Novo agendamento" da barra, que abre
 * o mesmo modal com a grade de horários em chips de tamanho de dedo. Dois
 * ramos de render, e não um alvo que promete um toque que não funciona.
 */
function SlotTargets({
  from,
  to,
  gridStart,
  interval,
  pxPerMinute,
  barberName,
  onPick,
}: {
  from: number;
  to: number;
  gridStart: number;
  interval: number;
  pxPerMinute: number;
  barberName: string;
  onPick: (time: string) => void;
}) {
  const targets: number[] = [];
  for (let minute = Math.ceil(from / interval) * interval; minute < to; minute += interval) {
    targets.push(minute);
  }

  return (
    <>
      {targets.map((minute) => (
        <button
          key={minute}
          type="button"
          aria-label={`Agendar ${minutesToLabel(minute)} com ${barberName}`}
          onClick={() => onPick(minutesToLabel(minute))}
          className="absolute inset-x-0 hidden transition-colors hover:bg-gold/10 md:block"
          style={{ top: (minute - gridStart) * pxPerMinute, height: interval * pxPerMinute }}
        />
      ))}
    </>
  );
}

/**
 * `true` abaixo de `md` (768px), onde a régua de toque de 44px vale.
 *
 * Começa em `false` para casar com a renderização do servidor e só então
 * consulta o `matchMedia` — o mesmo caminho que `Popover` e a busca global já
 * usam nesta base. A diferença aparece num quadro, antes de qualquer dado da
 * agenda chegar.
 */
function useCompactGrid(): boolean {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)');
    const sync = () => setCompact(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  return compact;
}

/** Minuto local corrente, atualizado a cada minuto — a linha "agora" anda. */
function useNowMinutes(timezone: string): number {
  const read = () =>
    minutesOfDay(new Date().toISOString(), timezone);

  const [minutes, setMinutes] = useState(read);

  useEffect(() => {
    const timer = window.setInterval(() => setMinutes(read()), 60_000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timezone]);

  return minutes;
}
