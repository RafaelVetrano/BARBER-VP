'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ClientAppointmentItem } from '@barbervp/types';
import { Button, EmptyState, Skeleton, SkeletonGroup, Tabs, useClientAuth, useToast, authErrorMessage } from '@barbervp/ui';
import { bookingApi } from '../../lib/booking-api';
import { clientAccountApi } from '../../lib/client-account-api';
import { UpcomingAppointmentCard, HistoryAppointmentCard } from './appointment-card';
import { ConfirmDialog } from './confirm-dialog';
import { RescheduleDialog } from './reschedule-dialog';

type SubTab = 'proximos' | 'historico';

export function TabAgendamentos({
  slug,
  onNovoAgendamento,
}: {
  slug: string;
  onNovoAgendamento: (serviceId: string | null) => void;
}) {
  const { api } = useClientAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [subTab, setSubTab] = useState<SubTab>('proximos');
  const [cancelTarget, setCancelTarget] = useState<ClientAppointmentItem | null>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<ClientAppointmentItem | null>(null);
  const [ratingId, setRatingId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['minha-conta', 'appointments', slug],
    queryFn: () => clientAccountApi.appointments(api, slug),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['minha-conta', 'appointments', slug] });

  const cancelMutation = useMutation({
    mutationFn: (item: ClientAppointmentItem) => bookingApi.cancel(api, slug, item.bookingCode, {}),
    onSuccess: () => {
      toast({ message: 'Agendamento cancelado', tone: 'success' });
      setCancelTarget(null);
      void invalidate();
    },
    onError: (error) => {
      toast({ message: authErrorMessage(error, 'Não foi possível cancelar.'), tone: 'danger' });
    },
  });

  const rateMutation = useMutation({
    mutationFn: ({ item, rating }: { item: ClientAppointmentItem; rating: number }) => {
      setRatingId(item.id);
      return clientAccountApi.rate(api, slug, item.id, { rating });
    },
    onSuccess: () => {
      toast({ message: 'Obrigado pela avaliação!', tone: 'success' });
      void invalidate();
    },
    onError: (error) => {
      toast({ message: authErrorMessage(error, 'Não foi possível avaliar.'), tone: 'danger' });
    },
    onSettled: () => setRatingId(null),
  });

  const upcoming = query.data?.upcoming ?? [];
  const history = query.data?.history ?? [];

  return (
    <div className="flex flex-col gap-4">
      <Tabs
        variant="segmented"
        label="Agendamentos"
        idPrefix="minha-conta-sub"
        items={[
          { value: 'proximos', label: 'Próximos' },
          { value: 'historico', label: 'Histórico' },
        ]}
        value={subTab}
        onChange={(value) => setSubTab(value as SubTab)}
      />

      {query.isPending && (
        <SkeletonGroup label="Carregando agendamentos">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
        </SkeletonGroup>
      )}

      {!query.isPending && subTab === 'proximos' && (
        upcoming.length === 0 ? (
          <EmptyState
            message="Você ainda não tem horários marcados"
            action={<Button onClick={() => onNovoAgendamento(null)}>Agendar horário</Button>}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {upcoming.map((item) => (
              <UpcomingAppointmentCard
                key={item.id}
                item={item}
                onReschedule={() => setRescheduleTarget(item)}
                onCancel={() => setCancelTarget(item)}
              />
            ))}
          </div>
        )
      )}

      {!query.isPending && subTab === 'historico' && (
        history.length === 0 ? (
          <EmptyState message="Nenhum atendimento no histórico ainda" />
        ) : (
          <div className="flex flex-col gap-2.5">
            {history.map((item) => (
              <HistoryAppointmentCard
                key={item.id}
                item={item}
                onBookAgain={(serviceId) => onNovoAgendamento(serviceId || null)}
                onRate={(rating) => rateMutation.mutate({ item, rating })}
                rating={ratingId === item.id ? 'saving' : 'idle'}
              />
            ))}
          </div>
        )
      )}

      <ConfirmDialog
        open={cancelTarget !== null}
        onClose={() => setCancelTarget(null)}
        title="Cancelar agendamento?"
        description={
          cancelTarget
            ? `Cancelamentos com menos de ${cancelTarget.cancelWindowHours}h de antecedência podem estar sujeitos à política da barbearia.`
            : ''
        }
        confirmLabel="Sim, cancelar"
        cancelLabel="Manter agendamento"
        tone="danger"
        busy={cancelMutation.isPending}
        onConfirm={() => cancelTarget && cancelMutation.mutate(cancelTarget)}
      />

      <RescheduleDialog
        open={rescheduleTarget !== null}
        onClose={() => setRescheduleTarget(null)}
        slug={slug}
        appointment={rescheduleTarget}
      />
    </div>
  );
}
