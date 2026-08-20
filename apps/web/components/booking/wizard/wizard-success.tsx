'use client';

import { useState } from 'react';
import { formatDuration, type AppointmentSummary, type PublicBarbershop } from '@barbervp/types';
import { Button, SuccessScreen, useToast } from '@barbervp/ui';
import { formatDateKeyLong, formatPrice } from '@/lib/booking/format';

interface WizardSuccessProps {
  shop: PublicBarbershop;
  appointment: AppointmentSummary;
  onRestart: () => void;
  onClose: () => void;
}

/**
 * Tela de sucesso do agendamento.
 *
 * Usa o `SuccessScreen` de `packages/ui` (o mesmo do cadastro e da assinatura,
 * consolidado na fase 02). As instruções do rodapé leem a política REAL do
 * tenant: o protótipo escrevia "3h" aqui e "2h" na `MinhaConta`, e essa
 * divergência é justamente o que `TenantSettings.cancelamentoHoras` resolve.
 */
export function WizardSuccess({ shop, appointment, onRestart, onClose }: WizardSuccessProps) {
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(false);

  const local = formatInTimeZone(appointment.startsAt, appointment.timezone);
  const servicesLabel = appointment.services.map((service) => service.name).join(' + ');
  const totalDuration = appointment.services.reduce(
    (total, service) => total + service.durationMin,
    0,
  );

  const addToCalendar = () => {
    setDownloading(true);
    try {
      const ics = buildIcs(shop, appointment, servicesLabel);
      const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${appointment.bookingCode}.ics`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast({ message: 'Não foi possível gerar o arquivo do calendário.', tone: 'danger' });
    } finally {
      setDownloading(false);
    }
  };

  const share = async () => {
    const text = `Agendei ${servicesLabel} na ${shop.name} — ${local.dateLabel} às ${local.time}. Código ${appointment.bookingCode}.`;
    const url = typeof window !== 'undefined' ? window.location.href : '';

    // `navigator.share` é o caminho nativo no celular, que é onde a maioria
    // agenda; a área de transferência é a alternativa no desktop.
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: shop.name, text, url });
        return;
      } catch {
        // Compartilhamento cancelado pelo usuário não é erro.
        return;
      }
    }

    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      toast({ message: 'Link copiado!', tone: 'success' });
    } catch {
      toast({ message: 'Não foi possível copiar o link.', tone: 'danger' });
    }
  };

  return (
    <SuccessScreen
      title="Agendado! 🎉"
      subtitle={`Te esperamos ${local.weekdayLower} às ${local.time}`}
      summary={[
        { icon: <span aria-hidden="true">✂️</span>, label: `${servicesLabel} · ${formatDuration(totalDuration)}` },
        { icon: <span aria-hidden="true">👤</span>, label: appointment.barber.name },
        { icon: <span aria-hidden="true">📅</span>, label: `${local.dateLabel} · ${local.time}` },
        {
          icon: <span aria-hidden="true">💰</span>,
          label: appointment.coveredBySubscription
            ? `${formatPrice(appointment.totalPriceCents)} · coberto pela assinatura`
            : formatPrice(appointment.totalPriceCents),
          emphasis: true,
        },
      ]}
      code={{ label: 'Código da reserva', value: appointment.bookingCode }}
      actions={
        <>
          <Button fullWidth size="lg" loading={downloading} onClick={addToCalendar}>
            Adicionar ao calendário
          </Button>
          <Button variant="outline" fullWidth size="lg" onClick={() => void share()}>
            Compartilhar
          </Button>
          <Button variant="ghost" fullWidth size="lg" onClick={onRestart}>
            Fazer outro agendamento
          </Button>
        </>
      }
      note={
        <ul className="flex flex-col gap-1">
          <li>• Chegue 5 min antes</li>
          <li>
            • Cancele ou remarque até {appointment.cancelWindowHours}h antes, com o código{' '}
            <span className="font-mono">{appointment.bookingCode}</span>
          </li>
          <li>
            • Após {shop.policy.noShowBlockCount} faltas o agendamento online é bloqueado
          </li>
        </ul>
      }
      onClose={onClose}
    />
  );
}

/** Rótulos de data no fuso da barbearia (e não no de quem está olhando). */
function formatInTimeZone(iso: string, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(iso));

  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const dateKey = `${read('year')}-${read('month')}-${read('day')}`;
  const dateLabel = formatDateKeyLong(dateKey);

  return {
    dateKey,
    dateLabel,
    time: `${read('hour')}:${read('minute')}`,
    weekdayLower: dateLabel.split(',')[0]!.toLowerCase(),
  };
}

/**
 * Evento `.ics` do agendamento.
 *
 * Gerado no navegador de propósito: é um arquivo de 15 linhas montado com dado
 * que a tela já tem, e uma rota na API para isso só acrescentaria latência e
 * uma superfície pública a mais.
 */
function buildIcs(
  shop: PublicBarbershop,
  appointment: AppointmentSummary,
  servicesLabel: string,
): string {
  const stamp = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const escape = (value: string) => value.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BarberVP//Booking//PT-BR',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${appointment.id}@barbervp`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(appointment.startsAt)}`,
    `DTEND:${stamp(appointment.endsAt)}`,
    `SUMMARY:${escape(`${servicesLabel} — ${shop.name}`)}`,
    `DESCRIPTION:${escape(`Com ${appointment.barber.name}. Código da reserva: ${appointment.bookingCode}.`)}`,
    ...(shop.address ? [`LOCATION:${escape(shop.address)}`] : []),
    'BEGIN:VALARM',
    'TRIGGER:-PT2H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escape(`Seu horário na ${shop.name} é daqui a 2 horas`)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}
