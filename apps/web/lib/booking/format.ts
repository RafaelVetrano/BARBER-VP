import { minutesToTime, type PublicBusinessHour } from '@barbervp/types';

/** `4500` → `R$ 45` · `4550` → `R$ 45,50`. O protótipo omite centavos redondos. */
export function formatPrice(cents: number): string {
  const hasCents = cents % 100 !== 0;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  }).format(cents / 100);
}

export const WEEKDAY_ABBR = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

export const WEEKDAY_FULL = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];

export const MONTH_ABBR = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];

export const MONTH_FULL = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

/**
 * Partes de uma chave `YYYY-MM-DD`.
 *
 * Lida como texto, nunca como `new Date('2026-08-17')` — essa construção é
 * interpretada em UTC e, num navegador a oeste de Greenwich, devolve o dia
 * anterior. A chave já vem no fuso da barbearia; aqui só se fatia string.
 */
export function parseDateKey(dateKey: string): { year: number; month: number; day: number } {
  const [year, month, day] = dateKey.split('-').map(Number);
  return { year: year ?? 0, month: month ?? 1, day: day ?? 1 };
}

/** Dia da semana da chave — 0 = domingo. */
export function weekdayOfKey(dateKey: string): number {
  return new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
}

/** `2026-08-17` → `Segunda-feira, 17 de agosto`. */
export function formatDateKeyLong(dateKey: string): string {
  const { month, day } = parseDateKey(dateKey);
  return `${WEEKDAY_FULL[weekdayOfKey(dateKey)]}, ${day} de ${MONTH_FULL[month - 1]}`;
}

/** `há 3 dias`, `há 1 semana`, `há 2 meses` — o rótulo das avaliações. */
export function formatRelativeDate(iso: string, now = Date.now()): string {
  const days = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 86_400_000));

  if (days === 0) return 'hoje';
  if (days === 1) return 'ontem';
  if (days < 7) return `há ${days} dias`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? 'há 1 semana' : `há ${weeks} semanas`;
  }
  if (days < 365) {
    const months = Math.max(1, Math.floor(days / 30));
    return months === 1 ? 'há 1 mês' : `há ${months} meses`;
  }
  const years = Math.floor(days / 365);
  return years === 1 ? 'há 1 ano' : `há ${years} anos`;
}

export interface OpenState {
  open: boolean;
  /** "Aberto agora · fecha às 20h" ou "Fechado · abre ter às 9h". */
  label: string;
}

/**
 * Aberto ou fechado AGORA, no fuso da barbearia.
 *
 * O protótipo tem isso como um booleano de demonstração; aqui sai do horário de
 * funcionamento real. O relógio é o da barbearia, não o de quem olha: um
 * cliente viajando não pode ver "fechado" numa terça às 15h do horário local
 * dela.
 */
export function resolveOpenState(
  hours: PublicBusinessHour[],
  timezone: string,
  now = new Date(),
): OpenState {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(now);

  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? '0';
  const weekdayName = read('weekday');
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekdayName);
  const minutes = Number(read('hour')) * 60 + Number(read('minute'));

  const byWeekday = new Map(hours.map((hour) => [hour.weekday, hour]));
  const today = byWeekday.get(weekday);

  if (today && !today.closed && minutes >= today.opensAt && minutes < today.closesAt) {
    return { open: true, label: `Aberto agora · fecha às ${minutesToTime(today.closesAt)}` };
  }

  // Procura a próxima abertura, olhando o resto de hoje e os 7 dias seguintes.
  for (let ahead = 0; ahead <= 7; ahead += 1) {
    const candidateWeekday = (weekday + ahead) % 7;
    const candidate = byWeekday.get(candidateWeekday);
    if (!candidate || candidate.closed) continue;
    if (ahead === 0 && minutes >= candidate.opensAt) continue;

    const when =
      ahead === 0 ? 'hoje' : ahead === 1 ? 'amanhã' : WEEKDAY_ABBR[candidateWeekday]?.toLowerCase();
    return { open: false, label: `Fechado · abre ${when} às ${minutesToTime(candidate.opensAt)}` };
  }

  return { open: false, label: 'Fechado' };
}

/** Link `wa.me` a partir do telefone em E.164 já sem formatação. */
export function whatsappLink(phone: string, message?: string): string {
  const digits = phone.replace(/\D/g, '');
  const text = message ? `?text=${encodeURIComponent(message)}` : '';
  return `https://wa.me/${digits}${text}`;
}

/** `@barbeariacentral` ou uma URL completa → sempre uma URL completa. */
export function instagramLink(handle: string): string {
  if (/^https?:\/\//i.test(handle)) return handle;
  return `https://instagram.com/${handle.replace(/^@/, '')}`;
}

/** Rota no mapa — abre no app padrão do aparelho. */
export function mapsLink(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
