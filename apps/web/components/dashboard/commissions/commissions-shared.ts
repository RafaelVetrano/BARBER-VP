import type { CommissionBarberSummary, CommissionPeriodResponse, CommissionPeriodType } from '@barbervp/types';
import { formatBRL } from '@barbervp/types';

/**
 * Rótulos e recortes de data da aba Comissões (`Dashboard.dc.html`
 * l.1089–1228). Só FORMATO — nenhum número: todos vêm da API.
 *
 * Tudo aqui trabalha em UTC de propósito. O período é a competência da
 * barbearia, não um instante: `2026-08-17` precisa ser sábado dia 17 em
 * qualquer fuso, e `new Date('2026-08-17')` impresso no horário local já
 * volta um dia em todo o Brasil.
 */

/** `40%`, `42,5%` — sem casa decimal quando a taxa é redonda. */
export function percentLabel(percentBps: number): string {
  const percent = percentBps / 100;
  return Number.isInteger(percent) ? `${percent}%` : `${percent.toFixed(1).replace('.', ',')}%`;
}

/** Texto do chip "Regra aplicada" da tabela. */
export function ruleChipLabel(barber: CommissionBarberSummary): string {
  if (!barber.ruleName) return 'Sem regra';
  const applied = barber.appliedPercentBps === null ? null : percentLabel(barber.appliedPercentBps);
  if (barber.ruleType === 'TIERED') {
    // "Faixas progressivas" por extenso é largo o bastante para empurrar a
    // coluna do PDF para fora da tabela num período sem lançamentos, que é
    // justamente quando a taxa aplicada ainda não existe.
    return applied ? `Faixas · ${applied}` : 'Faixas';
  }
  return applied ?? barber.ruleName;
}

/**
 * A nota sob o extrato expandido (`r.nota`). Existe para responder a pergunta
 * que a coluna "% aplicado" levanta: *por que* esta taxa, e não outra.
 */
export function extractNote(barber: CommissionBarberSummary, monthLabelText: string): string {
  if (!barber.ruleName) {
    return 'Este barbeiro não tem regra de comissão vinculada — nada é lançado até que uma regra seja definida.';
  }

  const parts: string[] = [];
  if (barber.ruleType === 'TIERED' && barber.appliedPercentBps !== null) {
    parts.push(
      `Faixa aplicada: ${percentLabel(barber.appliedPercentBps)} sobre serviços, ` +
        `pelo faturamento de ${formatBRL(barber.faturadoServicosCents)} em ${monthLabelText}.`,
    );
  } else if (barber.appliedPercentBps !== null) {
    parts.push(`Percentual fixo de ${percentLabel(barber.appliedPercentBps)} sobre serviços.`);
  }

  parts.push(
    barber.ruleProdutosPercentBps > 0
      ? `Produtos comissionam ${percentLabel(barber.ruleProdutosPercentBps)}, fora das faixas.`
      : 'Produtos não geram comissão nesta regra.',
  );

  if (barber.valeCents > 0) {
    if (!barber.deductVales) {
      parts.push(
        `${formatBRL(barber.valeCents)} em vales NÃO são descontados: a regra tem o desconto automático desligado.`,
      );
    } else if (barber.valeCents > barber.comissaoCents) {
      // O total nunca fica negativo (ninguém "paga para trabalhar"), mas o
      // saldo não desaparece — sem esta frase, um total zerado pareceria
      // quitação e a diferença sumiria da vista de quem confere.
      parts.push(
        `${formatBRL(barber.valeCents)} em vales superam a comissão do período: ` +
          `${formatBRL(barber.valeCents - barber.comissaoCents)} seguem em aberto e o total a receber fica zerado.`,
      );
    } else {
      parts.push(`${formatBRL(barber.valeCents)} em vales serão descontados no fechamento.`);
    }
  }

  if (barber.status === 'PENDING' && barber.ruleType === 'TIERED') {
    parts.push('A taxa é provisória até o fechamento do período.');
  }

  return parts.join(' ');
}

// ── Recortes de período ────────────────────────────────────────────────────

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseISO(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Segunda-feira da semana do dia — o mesmo corte do backend. */
export function weekStartOf(day: string): string {
  const date = parseISO(day);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return toISO(date);
}

/** `‹` e `›` do stepper: uma semana ou um mês para trás/frente. */
export function shiftAnchor(anchor: string, type: CommissionPeriodType, step: -1 | 1): string {
  const date = parseISO(anchor);
  if (type === 'WEEKLY') {
    date.setUTCDate(date.getUTCDate() + step * 7);
    return toISO(date);
  }
  // Dia 1 antes de somar o mês: partindo do dia 31, `+1 mês` cairia em março.
  const shifted = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + step, 1));
  return toISO(shifted);
}

/** `Agosto 2026` — o título do stepper no modo Mensal. */
export function monthLabel(month: string): string {
  const [year, mm] = month.split('-').map(Number);
  const label = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year ?? 1970, (mm ?? 1) - 1, 1)),
  );
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Só o nome do mês, para a nota do extrato: `agosto`. */
export function monthNameOf(month: string): string {
  const [year, mm] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year ?? 1970, (mm ?? 1) - 1, 1)),
  );
}

/** `17 – 23 de ago` no modo Semanal; `Agosto 2026` no Mensal. */
export function periodTitle(period: { type: CommissionPeriodType; month: string; start: string; end: string }): string {
  if (period.type === 'MONTHLY') return monthLabel(period.month);
  const short = (day: string) =>
    new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' })
      .format(parseISO(day))
      .replace('.', '');
  return `${short(period.start)} – ${short(period.end)}`;
}

/** `01/08 a 31/08/2026` — o card KPI "Período". */
export function periodRangeLabel(period: CommissionPeriodResponse): string {
  const day = (iso: string) => iso.split('-').reverse().join('/');
  return `${day(period.start)} a ${day(period.end)}`;
}

/** `17/08` — a coluna "Data" do extrato. */
export function dayLabel(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: timezone }).format(
    new Date(iso),
  );
}
