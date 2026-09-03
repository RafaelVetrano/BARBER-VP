'use client';

import { Avatar, Button, Checkbox, ChevronDownIcon, Popover, Segmented } from '@barbervp/ui';
import type { StaffAgendaResponse } from '@barbervp/types';
import { formatAgendaDate } from './agenda-shared';

export type AgendaTab = 'DAY' | 'WEEK' | 'MONTH' | 'TIMELINE';

export interface AgendaToolbarProps {
  date: string;
  onDateChange: (date: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  view: AgendaTab;
  onViewChange: (view: AgendaTab) => void;
  barberOptions: StaffAgendaResponse['barberOptions'];
  /** Vazio = todos os barbeiros (o rótulo vira "Todos os barbeiros"). */
  selectedBarberIds: string[];
  onToggleBarber: (barberId: string) => void;
  /** `BARBER` não filtra nem bloqueia a agenda dos outros. */
  showBarberFilter: boolean;
  onOpenBlock: () => void;
  onCopyLink: () => void;
  onNewAppointment: () => void;
}

/**
 * Barra superior da aba Agenda (`Dashboard.dc.html` l.396–440).
 *
 * Ordem 1:1 com o protótipo: navegador `‹ Hoje ›` → data → 4 visões → filtro
 * de barbeiro à esquerda; "Bloquear horário", "Copiar link" e "+ Novo
 * agendamento" à direita.
 */
export function AgendaToolbar({
  date,
  onDateChange,
  onPrev,
  onNext,
  onToday,
  view,
  onViewChange,
  barberOptions,
  selectedBarberIds,
  onToggleBarber,
  showBarberFilter,
  onOpenBlock,
  onCopyLink,
  onNewAppointment,
}: AgendaToolbarProps) {
  const filterLabel =
    selectedBarberIds.length === 0 || selectedBarberIds.length === barberOptions.length
      ? 'Todos os barbeiros'
      : selectedBarberIds.length === 1
        ? (barberOptions.find((barber) => barber.id === selectedBarberIds[0])?.name ?? '1 barbeiro')
        : `${selectedBarberIds.length} barbeiros`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2.5">
        {/* ── Navegador ‹ Hoje › — pílula única (l.398–402) ── */}
        <div className="flex items-center gap-0.5 rounded-[9px] border border-border bg-surface p-1">
          <button
            type="button"
            aria-label="Dia anterior"
            onClick={onPrev}
            className="flex h-11 w-11 items-center justify-center rounded-md text-[15px] font-semibold text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg md:h-7 md:w-7"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={onToday}
            className="flex h-11 items-center whitespace-nowrap px-2.5 text-[13px] font-semibold text-gold md:h-7"
          >
            Hoje
          </button>
          <button
            type="button"
            aria-label="Próximo dia"
            onClick={onNext}
            className="flex h-11 w-11 items-center justify-center rounded-md text-[15px] font-semibold text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg md:h-7 md:w-7"
          >
            ›
          </button>
        </div>

        {/* ── Data: rótulo por extenso com o input por cima (l.403–406) ── */}
        {/*
            `h-12`, e não `h-11`: o `input` deitado por cima é `inset-0`, então
            mede a caixa de conteúdo — 44px de wrapper menos as duas bordas dão
            42px de alvo, abaixo do mínimo. 48px é a altura de input do design
            system de qualquer forma.
        */}
        <div className="relative flex h-12 items-center rounded-[9px] border border-border bg-surface px-3 md:h-[38px]">
          <span className="whitespace-nowrap text-[13px] font-medium capitalize text-fg">
            {formatAgendaDate(date)}
          </span>
          <input
            type="date"
            aria-label="Escolher data"
            value={date}
            onChange={(event) => event.target.value && onDateChange(event.target.value)}
            className="absolute inset-0 w-full cursor-pointer opacity-0"
          />
        </div>

        {/* ── As 4 visões (l.407–412) ── */}
        <Segmented
          label="Visão da agenda"
          value={view}
          onChange={onViewChange}
          options={[
            { value: 'DAY', label: 'Dia' },
            { value: 'WEEK', label: 'Semana' },
            { value: 'MONTH', label: 'Mês' },
            { value: 'TIMELINE', label: 'Timeline' },
          ]}
        />

        {/* ── Filtro multi-seleção de barbeiro (l.413–433) ── */}
        {showBarberFilter && barberOptions.length > 1 && (
          <Popover
            label="Filtrar por barbeiro"
            align="start"
            width={220}
            title="Barbeiros"
            triggerClassName="flex h-11 items-center gap-2 rounded-[9px] border border-border bg-surface px-3 md:h-[38px]"
            trigger={
              <>
                <span className="whitespace-nowrap text-[13px] font-medium text-fg">{filterLabel}</span>
                <ChevronDownIcon size={12} className="text-fg-muted" />
              </>
            }
          >
            {() => (
              <div className="flex flex-col gap-0.5">
                {barberOptions.map((barber) => {
                  const checked =
                    selectedBarberIds.length === 0 || selectedBarberIds.includes(barber.id);
                  return (
                    <label
                      key={barber.id}
                      className="flex cursor-pointer items-center gap-2.5 rounded-[7px] px-2.5 py-2 transition-colors hover:bg-surface-3"
                    >
                      <Checkbox checked={checked} onChange={() => onToggleBarber(barber.id)} />
                      <Avatar name={barber.name} src={barber.avatarUrl} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg">
                        {barber.name}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </Popover>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        {/* `BARBER` também bloqueia — mas só a própria agenda (o modal trava o
            barbeiro e o backend recusa qualquer outro). */}
        <Button variant="outline" onClick={onOpenBlock}>
          Bloquear horário
        </Button>
        <Button variant="outline" onClick={onCopyLink}>
          Copiar link de agendamento
        </Button>
        <Button onClick={onNewAppointment}>+ Novo agendamento</Button>
      </div>
    </div>
  );
}
