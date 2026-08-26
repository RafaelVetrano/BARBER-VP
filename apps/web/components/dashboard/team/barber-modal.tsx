'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Avatar,
  Button,
  Checkbox,
  Field,
  Input,
  Modal,
  Switch,
  maskPhoneInput,
  useFieldIds,
  useToast,
} from '@barbervp/ui';
import { WEEKDAY_LABELS, formatPhone, minutesToTime, timeToMinutes } from '@barbervp/types';
import type {
  BarberListItem,
  OnboardingBusinessHour,
  ServiceListItem,
  WorkScheduleDay,
} from '@barbervp/types';
import { useCreateStaffInviteMutation, useUpdateBarberMutation } from '@/lib/dashboard/api/team';
import { useBarbershopSettingsQuery } from '@/lib/dashboard/api/settings';

/**
 * A semana de partida de um barbeiro novo é o HORÁRIO DE FUNCIONAMENTO da
 * barbearia — o mesmo que `POST /barbers` copia no servidor.
 *
 * Chutar "seg–sáb 09–20" aqui seria pôr na tela um horário que ninguém
 * escolheu; quem já configurou a casa abriria o modal com o horário errado
 * pré-marcado e salvaria sem perceber.
 */
function weekFromBusinessHours(hours: OnboardingBusinessHour[]): WorkScheduleDay[] {
  const byWeekday = new Map(hours.map((hour) => [hour.weekday, hour]));
  return Array.from({ length: 7 }, (_, weekday) => {
    const hour = byWeekday.get(weekday);
    const isDayOff = !hour || hour.closed;
    return {
      weekday,
      startTime: hour?.opensAt ?? 0,
      endTime: hour?.closesAt ?? 0,
      lunchStart: null,
      lunchEnd: null,
      isDayOff,
    };
  });
}

/**
 * Modal da aba Equipe (`Dashboard.dc.html` l.2159–2237) — UM modal para os
 * dois modos, como no desenho: o título, o e-mail travado e o rótulo do botão
 * é que mudam.
 *
 * - **Novo**: emite convite (`POST /team/invites`). O barbeiro nasce quando
 *   ele mesmo cria a senha em `CadastroFuncionario` — é isso que o texto de
 *   apoio do campo de e-mail promete.
 * - **Edição**: `PATCH /barbers/:id`, com serviços e a semana inteira na MESMA
 *   requisição. Duas chamadas deixariam metade do modal salva se a segunda
 *   falhasse.
 */
export function BarberModal({
  open,
  onClose,
  barber,
  services,
}: {
  open: boolean;
  onClose: () => void;
  /** `null` = "+ Novo barbeiro" (convite). */
  barber: BarberListItem | null;
  services: ServiceListItem[];
}) {
  const { toast } = useToast();
  const update = useUpdateBarberMutation();
  const invite = useCreateStaffInviteMutation();
  const barbershopQuery = useBarbershopSettingsQuery();
  const servicesFieldIds = useFieldIds();
  const scheduleFieldIds = useFieldIds();

  const isEdit = barber !== null;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [week, setWeek] = useState<WorkScheduleDay[]>([]);

  const businessHours = barbershopQuery.data?.businessHours;

  useEffect(() => {
    // Espera o horário da casa antes de montar a semana de um barbeiro novo —
    // abrir com sete folgas e trocar embaixo do dedo seria pior que esperar.
    if (!open || (!barber && !businessHours)) return;
    setName(barber?.name ?? '');
    setEmail(barber?.email ?? '');
    // O banco guarda E.164 (`5511…`); o campo mostra a máscara do protótipo.
    setPhone(barber?.phone ? maskPhoneInput(formatPhone(barber.phone)) : '');
    setAvatarUrl(barber?.avatarUrl ?? '');
    setServiceIds(barber?.serviceIds ?? []);
    setWeek(barber?.workSchedule ?? weekFromBusinessHours(businessHours ?? []));
  }, [open, barber, businessHours]);

  const allSelected = services.length > 0 && serviceIds.length === services.length;

  const toggleService = (id: string) =>
    setServiceIds((current) =>
      current.includes(id) ? current.filter((serviceId) => serviceId !== id) : [...current, id],
    );

  const toggleAllServices = () =>
    setServiceIds(allSelected ? [] : services.map((service) => service.id));

  const patchDay = (weekday: number, patch: Partial<WorkScheduleDay>) =>
    setWeek((current) => current.map((day) => (day.weekday === weekday ? { ...day, ...patch } : day)));

  const brokenDay = week.find(
    (day) =>
      !day.isDayOff &&
      (day.endTime <= day.startTime ||
        (day.lunchStart !== null &&
          day.lunchEnd !== null &&
          (day.lunchEnd <= day.lunchStart ||
            day.lunchStart < day.startTime ||
            day.lunchEnd > day.endTime))),
  );

  const busy = update.isPending || invite.isPending;
  const canSubmit =
    name.trim().length >= 2 &&
    (isEdit || email.trim().length > 0) &&
    week.length === 7 &&
    !brokenDay &&
    !busy;

  const submit = async () => {
    if (!canSubmit) return;
    try {
      if (barber) {
        await update.mutateAsync({
          id: barber.id,
          dto: {
            name: name.trim(),
            email: email.trim() || null,
            phone: phone.trim() || null,
            avatarUrl: avatarUrl.trim() || null,
            serviceIds,
            schedule: week,
          },
        });
        toast({ message: `${name.trim()} atualizado.`, tone: 'success' });
      } else {
        await invite.mutateAsync({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          serviceIds,
          schedule: week,
        });
        toast({ message: `Convite enviado para ${email.trim()}.`, tone: 'success' });
      }
      onClose();
    } catch (error) {
      toast({
        message: error instanceof Error ? error.message : 'Não foi possível salvar.',
        tone: 'danger',
      });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? `Editar ${barber.name}` : 'Novo barbeiro'}
      footer={
        <div className="flex justify-end gap-2.5">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button loading={busy} disabled={!canSubmit} onClick={() => void submit()}>
            {isEdit ? 'Salvar' : 'Enviar convite'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col items-center gap-2">
          <Avatar name={name || 'Novo barbeiro'} src={avatarUrl || null} size="lg" className="size-[84px] text-2xl" />
          <Input
            label="URL da foto"
            type="url"
            className="w-full"
            value={avatarUrl}
            onChange={(event) => setAvatarUrl(event.target.value)}
            placeholder="https://…/foto.jpg"
            hint="O upload direto chega na fase de integrações."
          />
        </div>

        <Input
          label="Nome"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />

        <Input
          label="Email"
          type="email"
          required={!isEdit}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          // Trocar o e-mail de quem já criou a conta trocaria o login dele por
          // baixo — a alteração é do próprio barbeiro, em Meu Perfil.
          readOnly={isEdit && barber.hasLogin}
          hint={
            isEdit
              ? barber.hasLogin
                ? 'É o login do barbeiro. Só ele pode trocar, em Meu Perfil.'
                : undefined
              : 'O funcionário receberá um convite por email para criar a conta de acesso ao painel dele.'
          }
        />

        <Input
          label="WhatsApp"
          inputMode="tel"
          value={phone}
          onChange={(event) => setPhone(maskPhoneInput(event.target.value))}
          placeholder="(11) 9 9999-9999"
        />

        <Field label="Serviços que executa" ids={servicesFieldIds}>
          <div className="flex flex-col gap-0.5 rounded-xl border border-border p-2">
            <label
              className={`flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2 ${
                allSelected ? 'bg-gold/10' : ''
              }`}
            >
              <Checkbox
                checked={allSelected}
                onChange={toggleAllServices}
                aria-label="Marcar todos os serviços"
              />
              <span className="text-[13px] font-bold text-gold">TODAS</span>
            </label>
            {services.map((service) => (
              <label
                key={service.id}
                className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2 hover:bg-surface-2"
              >
                <Checkbox
                  checked={serviceIds.includes(service.id)}
                  onChange={() => toggleService(service.id)}
                />
                <span className="text-[13px] text-fg">{service.name}</span>
              </label>
            ))}
            {services.length === 0 && (
              <p className="px-2 py-3 text-[13px] text-fg-muted">
                Nenhum serviço no catálogo ainda. Cadastre em Serviços &amp; Produtos para poder
                marcar aqui.
              </p>
            )}
          </div>
        </Field>

        <Field
          label="Horários por dia da semana"
          ids={scheduleFieldIds}
          error={brokenDay ? `Confira os horários de ${WEEKDAY_LABELS[brokenDay.weekday]}.` : undefined}
        >
          <div className="flex flex-col gap-2">
            {week.map((day) => (
              <DayRow key={day.weekday} day={day} onPatch={(patch) => patchDay(day.weekday, patch)} />
            ))}
          </div>
        </Field>

        {/* A regra de comissão é da aba Comissões — daqui sai um link, não um
            segundo lugar de edição (protótipo l.2236). */}
        <Link
          href="/app/comissoes?tab=regras"
          className="text-[13px] font-medium text-gold hover:underline"
        >
          Regras de comissão →
        </Link>
      </div>
    </Modal>
  );
}

function DayRow({
  day,
  onPatch,
}: {
  day: WorkScheduleDay;
  onPatch: (patch: Partial<WorkScheduleDay>) => void;
}) {
  const label = WEEKDAY_LABELS[day.weekday]!;
  const timeInput = 'h-9 rounded-lg border border-border bg-surface px-2 text-xs text-fg';

  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-border bg-surface-2 p-2">
      <span className="w-11 shrink-0 text-xs font-semibold text-fg">{label.slice(0, 3)}</span>

      <Switch
        label={<span className="sr-only">{`${label}: trabalha`}</span>}
        checked={!day.isDayOff}
        onChange={(event) => onPatch({ isDayOff: !event.target.checked })}
      />

      {day.isDayOff ? (
        <span className="text-xs font-medium text-fg-muted">Folga</span>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            aria-label={`Início ${label}`}
            type="time"
            className={timeInput}
            value={minutesToTime(day.startTime)}
            onChange={(event) => {
              const minutes = timeToMinutes(event.target.value);
              if (minutes !== null) onPatch({ startTime: minutes });
            }}
          />
          <span className="text-xs text-fg-subtle">–</span>
          <input
            aria-label={`Fim ${label}`}
            type="time"
            className={timeInput}
            value={minutesToTime(day.endTime)}
            onChange={(event) => {
              const minutes = timeToMinutes(event.target.value);
              if (minutes !== null) onPatch({ endTime: minutes });
            }}
          />
          <span className="ml-1.5 text-[11px] text-fg-muted">Almoço</span>
          <input
            aria-label={`Início do almoço ${label}`}
            type="time"
            className={timeInput}
            value={day.lunchStart !== null ? minutesToTime(day.lunchStart) : ''}
            onChange={(event) => onPatch({ lunchStart: timeToMinutes(event.target.value) })}
          />
          <span className="text-xs text-fg-subtle">–</span>
          <input
            aria-label={`Fim do almoço ${label}`}
            type="time"
            className={timeInput}
            value={day.lunchEnd !== null ? minutesToTime(day.lunchEnd) : ''}
            onChange={(event) => onPatch({ lunchEnd: timeToMinutes(event.target.value) })}
          />
        </div>
      )}
    </div>
  );
}
