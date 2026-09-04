'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Avatar,
  Button,
  CalendarIcon,
  Input,
  Modal,
  Skeleton,
  Switch,
  Textarea,
  cn,
  maskPhoneInput,
  useEstablishmentAuth,
  useToast,
} from '@barbervp/ui';
import { SLOT_PERIOD_LABEL, SlotPeriod, formatBRL, formatDuration } from '@barbervp/types';
import type { ClientListItem, StaffAgendaResponse, StaffAppointmentItem } from '@barbervp/types';
import {
  useClientDetailQuery,
  useClientsQuery,
  useCreateClientMutation,
} from '@/lib/dashboard/api/clients';
import { useServicesQuery } from '@/lib/dashboard/api/catalog';
import {
  useCreateStaffAppointmentMutation,
  useMoveStaffAppointmentMutation,
  useStaffAgendaSlotsQuery,
} from '@/lib/dashboard/api/agenda';
import { agendaErrorMessage, formatTime } from './agenda-shared';

const PERIOD_ORDER: SlotPeriod[] = [SlotPeriod.MORNING, SlotPeriod.AFTERNOON, SlotPeriod.EVENING];

export interface AppointmentFormModalProps {
  open: boolean;
  onClose: () => void;
  date: string;
  barbers: StaffAgendaResponse['barberOptions'];
  timezone: string;
  /** Trava o barbeiro — clique numa coluna, ou papel BARBER. */
  fixedBarberId?: string;
  /** Pré-seleciona a hora — clique num slot vago da grade. */
  defaultTime?: string;
  /**
   * Id do `ClientProfile` que já chega escolhido — o "Agendar" da aba
   * Clientes (`?cliente=` na URL da Agenda). O passo 1 abre preenchido em vez
   * de pedir a busca de novo.
   */
  preselectedClientId?: string | null;
  /**
   * Preenchido = REMARCAÇÃO. O modal reusa a mesma grade de horários e chama
   * `PATCH /:id/move` em vez de `POST` — é a mesma pergunta ("quando?"), então
   * duplicar a tela só faria as duas divergirem.
   */
  rescheduling?: StaffAppointmentItem | null;
}

/**
 * Modal "Novo agendamento" (`Dashboard.dc.html` l.3549–3776).
 *
 * Estrutura 1:1 com o protótipo: quatro passos numerados à esquerda (cliente →
 * serviços → profissional → data/horário) e o painel de Resumo à direita, que
 * vira o rodapé no mobile.
 *
 * Os horários vêm de `GET /staff-agenda/slots`, o MESMO motor que valida o
 * `POST`: o chip clicável é exatamente o horário que o servidor aceita.
 */
export function AppointmentFormModal({
  open,
  onClose,
  date,
  barbers,
  timezone,
  fixedBarberId,
  defaultTime,
  preselectedClientId,
  rescheduling,
}: AppointmentFormModalProps) {
  const { activeMembership } = useEstablishmentAuth();
  const { toast } = useToast();
  const isBarberRole = activeMembership?.role === 'BARBER';
  const isReschedule = Boolean(rescheduling);

  const [barberId, setBarberId] = useState('');
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [apptDate, setApptDate] = useState(date);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [clientSearch, setClientSearch] = useState('');
  const [client, setClient] = useState<ClientListItem | null>(null);
  const [showNewClient, setShowNewClient] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [notifyWhatsapp, setNotifyWhatsapp] = useState(true);

  useEffect(() => {
    if (!open) return;
    setBarberId(rescheduling?.barberId ?? fixedBarberId ?? '');
    setServiceIds(rescheduling ? rescheduling.services.map((service) => service.id) : []);
    setApptDate(rescheduling ? rescheduling.startsAt.slice(0, 10) : date);
    setStartsAt(null);
    setClientSearch('');
    setClient(null);
    setShowNewClient(false);
    setNewClientName('');
    setNewClientPhone('');
    setNotes('');
    setNotifyWhatsapp(true);
  }, [open, date, fixedBarberId, rescheduling]);

  /**
   * Cliente vindo de fora (aba Clientes). Buscar pelo id — e não empurrar o
   * nome pela URL — mantém a regra: o que a tela mostra vem da API.
   */
  const preselectedQuery = useClientDetailQuery(open && preselectedClientId ? preselectedClientId : null);
  useEffect(() => {
    if (!open || !preselectedQuery.data) return;
    setClient(preselectedQuery.data);
    setShowNewClient(false);
  }, [open, preselectedQuery.data]);

  const servicesQuery = useServicesQuery({ active: true, perPage: 100 });
  // `BARBER` não tem acesso à base de clientes (`SPEC.md` → RBAC): para ele o
  // passo 1 é sempre o cadastro rápido, nunca a busca.
  const clientsQuery = useClientsQuery(
    { search: clientSearch, perPage: 6 },
    !isBarberRole && clientSearch.trim().length > 0,
  );
  const createClient = useCreateClientMutation();
  const create = useCreateStaffAppointmentMutation();
  const move = useMoveStaffAppointmentMutation();

  const slotsQuery = useStaffAgendaSlotsQuery({
    date: apptDate,
    barberId: barberId || null,
    serviceIds,
    ignoreAppointmentId: rescheduling?.id,
  });

  /**
   * Clique num horário vago da grade (`defaultTime`) já deixa o chip marcado.
   *
   * Só dá para fazer isso DEPOIS que os horários chegam: o slot é identificado
   * pelo instante em UTC, e converter `HH:MM` para UTC no cliente reintroduz o
   * fuso do navegador que o resto da tela evita. Se o horário tiver sido
   * tomado nesse meio-tempo, nada é marcado — e o chip aparece riscado.
   */
  useEffect(() => {
    if (!open || !defaultTime || startsAt) return;
    const match = slotsQuery.data?.slots.find(
      (slot) => slot.time === defaultTime && slot.available,
    );
    if (match) setStartsAt(match.startsAt);
  }, [open, defaultTime, startsAt, slotsQuery.data]);

  const services = useMemo(() => servicesQuery.data?.data ?? [], [servicesQuery.data]);
  const selectedServices = useMemo(
    () => services.filter((service) => serviceIds.includes(service.id)),
    [services, serviceIds],
  );
  const totalPriceCents = selectedServices.reduce((total, service) => total + service.priceCents, 0);
  const totalDurationMin = selectedServices.reduce((total, service) => total + service.durationMin, 0);
  const selectedBarber = barbers.find((barber) => barber.id === barberId);

  const toggleService = (id: string) => {
    setServiceIds((current) =>
      current.includes(id) ? current.filter((serviceId) => serviceId !== id) : [...current, id],
    );
    // Trocar de serviço muda a duração e, com ela, a grade inteira.
    setStartsAt(null);
  };

  // Na remarcação o cliente e os serviços já estão definidos: o único passo
  // que falta é o horário.
  const missing: string[] = [];
  if (!isReschedule && !client && !(isBarberRole || showNewClient)) missing.push('cliente');
  if (!isReschedule && (isBarberRole || showNewClient) && !newClientName.trim()) missing.push('cliente');
  if (serviceIds.length === 0) missing.push('serviço');
  if (!barberId) missing.push('profissional');
  if (!startsAt) missing.push('horário');
  const canSubmit = missing.length === 0;

  const submit = async () => {
    if (!canSubmit || !startsAt) return;

    try {
      if (rescheduling) {
        await move.mutateAsync({ id: rescheduling.id, dto: { startsAt, barberId } });
        toast({ message: 'Agendamento remarcado.', tone: 'success' });
      } else {
        const walkIn =
          !client && newClientName.trim()
            ? { name: newClientName.trim(), phone: newClientPhone.trim() }
            : undefined;

        await create.mutateAsync({
          barberId,
          serviceIds,
          startsAt,
          clientId: client?.clientId,
          walkIn,
          notes: notes.trim() || undefined,
          notifyWhatsapp,
        });
        toast({ message: 'Agendamento criado.', tone: 'success' });
      }
      onClose();
    } catch (error) {
      toast({ message: agendaErrorMessage(error), tone: 'danger' });
      // Um 409 significa que a grade mudou: derruba a escolha para forçar
      // um horário novo em vez de reenviar o que acabou de ser tomado.
      setStartsAt(null);
      void slotsQuery.refetch();
    }
  };

  const saveNewClient = async () => {
    if (!newClientName.trim() || !newClientPhone.trim()) return;
    try {
      const created = await createClient.mutateAsync({
        name: newClientName.trim(),
        phone: newClientPhone.trim(),
      });
      setClient(created);
      setShowNewClient(false);
      toast({ message: 'Cliente cadastrado.', tone: 'success' });
    } catch (error) {
      toast({ message: agendaErrorMessage(error), tone: 'danger' });
    }
  };

  const slotGroups = PERIOD_ORDER.map((period) => ({
    period,
    slots: (slotsQuery.data?.slots ?? []).filter((slot) => slot.period === period),
  })).filter((group) => group.slots.length > 0);

  return (
    <Modal
      open={open}
      onClose={onClose}
      className="md:max-w-[760px]"
      title={
        <span className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-gold/15">
            <CalendarIcon size={18} className="text-gold" />
          </span>
          <span className="flex flex-col">
            <span className="text-[17px] font-semibold text-fg">
              {isReschedule ? 'Remarcar agendamento' : 'Novo agendamento'}
            </span>
            <span className="text-[13px] font-normal text-fg-muted">
              {isReschedule
                ? `Escolha o novo horário de ${rescheduling!.clientName}`
                : 'Preencha os dados para criar o agendamento'}
            </span>
          </span>
        </span>
      }
      footer={
        <div className="flex flex-col gap-2">
          {!canSubmit && (
            <p className="text-xs text-fg-muted">Faltam: {missing.join(', ')}</p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            {selectedServices.length > 0 ? (
              <span className="text-[13px] font-medium text-fg-muted">
                Total: {formatBRL(totalPriceCents)} · {formatDuration(totalDurationMin)}
              </span>
            ) : (
              <span />
            )}
            <div className="flex gap-2.5">
              <Button variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button
                disabled={!canSubmit}
                loading={create.isPending || move.isPending}
                onClick={() => void submit()}
              >
                {isReschedule ? 'Confirmar remarcação' : 'Confirmar agendamento'}
              </Button>
            </div>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-5 md:flex-row md:gap-5">
        <div className="flex min-w-0 flex-col gap-5 md:flex-[1.6]">
          {/* ── 1 · Cliente ── */}
          {!isReschedule && (
            <Step number={1} label="Cliente" done={Boolean(client) || Boolean(newClientName.trim())}>
              {client ? (
                <div className="flex h-12 items-center justify-between rounded-[10px] border border-border bg-bg px-3">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Avatar name={client.name} size="sm" />
                    <span className="truncate text-sm font-medium text-fg">{client.name}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setClient(null)}
                    className="shrink-0 text-xs font-medium text-fg-muted hover:text-fg"
                  >
                    Trocar
                  </button>
                </div>
              ) : isBarberRole ? (
                <NewClientFields
                  name={newClientName}
                  phone={newClientPhone}
                  onName={setNewClientName}
                  onPhone={setNewClientPhone}
                  hint="Você lança o atendimento como avulso — a ficha completa do cliente é criada na aba Clientes."
                />
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="relative">
                    <Input
                      aria-label="Buscar cliente"
                      placeholder="Buscar cliente…"
                      value={clientSearch}
                      onChange={(event) => setClientSearch(event.target.value)}
                    />
                    {clientSearch.trim().length > 0 && (
                      <ul className="mt-1 flex max-h-44 flex-col overflow-y-auto rounded-[10px] border border-border bg-surface-3 p-1.5 shadow-menu">
                        {(clientsQuery.data?.data ?? []).map((row) => (
                          <li key={row.clientId}>
                            <button
                              type="button"
                              onClick={() => {
                                setClient(row);
                                setClientSearch('');
                                setShowNewClient(false);
                              }}
                              className="flex w-full items-center gap-2.5 rounded-[7px] px-3 py-2 text-left hover:bg-surface-2"
                            >
                              <Avatar name={row.name} size="xs" />
                              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg">
                                {row.name}
                              </span>
                              {row.noShowCount >= 2 && (
                                <span title={`${row.noShowCount} faltas`} className="text-warning">
                                  ⚠
                                </span>
                              )}
                            </button>
                          </li>
                        ))}
                        {clientsQuery.data?.data.length === 0 && (
                          <li className="px-3 py-2 text-[13px] text-fg-muted">Ninguém encontrado.</li>
                        )}
                      </ul>
                    )}
                  </div>

                  {showNewClient ? (
                    <div className="flex flex-col gap-2 rounded-[10px] border border-border bg-bg p-3">
                      <NewClientFields
                        name={newClientName}
                        phone={newClientPhone}
                        onName={setNewClientName}
                        onPhone={setNewClientPhone}
                      />
                      <Button
                        size="sm"
                        className="self-start"
                        loading={createClient.isPending}
                        disabled={!newClientName.trim() || !newClientPhone.trim()}
                        onClick={() => void saveNewClient()}
                      >
                        Salvar cliente
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowNewClient(true)}
                      className="inline-flex min-h-11 items-center gap-1.5 self-start rounded-[10px] border border-dashed border-border px-3.5 text-[13px] font-medium text-gold hover:border-gold"
                    >
                      ＋ Cadastrar novo cliente
                    </button>
                  )}
                </div>
              )}
            </Step>
          )}

          {/* ── 2 · Serviços ── */}
          <Step number={isReschedule ? 1 : 2} label="Serviços" done={serviceIds.length > 0}>
            {servicesQuery.isLoading ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </div>
            ) : services.length === 0 ? (
              <p className="rounded-[10px] border border-border bg-bg p-3 text-[13px] text-fg-muted">
                Nenhum serviço ativo. Cadastre um em Serviços &amp; Produtos.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {services.map((service) => {
                  const selected = serviceIds.includes(service.id);
                  return (
                    <button
                      key={service.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleService(service.id)}
                      className={cn(
                        'relative rounded-[10px] border px-3 py-2.5 text-left transition-colors',
                        selected ? 'border-gold bg-gold/15' : 'border-border hover:border-border-strong',
                      )}
                    >
                      <span
                        className={cn(
                          'block truncate text-[13px] font-medium',
                          selected ? 'text-gold' : 'text-fg',
                        )}
                      >
                        {service.name}
                      </span>
                      <span className="mt-0.5 block text-xs text-fg-muted">
                        {service.durationMin}min · {formatBRL(service.priceCents)}
                      </span>
                      {selected && (
                        <span className="absolute right-2 top-2 text-xs font-semibold text-gold">✓</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </Step>

          {/* ── 3 · Profissional ── */}
          {!fixedBarberId && (
            <Step number={isReschedule ? 2 : 3} label="Profissional" done={Boolean(barberId)}>
              <div className="flex flex-wrap gap-2.5">
                {barbers.map((barber) => (
                  <button
                    key={barber.id}
                    type="button"
                    aria-pressed={barberId === barber.id}
                    onClick={() => {
                      setBarberId(barber.id);
                      setStartsAt(null);
                    }}
                    className={cn(
                      'flex items-center gap-2 rounded-[10px] border px-3 py-2 transition-colors',
                      barberId === barber.id ? 'border-gold' : 'border-border hover:border-border-strong',
                    )}
                  >
                    <Avatar name={barber.name} src={barber.avatarUrl} size="sm" />
                    <span className="whitespace-nowrap text-[13px] font-medium text-fg">
                      {barber.name}
                    </span>
                  </button>
                ))}
              </div>
            </Step>
          )}

          {/* ── 4 · Data e horário ── */}
          <Step
            number={isReschedule ? 3 : fixedBarberId ? 3 : 4}
            label="Data e horário"
            done={Boolean(startsAt)}
          >
            <Input
              aria-label="Data do agendamento"
              type="date"
              value={apptDate}
              onChange={(event) => {
                if (!event.target.value) return;
                setApptDate(event.target.value);
                setStartsAt(null);
              }}
              className="mb-3"
            />

            {!barberId || serviceIds.length === 0 ? (
              <p className="text-[13px] text-fg-muted">
                Escolha o serviço e o profissional para ver os horários.
              </p>
            ) : slotsQuery.isLoading ? (
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: 8 }, (_, index) => (
                  <Skeleton key={index} className="h-8 w-16" />
                ))}
              </div>
            ) : slotsQuery.isError ? (
              <div className="flex items-center gap-2">
                <p className="text-[13px] text-fg-muted">Não foi possível carregar os horários.</p>
                <Button variant="ghost" size="sm" onClick={() => void slotsQuery.refetch()}>
                  Tentar de novo
                </Button>
              </div>
            ) : slotGroups.length === 0 ? (
              <p className="text-[13px] text-fg-muted">
                Este profissional não atende nesta data.
              </p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {slotGroups.map((group) => (
                  <div key={group.period}>
                    <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.04em] text-fg-subtle">
                      {SLOT_PERIOD_LABEL[group.period]}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {group.slots.map((slot) => {
                        const selected = startsAt === slot.startsAt;
                        return (
                          <button
                            key={slot.startsAt}
                            type="button"
                            disabled={!slot.available}
                            aria-pressed={selected}
                            onClick={() => setStartsAt(slot.startsAt)}
                            className={cn(
                              'min-h-11 rounded-lg border px-2.5 text-xs font-medium tabular-nums transition-colors md:min-h-0 md:py-1.5',
                              !slot.available && 'cursor-not-allowed border-border text-fg-subtle line-through',
                              slot.available && !selected && 'border-border text-fg hover:border-gold',
                              selected && 'border-gold bg-gold/15 text-gold',
                            )}
                          >
                            {slot.time}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Step>

          {!isReschedule && (
            <>
              <Textarea
                label="Observações"
                rows={2}
                placeholder="Observações sobre o atendimento…"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />

              <Switch
                label={
                  <span className="flex items-center gap-2.5">
                    <span
                      aria-hidden
                      className="flex size-6 shrink-0 items-center justify-center rounded-full bg-success/15 text-[13px] text-success"
                    >
                      ✆
                    </span>
                    <span className="text-[13px] font-medium text-fg">
                      Enviar confirmação por WhatsApp
                    </span>
                  </span>
                }
                checked={notifyWhatsapp}
                onChange={(event) => setNotifyWhatsapp(event.target.checked)}
              />
            </>
          )}
        </div>

        {/* ── Resumo (l.3713–3760) ── */}
        <aside className="min-w-0 md:flex-1">
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-bg p-4 md:sticky md:top-0">
            <p className="text-[13px] font-semibold text-fg">Resumo</p>

            {isReschedule ? (
              <SummaryLine
                name={rescheduling!.clientName}
                note={`Atual: ${formatTime(rescheduling!.startsAt, timezone)}`}
              />
            ) : client ? (
              <SummaryLine name={client.name} />
            ) : newClientName.trim() ? (
              <SummaryLine name={newClientName.trim()} note="Novo cliente" />
            ) : (
              <p className="text-[13px] text-fg-subtle">Selecione o cliente</p>
            )}

            {selectedServices.length > 0 && (
              <div className="flex flex-col gap-2 border-t border-border pt-3">
                {selectedServices.map((service) => (
                  <div key={service.id} className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium text-fg">
                        {service.name}
                      </span>
                      <span className="block text-[11px] text-fg-muted">{service.durationMin}min</span>
                    </span>
                    <span className="shrink-0 text-[13px] font-medium text-fg">
                      {formatBRL(service.priceCents)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {selectedBarber && (
              <div className="flex items-center gap-2 border-t border-border pt-3">
                <Avatar name={selectedBarber.name} src={selectedBarber.avatarUrl} size="xs" />
                <span className="truncate text-[13px] font-medium text-fg">{selectedBarber.name}</span>
              </div>
            )}

            {startsAt && (
              <p className="border-t border-border pt-3 text-[13px] text-fg">
                {new Intl.DateTimeFormat('pt-BR', { timeZone: timezone }).format(new Date(startsAt))} ·{' '}
                {formatTime(startsAt, timezone)}
              </p>
            )}

            {selectedServices.length > 0 && (
              <div className="flex items-baseline justify-between border-t border-border pt-2.5">
                <span className="text-[13px] font-semibold text-fg">Total</span>
                <span className="text-right">
                  <span className="block font-display text-base font-bold text-gold">
                    {formatBRL(totalPriceCents)}
                  </span>
                  <span className="block text-[11px] text-fg-muted">
                    {formatDuration(totalDurationMin)}
                  </span>
                </span>
              </div>
            )}
          </div>
        </aside>
      </div>
    </Modal>
  );
}

function Step({
  number,
  label,
  done,
  children,
}: {
  number: number;
  label: string;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2.5 flex items-center gap-2">
        <span
          className={cn(
            'flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
            done ? 'bg-gold text-bg' : 'bg-border text-fg-muted',
          )}
        >
          {number}
        </span>
        <span className="text-[13px] font-semibold text-fg">{label}</span>
      </div>
      {children}
    </section>
  );
}

function NewClientFields({
  name,
  phone,
  onName,
  onPhone,
  hint,
}: {
  name: string;
  phone: string;
  onName: (value: string) => void;
  onPhone: (value: string) => void;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      {hint && <p className="text-xs text-fg-muted">{hint}</p>}
      <Input
        aria-label="Nome do cliente"
        placeholder="Nome"
        value={name}
        onChange={(event) => onName(event.target.value)}
      />
      <Input
        aria-label="WhatsApp do cliente"
        placeholder="WhatsApp"
        inputMode="tel"
        value={phone}
        onChange={(event) => onPhone(maskPhoneInput(event.target.value))}
      />
    </div>
  );
}

function SummaryLine({ name, note }: { name: string; note?: string }) {
  return (
    <div className="flex items-center gap-2">
      <Avatar name={name} size="xs" />
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium text-fg">{name}</span>
        {note && <span className="block text-[11px] text-fg-muted">{note}</span>}
      </span>
    </div>
  );
}
