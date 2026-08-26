import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { formatBRL } from '@barbervp/types';
import type { CommissionBarberSummary, CommissionPeriodResponse } from '@barbervp/types';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/errors/api.exception';

/** Paleta clara do `modalPdfOpen` (`Dashboard.dc.html` l.4228) — papel, não tela. */
const INK = '#1A1D22';
const MUTED = '#5B616B';
const RULE = '#C9CDD4';
const HAIRLINE = '#E3E5E9';
const PANEL = '#E9EBEE';
const DANGER = '#B03A3A';

const MARGIN = 48;
const PAGE_WIDTH = 595.28; // A4 retrato, em pontos.
const CONTENT = PAGE_WIDTH - MARGIN * 2;

/** As 5 colunas do relatório, nas mesmas proporções da tabela do modal. */
const COLUMNS = [
  { key: 'data', header: 'Data', width: 68, align: 'left' as const },
  { key: 'cliente', header: 'Cliente', width: 138, align: 'left' as const },
  { key: 'item', header: 'Serviço', width: 155, align: 'left' as const },
  { key: 'valor', header: 'Valor', width: 92, align: 'right' as const },
  { key: 'pct', header: '%', width: 46, align: 'right' as const },
];

export interface CommissionReport {
  filename: string;
  body: Buffer;
}

/**
 * "Baixar PDF" do `modalPdfOpen`. O modal na tela é a PRÉ-VISUALIZAÇÃO; o
 * arquivo sai daqui, montado a partir do mesmo `CommissionPeriodResponse` que
 * alimenta a tabela — nunca de um segundo cálculo, senão o papel e a tela
 * discordariam no dia em que uma das duas fórmulas mudasse.
 */
@Injectable()
export class CommissionReportService {
  constructor(private readonly prisma: PrismaService) {}

  async build(
    tenantId: string,
    barberId: string,
    period: CommissionPeriodResponse,
  ): Promise<CommissionReport> {
    const barber = period.barbers.find((row) => row.barberId === barberId);
    if (!barber) {
      // Vale também para o `BARBER` que pede o relatório de um colega: o
      // extrato dele já vem filtrado, então o colega simplesmente não existe
      // na resposta.
      throw ApiException.notFound('Barbeiro não encontrado neste período.');
    }

    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { name: true, timezone: true },
    });

    const body = await render(tenant.name, tenant.timezone, period, barber);
    return { filename: filenameFor(barber.barberName, period), body };
  }
}

function render(
  tenantName: string,
  timezone: string,
  period: CommissionPeriodResponse,
  barber: CommissionBarberSummary,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: MARGIN, info: { Title: 'Relatório de Comissão' } });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // ── Cabeçalho ───────────────────────────────────────────────────────
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(18).text('Relatório de Comissão', MARGIN, MARGIN);
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(MUTED)
      .text(`${tenantName} · Período ${periodLabel(period)}`, { width: CONTENT });
    doc.moveDown(0.6);
    hline(doc, INK, 1.4);
    doc.moveDown(0.9);

    // ── Barbeiro e regra ────────────────────────────────────────────────
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(13).text(barber.barberName);
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(MUTED)
      .text(`Regra aplicada: ${ruleLabel(barber)}`);
    doc.moveDown(1);

    // ── Extrato ─────────────────────────────────────────────────────────
    if (barber.extrato.length === 0) {
      doc.font('Helvetica').fontSize(10).fillColor(MUTED).text('Nenhum atendimento no período.');
      doc.moveDown(1);
    } else {
      tableHeader(doc);
      for (const entry of barber.extrato) {
        // Uma linha nunca é partida entre páginas: a `%` órfã no topo da folha
        // seguinte é justamente o número que alguém vai conferir.
        if (doc.y > doc.page.height - MARGIN - 90) {
          doc.addPage();
          tableHeader(doc);
        }
        tableRow(doc, [
          dayLabel(entry.date, timezone),
          entry.clientName,
          entry.itemName,
          formatBRL(entry.baseCents),
          `${percentLabel(entry.percentBps)}%`,
        ]);
      }
      doc.moveDown(1);
    }

    // ── Totais ──────────────────────────────────────────────────────────
    if (doc.y > doc.page.height - MARGIN - 130) doc.addPage();
    const boxTop = doc.y;
    const boxHeight = 96;
    doc.roundedRect(MARGIN, boxTop, CONTENT, boxHeight, 8).fill(PANEL);

    let line = boxTop + 14;
    line = totalLine(doc, line, 'Comissão serviços', formatBRL(barber.comissaoServicosCents), INK);
    line = totalLine(doc, line, 'Comissão produtos', formatBRL(barber.comissaoProdutosCents), INK);
    line = totalLine(
      doc,
      line,
      // Hífen, e não o MINUS SIGN (U+2212) da tela: as fontes padrão do PDF
      // são WinAnsi e imprimem um `"` no lugar do glifo que não têm.
      barber.deductVales ? '(-) Vales' : '(-) Vales (não descontados nesta regra)',
      formatBRL(barber.valeCents),
      DANGER,
    );

    doc.moveTo(MARGIN + 14, line + 2).lineTo(MARGIN + CONTENT - 14, line + 2).lineWidth(0.7).strokeColor(RULE).stroke();
    doc.font('Helvetica-Bold').fontSize(13).fillColor(INK);
    doc.text('Total a receber', MARGIN + 14, line + 10, { width: CONTENT - 28 });
    doc.text(formatBRL(barber.totalCents), MARGIN + 14, line + 10, { width: CONTENT - 28, align: 'right' });

    doc.y = boxTop + boxHeight + 18;
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(MUTED)
      .text(
        period.closed
          ? 'Período fechado — os valores acima estão travados.'
          : 'Período em aberto — a taxa é provisória até o fechamento.',
        MARGIN,
        doc.y,
        { width: CONTENT },
      );

    doc.end();
  });
}

type Doc = InstanceType<typeof PDFDocument>;

function hline(doc: Doc, color: string, width: number): void {
  doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + CONTENT, doc.y).lineWidth(width).strokeColor(color).stroke();
}

function tableHeader(doc: Doc): void {
  const top = doc.y;
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(MUTED);
  let x = MARGIN;
  for (const column of COLUMNS) {
    doc.text(column.header.toUpperCase(), x, top, { width: column.width, align: column.align });
    x += column.width;
  }
  doc.y = top + 14;
  hline(doc, RULE, 0.8);
  doc.y += 6;
}

function tableRow(doc: Doc, cells: string[]): void {
  const top = doc.y;
  doc.font('Helvetica').fontSize(9.5).fillColor(INK);
  let x = MARGIN;
  COLUMNS.forEach((column, index) => {
    doc.text(cells[index] ?? '', x, top, {
      width: column.width,
      align: column.align,
      // `lineBreak: false` + `ellipsis` mantêm a grade: um nome comprido
      // empurraria a linha inteira para baixo e desalinharia as colunas.
      lineBreak: false,
      ellipsis: true,
    });
    x += column.width;
  });
  doc.y = top + 14;
  hline(doc, HAIRLINE, 0.5);
  doc.y += 4;
}

function totalLine(doc: Doc, y: number, label: string, value: string, color: string): number {
  doc.font('Helvetica').fontSize(10).fillColor(color);
  doc.text(label, MARGIN + 14, y, { width: CONTENT - 28 });
  doc.text(value, MARGIN + 14, y, { width: CONTENT - 28, align: 'right' });
  return y + 16;
}

/** `40%`, `42,5%` — sem casa decimal quando a taxa é redonda. */
function percentLabel(percentBps: number): string {
  const percent = percentBps / 100;
  return Number.isInteger(percent) ? String(percent) : percent.toFixed(1).replace('.', ',');
}

function ruleLabel(barber: CommissionBarberSummary): string {
  if (!barber.ruleName) return 'Sem regra vinculada';
  const applied = barber.appliedPercentBps;
  const base = applied === null ? barber.ruleName : `${barber.ruleName} · ${percentLabel(applied)}%`;
  return barber.ruleProdutosPercentBps > 0
    ? `${base} sobre serviços, ${percentLabel(barber.ruleProdutosPercentBps)}% sobre produtos`
    : base;
}

function dayLabel(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: timezone }).format(
    new Date(iso),
  );
}

function periodLabel(period: CommissionPeriodResponse): string {
  const day = (iso: string) => iso.split('-').reverse().join('/');
  return period.type === 'WEEKLY'
    ? `${day(period.start)} a ${day(period.end)}`
    : monthLabel(period.month);
}

function monthLabel(month: string): string {
  const [year, mm] = month.split('-').map(Number);
  const label = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year ?? 1970, (mm ?? 1) - 1, 1)),
  );
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function filenameFor(barberName: string, period: CommissionPeriodResponse): string {
  const slug = barberName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const suffix = period.type === 'WEEKLY' ? `${period.start}_${period.end}` : period.month;
  return `comissao-${slug || 'barbeiro'}-${suffix}.pdf`;
}
