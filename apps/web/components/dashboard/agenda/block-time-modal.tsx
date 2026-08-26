'use client';

import { useEffect, useState } from 'react';
import { Button, Input, Modal, Select, Textarea, cn, useToast } from '@barbervp/ui';
import type { StaffAgendaResponse } from '@barbervp/types';
import { useCreateAgendaBlockMutation } from '@/lib/dashboard/api/agenda';
import { agendaErrorMessage } from './agenda-shared';

/** Motivos do protótipo (l.4424) — rótulos, não regra de negócio. */
const REASONS = ['Férias', 'Feriado', 'Manutenção', 'Pessoal'] as const;

/** Valor do `<select>` que representa "a barbearia inteira". */
const WHOLE_SHOP = '';

export interface BlockTimeModalProps {
  open: boolean;
  onClose: () => void;
  /** Dia visível na agenda — pré-preenche as duas datas. */
  date: string;
  barberOptions: StaffAgendaResponse['barberOptions'];
  /** `BARBER` só bloqueia a própria agenda: o select some e o id vem travado. */
  fixedBarberId?: string;
}

/**
 * Modal "Bloquear horário" (`Dashboard.dc.html` l.3779–3833).
 *
 * Grava um `ScheduleException` do tipo `BLOCK`, o mesmo registro que a aba
 * Equipe usa para folgas — logo o bloqueio fecha também a grade pública, e não
 * só a visão interna.
 */
export function BlockTimeModal({
  open,
  onClose,
  date,
  barberOptions,
  fixedBarberId,
}: BlockTimeModalProps) {
  const { toast } = useToast();
  const createBlock = useCreateAgendaBlockMutation();

  const [barberId, setBarberId] = useState<string>(fixedBarberId ?? WHOLE_SHOP);
  const [startDate, setStartDate] = useState(date);
  const [endDate, setEndDate] = useState(date);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [reason, setReason] = useState<string>(REASONS[0]);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    setBarberId(fixedBarberId ?? WHOLE_SHOP);
    setStartDate(date);
    setEndDate(date);
    setStartTime('');
    setEndTime('');
    setReason(REASONS[0]);
    setNotes('');
  }, [open, date, fixedBarberId]);

  // As duas horas andam juntas: ou a faixa, ou o dia inteiro.
  const partialTime = Boolean(startTime) !== Boolean(endTime);
  const badRange = Boolean(startTime && endTime && endTime <= startTime);
  const badDates = endDate < startDate;
  const canSubmit = !partialTime && !badRange && !badDates && Boolean(startDate && endDate);

  const problem = badDates
    ? 'A data de fim não pode ser anterior à de início.'
    : partialTime
      ? 'Informe as duas horas, ou nenhuma para bloquear o dia inteiro.'
      : badRange
        ? 'A hora de fim precisa ser maior que a de início.'
        : null;

  const submit = async () => {
    if (!canSubmit) return;
    try {
      await createBlock.mutateAsync({
        barberId: barberId === WHOLE_SHOP ? null : barberId,
        startDate,
        endDate,
        startTime: startTime || null,
        endTime: endTime || null,
        reason,
        notes: notes.trim() || null,
      });
      toast({
        message: startTime ? 'Horário bloqueado.' : 'Dia bloqueado.',
        tone: 'success',
      });
      onClose();
    } catch (error) {
      toast({ message: agendaErrorMessage(error), tone: 'danger' });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Bloquear horário"
      footer={
        <div className="flex justify-end gap-2.5">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={createBlock.isPending} disabled={!canSubmit} onClick={() => void submit()}>
            Bloquear
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3.5">
        {!fixedBarberId && (
          <Select
            label="Barbeiro"
            value={barberId}
            onChange={(event) => setBarberId(event.target.value)}
            options={[
              { value: WHOLE_SHOP, label: 'Todos' },
              ...barberOptions.map((barber) => ({ value: barber.id, label: barber.name })),
            ]}
          />
        )}

        <div className="flex gap-3">
          <Input
            label="Data início"
            type="date"
            className="flex-1"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
          <Input
            label="Data fim"
            type="date"
            className="flex-1"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </div>

        <div className="flex gap-3">
          <Input
            label="Hora início"
            type="time"
            className="flex-1"
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
          />
          <Input
            label="Hora fim"
            type="time"
            className="flex-1"
            value={endTime}
            onChange={(event) => setEndTime(event.target.value)}
          />
        </div>
        <p className="-mt-1.5 text-xs text-fg-muted">
          Sem horas, o bloqueio vale para o dia inteiro.
        </p>

        <fieldset>
          <legend className="mb-1.5 text-[13px] font-medium text-fg-muted">Motivo</legend>
          <div className="flex flex-wrap gap-2">
            {REASONS.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={reason === option}
                onClick={() => setReason(option)}
                className={cn(
                  'min-h-11 rounded-[20px] px-3 py-1.5 text-xs font-medium transition-colors md:min-h-0',
                  reason === option
                    ? 'bg-gold text-bg'
                    : 'bg-transparent text-fg-muted hover:bg-surface-3',
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </fieldset>

        <Textarea
          label="Observações (opcional)"
          rows={2}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />

        {problem && <p className="text-xs text-danger">{problem}</p>}
      </div>
    </Modal>
  );
}
