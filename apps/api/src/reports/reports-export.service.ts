import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { formatBRL } from '@barbervp/types';
import type { ReportsAdvancedResponse, ReportsSummaryResponse } from '@barbervp/types';
import { PrismaService } from '../prisma/prisma.service';

/** Mesma paleta clara do relatório de comissão (agente 19) — papel, não tela. */
const INK = '#1A1D22';
const MUTED = '#5B616B';
const RULE = '#C9CDD4';
const PANEL = '#E9EBEE';

const MARGIN = 48;
const PAGE_WIDTH = 595.28; // A4 retrato, em pontos.
const CONTENT = PAGE_WIDTH - MARGIN * 2;

const METHOD_LABEL: Record<string, string> = {
  PIX: 'Pix',
  CASH: 'Dinheiro',
  DEBIT: 'Débito',
  CREDIT: 'Crédito',
  SUBSCRIPTION: 'Assinatura',
  OTHER: 'Outro',
};

export interface ReportExport {
  filename: string;
  body: Buffer;
}

/**
 * "Exportar PDF" e "Exportar CSV" (`Dashboard.dc.html` l.1276–1277).
 *
 * Os dois arquivos saem do MESMO par de respostas que a tela desenha — nunca
 * de um segundo cálculo. No protótipo os dois botões são os únicos controles
 * da barra que ficam translúcidos fora do plano, e é por isso que a exportação
 * carrega o payload avançado: um CSV sem serviços, retenção e ticket seria só
 * o que a tela já mostra sem cadeado.
 */
@Injectable()
export class ReportsExportService {
  constructor(private readonly prisma: PrismaService) {}

  async csv(
    tenantId: string,
    summary: ReportsSummaryResponse,
    advanced: ReportsAdvancedResponse,
  ): Promise<ReportExport> {
    const tenant = await this.tenantName(tenantId);
    const rows: string[][] = [
      ['Relatório', tenant],
      ['Período', `${brDate(summary.period.from)} a ${brDate(summary.period.to)}`],
      [],
      ['Resumo'],
      ['Faturamento', reais(summary.revenueCents)],
      ['Período anterior', reais(summary.previousRevenueCents)],
      ['Variação (%)', summary.deltaPct === null ? '—' : String(summary.deltaPct)],
      ['Comandas fechadas', String(summary.orders)],
      ['Ticket médio', reais(summary.averageTicketCents)],
      [],
      ['Faturamento por período'],
      ['Rótulo', 'Faturamento'],
      ...summary.revenueSeries.map((point) => [point.label, reais(point.revenueCents)]),
      [],
      ['Faturamento por barbeiro'],
      ['Barbeiro', 'Faturamento', 'Comandas'],
      ...summary.revenueByBarber.map((row) => [row.barberName, reais(row.revenueCents), String(row.orders)]),
      [],
      ['Faturamento por forma de pagamento'],
      ['Forma', 'Valor', '%'],
      ...summary.paymentDistribution.map((row) => [
        METHOD_LABEL[row.method] ?? row.method,
        reais(row.amountCents),
        String(row.pct),
      ]),
      [],
      ['Faturamento por serviço'],
      ['Serviço', 'Faturamento', 'Qtd.'],
      ...advanced.revenueByService.map((row) => [row.serviceName, reais(row.revenueCents), String(row.count)]),
      [],
      ['Ticket médio por barbeiro'],
      ['Barbeiro', 'Atendimentos', 'Ticket médio'],
      ...advanced.ticketByBarber.map((row) => [row.barberName, String(row.orders), reais(row.ticketCents)]),
      [],
      ['Taxa de retorno'],
      ['Faixa', 'Clientes', '%'],
      ...advanced.returnRate.buckets.map((row) => [row.label, String(row.clients), String(row.pct)]),
      [],
      ['Taxa de faltas por mês'],
      ['Mês', 'Atendimentos', 'Faltas', '%'],
      ...advanced.noShowTrend.points.map((row) => [
        row.month,
        String(row.appointments),
        String(row.noShows),
        String(row.pct),
      ]),
    ];

    // Ponto e vírgula + BOM: é o que o Excel em pt-BR abre em colunas sem pedir
    // nada ao usuário — vírgula cairia tudo numa célula só, porque a vírgula
    // decimal já está nos valores.
    const csv = rows.map((row) => row.map(escapeCell).join(';')).join('\r\n');
    return {
      filename: filenameFor(tenant, summary, 'csv'),
      body: Buffer.from(`﻿${csv}`, 'utf8'),
    };
  }

  async pdf(
    tenantId: string,
    summary: ReportsSummaryResponse,
    advanced: ReportsAdvancedResponse,
  ): Promise<ReportExport> {
    const tenant = await this.tenantName(tenantId);
    const body = await render(tenant, summary, advanced);
    return { filename: filenameFor(tenant, summary, 'pdf'), body };
  }

  private async tenantName(tenantId: string): Promise<string> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { name: true },
    });
    return tenant.name;
  }
}

// ── PDF ──────────────────────────────────────────────────────────────────

type Doc = InstanceType<typeof PDFDocument>;

function render(
  tenantName: string,
  summary: ReportsSummaryResponse,
  advanced: ReportsAdvancedResponse,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: MARGIN, info: { Title: 'Relatório' } });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fillColor(INK).font('Helvetica-Bold').fontSize(18).text('Relatório', MARGIN, MARGIN);
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(MUTED)
      .text(`${tenantName} · ${brDate(summary.period.from)} a ${brDate(summary.period.to)}`, {
        width: CONTENT,
      });
    if (summary.scoped) {
      doc.text('Recorte: seus atendimentos.', { width: CONTENT });
    }
    doc.moveDown(0.6);
    hline(doc, INK, 1.4);
    doc.moveDown(0.9);

    // ── Resumo ────────────────────────────────────────────────────────────
    const boxTop = doc.y;
    doc.roundedRect(MARGIN, boxTop, CONTENT, 76, 8).fill(PANEL);
    kpi(doc, MARGIN + 16, boxTop + 14, 'Faturamento', formatBRL(summary.revenueCents));
    kpi(doc, MARGIN + 16 + CONTENT / 3, boxTop + 14, 'Comandas', String(summary.orders));
    kpi(
      doc,
      MARGIN + 16 + (CONTENT / 3) * 2,
      boxTop + 14,
      'Ticket médio',
      formatBRL(summary.averageTicketCents),
    );
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(MUTED)
      .text(
        summary.deltaPct === null
          ? 'Sem período anterior para comparar.'
          : `${summary.deltaPct >= 0 ? '+' : ''}${summary.deltaPct}% vs. período anterior (${formatBRL(summary.previousRevenueCents)}).`,
        MARGIN + 16,
        boxTop + 54,
        { width: CONTENT - 32 },
      );
    doc.y = boxTop + 76 + 20;

    section(doc, 'Faturamento por barbeiro', ['Barbeiro', 'Comandas', 'Faturamento'], [200, 100, 147],
      summary.revenueByBarber.map((row) => [row.barberName, String(row.orders), formatBRL(row.revenueCents)]));

    section(doc, 'Faturamento por forma de pagamento', ['Forma', 'Valor', '%'], [200, 147, 100],
      summary.paymentDistribution.map((row) => [
        METHOD_LABEL[row.method] ?? row.method,
        formatBRL(row.amountCents),
        `${row.pct}%`,
      ]));

    section(doc, 'Faturamento por serviço', ['Serviço', 'Qtd.', 'Faturamento'], [240, 60, 147],
      advanced.revenueByService.map((row) => [row.serviceName, String(row.count), formatBRL(row.revenueCents)]));

    section(doc, 'Ticket médio por barbeiro', ['Barbeiro', 'Atend.', 'Ticket médio'], [240, 60, 147],
      advanced.ticketByBarber.map((row) => [row.barberName, String(row.orders), formatBRL(row.ticketCents)]));

    section(
      doc,
      `Taxa de retorno — ${advanced.returnRate.headlinePct}% voltam em até ${advanced.returnRate.withinDays} dias`,
      ['Faixa', 'Clientes', '%'],
      [240, 100, 107],
      advanced.returnRate.buckets.map((row) => [row.label, String(row.clients), `${row.pct}%`]),
    );

    section(doc, 'Taxa de faltas por mês', ['Mês', 'Atend.', 'Faltas', '%'], [140, 90, 90, 127],
      advanced.noShowTrend.points.map((row) => [
        row.label,
        String(row.appointments),
        String(row.noShows),
        `${row.pct}%`,
      ]));

    doc.end();
  });
}

function kpi(doc: Doc, x: number, y: number, label: string, value: string): void {
  doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(label.toUpperCase(), x, y, { width: CONTENT / 3 - 20 });
  doc.font('Helvetica-Bold').fontSize(14).fillColor(INK).text(value, x, y + 12, { width: CONTENT / 3 - 20 });
}

function section(doc: Doc, title: string, headers: string[], widths: number[], rows: string[][]): void {
  if (doc.y > doc.page.height - MARGIN - 120) {
    doc.addPage();
  }
  doc.font('Helvetica-Bold').fontSize(12).fillColor(INK).text(title, MARGIN, doc.y, { width: CONTENT });
  doc.moveDown(0.4);

  if (rows.length === 0) {
    doc.font('Helvetica').fontSize(9.5).fillColor(MUTED).text('Sem dados no período.', MARGIN, doc.y);
    doc.moveDown(1.2);
    return;
  }

  tableRow(doc, headers, widths, true);
  hline(doc, RULE, 0.8);
  doc.y += 5;
  for (const row of rows) {
    // Linha nunca é partida entre páginas — o número órfão no topo da folha
    // seguinte é justamente o que alguém vai conferir.
    if (doc.y > doc.page.height - MARGIN - 40) {
      doc.addPage();
      tableRow(doc, headers, widths, true);
      hline(doc, RULE, 0.8);
      doc.y += 5;
    }
    tableRow(doc, row, widths, false);
  }
  doc.moveDown(1.2);
}

function tableRow(doc: Doc, cells: string[], widths: number[], header: boolean): void {
  const top = doc.y;
  doc
    .font(header ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(header ? 8.5 : 9.5)
    .fillColor(header ? MUTED : INK);

  let x = MARGIN;
  widths.forEach((width, index) => {
    doc.text(header ? (cells[index] ?? '').toUpperCase() : (cells[index] ?? ''), x, top, {
      width,
      align: index === 0 ? 'left' : 'right',
      lineBreak: false,
      ellipsis: true,
    });
    x += width;
  });
  doc.y = top + (header ? 13 : 14);
}

function hline(doc: Doc, color: string, width: number): void {
  doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + CONTENT, doc.y).lineWidth(width).strokeColor(color).stroke();
}

// ── Auxiliares ───────────────────────────────────────────────────────────

/** Valor em reais com vírgula decimal e SEM "R$" — coluna de planilha é número. */
function reais(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

function brDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

function escapeCell(value: string): string {
  return /[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function filenameFor(tenantName: string, summary: ReportsSummaryResponse, extension: string): string {
  const slug = tenantName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `relatorio-${slug || 'barbearia'}-${summary.period.from}-a-${summary.period.to}.${extension}`;
}
