'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Avatar,
  Button,
  Card,
  Checkbox,
  Field,
  Input,
  Modal,
  Select,
  useEstablishmentAuth,
  useFieldIds,
  useToast,
} from '@barbervp/ui';
import { formatBRL, formatDuration, formatPhone } from '@barbervp/types';
import type { ClientListItem } from '@barbervp/types';
import { useClientsQuery } from '@/lib/dashboard/api/clients';
import { useServicesQuery } from '@/lib/dashboard/api/catalog';
import { useCreateStaffAppointmentMutation } from '@/lib/dashboard/api/agenda';

export interface AppointmentFormModalProps {
  open: boolean;
  onClose: () => void;
  date: string;
  /** Opções do seletor de barbeiro — o que `GET /staff-agenda` já devolve em `barberOptions`. */
  barbers: Array<{ id: string; name: string }>;
  /** Pré-seleciona (e trava) o barbeiro — abrir "Novo" na coluna dele, ou papel BARBER. */
  fixedBarberId?: string;
  defaultTime?: string;
}

type ClientMode = 'cadastrado' | 'walkin';

/**
 * Modal de novo agendamento pelo staff — inclui walk-in.
 *
 * Simplificação assumida nesta fase: o horário digitado é interpretado no
 * fuso do NAVEGADOR (`Date` local), não no fuso do tenant vindo da API. Numa
 * barbearia operada do próprio endereço isso coincide sempre; ver decisão em
 * `agentes/CONTEXT.md`.
 */
export function AppointmentFormModal({
  open,
  onClose,
  date,
  barbers,
  fixedBarberId,
  defaultTime,
}: AppointmentFormModalProps) {
  const { activeMembership } = useEstablishmentAuth();
  const { toast } = useToast();
  const servicesFieldIds = useFieldIds();
  const isBarberRole = activeMembership?.role === 'BARBER';

  const [barberId, setBarberId] = useState(fixedBarberId ?? barbers[0]?.id ?? '');
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [time, setTime] = useState(defaultTime ?? '09:00');
  const [mode, setMode] = useState<ClientMode>('cadastrado');
  const [clientSearch, setClientSearch] = useState('');
  const [clientId, setClientId] = useState<string | null>(null);
  const [walkInName, setWalkInName] = useState('');
  const [walkInPhone, setWalkInPhone] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    setBarberId(fixedBarberId ?? barbers[0]?.id ?? '');
    setServiceIds([]);
    setTime(defaultTime ?? '09:00');
    setMode('cadastrado');
    setClientSearch('');
    setClientId(null);
    setWalkInName('');
    setWalkInPhone('');
    setNotes('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fixedBarberId, defaultTime]);

  const servicesQuery = useServicesQuery({ active: true, perPage: 100 });
  const clientsQuery = useClientsQuery({ search: clientSearch, perPage: 8 });
  const create = useCreateStaffAppointmentMutation();

  const services = servicesQuery.data?.data ?? [];
  const selectedServices = services.filter((service) => serviceIds.includes(service.id));
  const totalPriceCents = selectedServices.reduce((total, service) => total + service.priceCents, 0);
  const totalDurationMin = selectedServices.reduce((total, service) => total + service.durationMin, 0);

  const chosenClient = useMemo<ClientListItem | undefined>(
    () => clientsQuery.data?.data.find((row) => row.clientId === clientId),
    [clientsQuery.data, clientId],
  );

  const toggleService = (id: string) => {
    setServiceIds((current) =>
      current.includes(id) ? current.filter((serviceId) => serviceId !== id) : [...current, id],
    );
  };

  const canSubmit =
    barberId &&
    serviceIds.length > 0 &&
    time &&
    (mode === 'cadastrado' ? clientId : walkInName.trim() && walkInPhone.trim());

  const submit = async () => {
    if (!canSubmit) return;
    try {
      const startsAt = new Date(`${date}T${time}:00`).toISOString();
      await create.mutateAsync({
        barberId,
        serviceIds,
        startsAt,
        clientId: mode === 'cadastrado' ? clientId : undefined,
        walkIn: mode === 'walkin' ? { name: walkInName.trim(), phone: walkInPhone.trim() } : undefined,
        notes: notes.trim() || undefined,
      });
      toast({ message: 'Agendamento criado.', tone: 'success' });
      onClose();
    } catch (error) {
      toast({
        message: error instanceof Error ? error.message : 'Não foi possível agendar.',
        tone: 'danger',
      });
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Novo agendamento" footer={
      <Button fullWidth loading={create.isPending} disabled={!canSubmit} onClick={() => void submit()}>
        Confirmar agendamento
      </Button>
    }>
      <div className="flex flex-col gap-4">
        {!isBarberRole && (
          <Select
            label="Barbeiro"
            value={barberId}
            disabled={Boolean(fixedBarberId)}
            onChange={(event) => setBarberId(event.target.value)}
            options={barbers.map((barber) => ({ value: barber.id, label: barber.name }))}
          />
        )}

        <Input label="Horário" type="time" value={time} onChange={(event) => setTime(event.target.value)} />

        <Field
          label="Serviços"
          ids={servicesFieldIds}
          hint={selectedServices.length > 0 ? `${formatDuration(totalDurationMin)} · ${formatBRL(totalPriceCents)}` : undefined}
        >
          <div className="flex flex-col gap-1.5 rounded-xl border border-border p-2">
            {services.map((service) => (
              <label key={service.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-surface-2">
                <Checkbox checked={serviceIds.includes(service.id)} onChange={() => toggleService(service.id)} />
                <span className="flex-1 text-sm text-fg">{service.name}</span>
                <span className="text-xs text-fg-muted">{formatBRL(service.priceCents)}</span>
              </label>
            ))}
            {services.length === 0 && <p className="px-2 py-2 text-[13px] text-fg-muted">Nenhum serviço ativo.</p>}
          </div>
        </Field>

        <div className="flex gap-2 rounded-xl border border-border bg-surface-2 p-1">
          <button
            type="button"
            onClick={() => setMode('cadastrado')}
            className={`h-9 flex-1 rounded-lg text-[13px] font-semibold transition-colors ${mode === 'cadastrado' ? 'bg-gold text-bg' : 'text-fg-muted'}`}
          >
            Cliente cadastrado
          </button>
          <button
            type="button"
            onClick={() => setMode('walkin')}
            className={`h-9 flex-1 rounded-lg text-[13px] font-semibold transition-colors ${mode === 'walkin' ? 'bg-gold text-bg' : 'text-fg-muted'}`}
          >
            Walk-in (avulso)
          </button>
        </div>

        {mode === 'cadastrado' ? (
          <div className="flex flex-col gap-2">
            <Input
              label="Buscar cliente"
              placeholder="Nome ou telefone"
              value={clientSearch}
              onChange={(event) => {
                setClientSearch(event.target.value);
                setClientId(null);
              }}
            />
            {chosenClient ? (
              <Card tone="raised" className="flex-row items-center gap-3">
                <Avatar name={chosenClient.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-fg">{chosenClient.name}</p>
                  <p className="text-xs text-fg-muted">{formatPhone(chosenClient.phone)}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setClientId(null)}>
                  Trocar
                </Button>
              </Card>
            ) : (
              clientSearch.trim().length > 0 && (
                <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-xl border border-border p-1.5">
                  {(clientsQuery.data?.data ?? []).map((row) => (
                    <li key={row.clientId}>
                      <button
                        type="button"
                        onClick={() => {
                          setClientId(row.clientId);
                          setClientSearch(row.name);
                        }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-surface-2"
                      >
                        <Avatar name={row.name} size="sm" />
                        <span className="min-w-0 flex-1 truncate text-sm text-fg">{row.name}</span>
                        <span className="shrink-0 text-xs text-fg-muted">{formatPhone(row.phone)}</span>
                      </button>
                    </li>
                  ))}
                  {clientsQuery.data?.data.length === 0 && (
                    <p className="px-2.5 py-2 text-[13px] text-fg-muted">Ninguém encontrado.</p>
                  )}
                </ul>
              )
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <Input label="Nome do cliente" value={walkInName} onChange={(event) => setWalkInName(event.target.value)} />
            <Input
              label="WhatsApp"
              placeholder="(11) 9 9999-9999"
              value={walkInPhone}
              onChange={(event) => setWalkInPhone(event.target.value)}
            />
          </div>
        )}

        <Input label="Observações (opcional)" value={notes} onChange={(event) => setNotes(event.target.value)} />
      </div>
    </Modal>
  );
}
