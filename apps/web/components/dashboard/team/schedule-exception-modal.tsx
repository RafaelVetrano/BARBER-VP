'use client';

import { useEffect, useState } from 'react';
import { Button, Input, Modal, Select, Textarea, useToast } from '@barbervp/ui';
import { ScheduleExceptionType } from '@barbervp/types';
import type { BarberListItem } from '@barbervp/types';
import { useCreateScheduleExceptionMutation } from '@/lib/dashboard/api/team';

const TYPE_OPTIONS = [
  { value: ScheduleExceptionType.DAY_OFF, label: 'Folga' },
  { value: ScheduleExceptionType.VACATION, label: 'Férias' },
  { value: ScheduleExceptionType.HOLIDAY, label: 'Feriado (barbearia inteira)' },
];

const todayKey = () => new Date().toISOString().slice(0, 10);

/**
 * Cadastro da folga/férias que a matriz da escala mostra.
 *
 * `HOLIDAY` fecha a barbearia inteira e por isso não pede barbeiro — é o
 * `barberId: null` que o endpoint já aceitava e nenhuma tela usava.
 */
export function ScheduleExceptionModal({
  open,
  onClose,
  barbers,
}: {
  open: boolean;
  onClose: () => void;
  barbers: BarberListItem[];
}) {
  const { toast } = useToast();
  const create = useCreateScheduleExceptionMutation();

  const [type, setType] = useState<string>(ScheduleExceptionType.DAY_OFF);
  const [barberId, setBarberId] = useState('');
  const [startDate, setStartDate] = useState(todayKey);
  const [endDate, setEndDate] = useState(todayKey);
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!open) return;
    setType(ScheduleExceptionType.DAY_OFF);
    setBarberId(barbers[0]?.id ?? '');
    setStartDate(todayKey());
    setEndDate(todayKey());
    setReason('');
  }, [open, barbers]);

  const isHoliday = type === ScheduleExceptionType.HOLIDAY;
  const invalidRange = endDate < startDate;
  const canSubmit = (isHoliday || barberId !== '') && !invalidRange && !create.isPending;

  const submit = async () => {
    if (!canSubmit) return;
    try {
      await create.mutateAsync({
        barberId: isHoliday ? null : barberId,
        startDate,
        endDate,
        type: type as ScheduleExceptionType,
        reason: reason.trim() || null,
      });
      toast({ message: 'Período registrado na escala.', tone: 'success' });
      onClose();
    } catch (error) {
      toast({
        message: error instanceof Error ? error.message : 'Não foi possível registrar o período.',
        tone: 'danger',
      });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Folga, férias ou feriado"
      footer={
        <div className="flex justify-end gap-2.5">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={create.isPending} disabled={!canSubmit} onClick={() => void submit()}>
            Registrar
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Select
          label="Tipo"
          value={type}
          onChange={(event) => setType(event.target.value)}
          options={TYPE_OPTIONS}
        />

        {!isHoliday && (
          <Select
            label="Barbeiro"
            value={barberId}
            onChange={(event) => setBarberId(event.target.value)}
            options={barbers.map((barber) => ({ value: barber.id, label: barber.name }))}
          />
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Início"
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
          <Input
            label="Fim"
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            error={invalidRange ? 'O fim precisa ser igual ou depois do início.' : undefined}
          />
        </div>

        <Textarea
          label="Motivo (opcional)"
          rows={2}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>
    </Modal>
  );
}
