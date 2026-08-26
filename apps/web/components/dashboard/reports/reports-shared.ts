import type { ReportPeriodKey } from '@barbervp/types';

/**
 * O upsell dos blocos com cadeado — os três benefícios do protótipo
 * (`onRelLockedClick`, `Dashboard.dc.html` l.6916). Ficam aqui porque o
 * cadeado aparece em cinco blocos e o texto tem de ser o mesmo nos cinco.
 */
export const LOCKED_BULLETS = [
  'Heatmap de horários de pico',
  'Taxa de retorno e faltas',
  'Exportação em PDF/CSV',
];

/** O upsell dos dois botões da barra (`exportRelatorioPdf`, l.6929). */
export const EXPORT_BULLETS = [
  'Exportação de relatórios em PDF',
  'Exportação em CSV',
  'Relatórios avançados completos',
];

export const LOCKED_MIN_PLAN = 'Profissional';

/** Cores das fatias da rosca, na ordem do protótipo (`PAYMENT_SEGMENTS`, l.6853). */
export const PAYMENT_COLORS = ['#D4A84C', '#5B8DE0', '#3FB68B', '#E8A13C', '#5B616B'];

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  PIX: 'Pix',
  CREDIT: 'Crédito',
  CASH: 'Dinheiro',
  DEBIT: 'Débito',
  SUBSCRIPTION: 'Assinatura',
  OTHER: 'Outro',
};

export function methodLabel(method: string): string {
  return PAYMENT_METHOD_LABEL[method] ?? method;
}

/** Hoje no fuso do NAVEGADOR — só alimenta os dois `<input type=date>`. */
export function todayInput(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export function daysAgoInput(days: number): string {
  const now = new Date();
  now.setDate(now.getDate() - days);
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

/** "01/08/2026 a 22/08/2026" — o subtítulo que nomeia o recorte aplicado. */
export function periodRangeLabel(from: string, to: string): string {
  return from === to ? brDate(from) : `${brDate(from)} a ${brDate(to)}`;
}

export function brDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

/**
 * No máximo 8 rótulos no eixo X, como o protótipo (`revLabelStep`, l.6832):
 * 30 dias renderizariam 30 textos de 11px em cima uns dos outros.
 */
export function thinLabels<T>(items: T[], max = 8): Array<{ item: T; index: number }> {
  const step = Math.max(1, Math.ceil(items.length / max));
  return items
    .map((item, index) => ({ item, index }))
    .filter((entry) => entry.index % step === 0 || entry.index === items.length - 1);
}

/** Rótulo curto do período para o texto de apoio dos cards. */
export const PERIOD_HINT: Record<ReportPeriodKey, string> = {
  hoje: 'hoje',
  '7d': 'nos últimos 7 dias',
  '30d': 'nos últimos 30 dias',
  mes: 'neste mês',
  custom: 'no período',
};
