'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useClientAuth, Button, DatePicker, EmptyState, Modal, TimeSlotGrid, useToast, authErrorMessage, type DayOption } from '@barbervp/ui';
import type { ClientAppointmentItem } from '@barbervp/types';
import { bookingApi } from '@/lib/booking/booking-api';
import { MONTH_ABBR, WEEKDAY_ABBR, parseDateKey } from '@/lib/booking/format';

export interface RescheduleDialogProps {
  open: boolean;
  onClose: () => void;
  slug: string;
  appointment: ClientAppointmentItem | null;
}

/**
 * Remarcar da `MinhaConta` — mesma grade de disponibilidade do wizard
 * (`DatePicker`/`TimeSlotGrid`), com o barbeiro FIXO no que já atendia: trocar
 * de profissional junto com o horário é decisão grande demais para um botão
 * dentro de "Próximos agendamentos".
 */
export function RescheduleDialog({ open, onClose, slug, appointment }: RescheduleDialogProps) {
  const { api } = useClientAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [date, setDate] = useState<string | null>(null);
  const [startsAt, setStartsAt] = useState<string | null>(null);

  const serviceIds = appointment?.services.map((service) => service.id) ?? [];
  const barberId = appointment?.barber.id ?? null;

  useEffect(() => {
    if (open) {
      setDate(null);
      setStartsAt(null);
    }
  }, [open, appointment?.id]);

  const availabilityQuery = useQuery({
    queryKey: ['minha-conta', 'reschedule-availability', slug, appointment?.id, date],
    queryFn: () =>
      bookingApi.availability(api, slug, {
        serviceIds,
        barberId,
        date: date ?? undefined,
      }),
    enabled: open && Boolean(appointment),
  });

  const availability = availabilityQuery.data;

  useEffect(() => {
    if (availability && !date) setDate(availability.selectedDate);
  }, [availability, date]);

  const mutation = useMutation({
    mutationFn: () =>
      bookingApi.reschedule(api, slug, appointment!.bookingCode, {
        startsAt: startsAt!,
        barberId,
      }),
    onSuccess: () => {
      toast({ message: 'Agendamento remarcado', tone: 'success' });
      void queryClient.invalidateQueries({ queryKey: ['minha-conta', 'appointments', slug] });
      onClose();
    },
    onError: (error) => {
      toast({ message: authErrorMessage(error, 'Não foi possível remarcar.'), tone: 'danger' });
    },
  });

  if (!appointment) return null;

  const days: DayOption[] = (availability?.days ?? []).map((day) => {
    const { month, day: dayOfMonth } = parseDateKey(day.date);
    return {
      value: day.date,
      weekday: WEEKDAY_ABBR[day.weekday] ?? '',
      day: dayOfMonth,
      caption: day.closed ? 'Fechado' : MONTH_ABBR[month - 1],
      disabled: day.closed,
      soldOut: day.soldOut,
    };
  });

  const slots = availability?.slots ?? [];
  const selectedTime = slots.find((slot) => slot.startsAt === startsAt)?.time ?? null;
  const groups = ['MORNING', 'AFTERNOON', 'EVENING'].map((period) => ({
    label: { MORNING: 'MANHÃ', AFTERNOON: 'TARDE', EVENING: 'NOITE' }[period]!,
    times: slots.filter((slot) => slot.period === period).map((slot) => slot.time),
  })).filter((group) => group.times.length > 0);

  const isEmpty = !availabilityQuery.isFetching && slots.length === 0;

  return (
    <Modal open={open} onClose={onClose} title="Remarcar" dismissOnOverlayClick={!mutation.isPending}>
      <div className="flex flex-col gap-5">
        <DatePicker days={days} value={date} onChange={setDate} className="-mx-1 px-1" />

        {isEmpty ? (
          <EmptyState
            message="Sem horários neste dia"
            description={
              availability?.nextAvailableDate
                ? `Próximo livre: ${availability.nextAvailableDate}${availability.nextAvailableTime ? ` · ${availability.nextAvailableTime}` : ''}`
                : 'Tente outro dia na faixa acima.'
            }
          />
        ) : (
          <TimeSlotGrid
            groups={groups}
            value={selectedTime}
            onChange={(time) => {
              const slot = slots.find((candidate) => candidate.time === time);
              if (slot) setStartsAt(slot.startsAt);
            }}
            loading={availabilityQuery.isFetching}
          />
        )}

        <Button
          fullWidth
          size="lg"
          disabled={!startsAt}
          loading={mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          Confirmar novo horário
        </Button>
      </div>
    </Modal>
  );
}
