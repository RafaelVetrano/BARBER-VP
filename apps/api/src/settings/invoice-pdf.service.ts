import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { formatBRL } from '@barbervp/types';

/**
 * Recibo de UMA fatura do SaaS — o link "PDF" de cada linha do histórico
 * (`Dashboard.dc.html` l.2672), que até aqui era um `href="#"` com um toast.
 *
 * Mesma paleta clara do relatório de comissões e do export de Relatórios:
 * papel é papel, não tem tema escuro.
 */
const INK = '#1A1D22';
const MUTED = '#5B616B';
const RULE = '#C9CDD4';
const PANEL = '#E9EBEE';

const MARGIN = 48;
const PAGE_WIDTH = 595.28; // A4 retrato, em pontos.
const CONTENT = PAGE_WIDTH - MARGIN * 2;

export interface InvoiceExport {
  filename: string;
  body: Buffer;
}

export interface InvoicePdfInput {
  invoiceId: string;
  tenantName: string;
  tenantDocument: string | null;
  planName: string;
  amountCents: number;
  status: 'PAID' | 'PENDING' | 'FAILED';
  overdue: boolean;
  issuedAt: Date;
  paidAt: Date | null;
  externalId: string | null;
}

@Injectable()
export class InvoicePdfService {
  async render(input: InvoicePdfInput): Promise<InvoiceExport> {
    const body = await draw(input);
    return { filename: filenameFor(input), body };
  }
}

/** O mesmo rótulo que a tabela da tela mostra — um só vocabulário. */
export function invoiceStatusLabel(status: InvoicePdfInput['status'], overdue: boolean): string {
  if (status === 'PAID') return 'Pago';
  if (status === 'FAILED') return 'Recusado';
  return overdue ? 'Atrasado' : 'Pendente';
}

function draw(input: InvoicePdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: MARGIN, info: { Title: 'Fatura BarberVP' } });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fillColor(INK).font('Helvetica-Bold').fontSize(18).text('Fatura BarberVP', MARGIN, MARGIN);
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(MUTED)
      .text(`Assinatura do plano ${input.planName}`, { width: CONTENT });
    doc.moveDown(0.6);
    doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + CONTENT, doc.y).lineWidth(1.4).strokeColor(INK).stroke();
    doc.moveDown(0.9);

    const top = doc.y;
    doc.roundedRect(MARGIN, top, CONTENT, 64, 8).fill(PANEL);
    doc.fillColor(MUTED).font('Helvetica').fontSize(9).text('VALOR', MARGIN + 16, top + 14);
    doc
      .fillColor(INK)
      .font('Helvetica-Bold')
      .fontSize(20)
      .text(formatBRL(input.amountCents), MARGIN + 16, top + 28);
    doc.fillColor(MUTED).font('Helvetica').fontSize(9).text('SITUAÇÃO', MARGIN + 16 + CONTENT / 2, top + 14);
    doc
      .fillColor(INK)
      .font('Helvetica-Bold')
      .fontSize(14)
      .text(invoiceStatusLabel(input.status, input.overdue), MARGIN + 16 + CONTENT / 2, top + 30);
    doc.y = top + 64 + 22;

    row(doc, 'Barbearia', input.tenantName);
    if (input.tenantDocument) {
      row(doc, 'CNPJ', input.tenantDocument);
    }
    row(doc, 'Plano', input.planName);
    row(doc, 'Emissão', brDate(input.issuedAt));
    row(doc, 'Pagamento', input.paidAt ? brDate(input.paidAt) : '—');
    row(doc, 'Fatura', input.invoiceId);
    if (input.externalId) {
      row(doc, 'Cobrança no gateway', input.externalId);
    }

    doc.moveDown(1.2);
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(MUTED)
      .text(
        'Documento gerado pelo BarberVP. Não substitui nota fiscal.',
        MARGIN,
        doc.y,
        { width: CONTENT },
      );

    doc.end();
  });
}

function row(doc: InstanceType<typeof PDFDocument>, label: string, value: string): void {
  const y = doc.y;
  doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(label, MARGIN, y, { width: 180 });
  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor(INK)
    .text(value, MARGIN + 180, y, { width: CONTENT - 180 });
  doc.moveDown(0.35);
  doc
    .moveTo(MARGIN, doc.y)
    .lineTo(MARGIN + CONTENT, doc.y)
    .lineWidth(0.5)
    .strokeColor(RULE)
    .stroke();
  doc.moveDown(0.5);
}

function brDate(date: Date): string {
  return date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function filenameFor(input: InvoicePdfInput): string {
  const slug = input.tenantName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const stamp = input.issuedAt.toISOString().slice(0, 10);
  return `fatura-${slug || 'barbervp'}-${stamp}.pdf`;
}
