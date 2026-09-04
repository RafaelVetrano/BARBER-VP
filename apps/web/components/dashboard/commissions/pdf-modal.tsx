'use client';

import { Button, Modal, useToast } from '@barbervp/ui';
import { formatBRL } from '@barbervp/types';
import type { CommissionBarberSummary, CommissionPeriodResponse } from '@barbervp/types';
import { useCommissionReportMutation } from '@/lib/dashboard/api/commissions';
import { dayLabel, percentLabel, periodTitle, ruleChipLabel } from './commissions-shared';

export interface PdfModalProps {
  open: boolean;
  onClose: () => void;
  barber: CommissionBarberSummary | null;
  period: CommissionPeriodResponse | undefined;
  timezone: string;
}

/**
 * `modalPdfOpen` (`Dashboard.dc.html` l.4228) — a folha do relatório.
 *
 * O protótipo desenha uma prévia em papel (fundo claro, tinta escura) DENTRO
 * do painel escuro, e é isso que está aqui: as cores deste bloco são fixas de
 * propósito e não vêm dos tokens do tema, porque o que ele representa é o
 * arquivo, não a tela. O PDF de verdade é montado no servidor a partir do
 * mesmo extrato, e "Baixar PDF" o busca autenticado.
 */
export function PdfModal({ open, onClose, barber, period, timezone }: PdfModalProps) {
  const { toast } = useToast();
  const download = useCommissionReportMutation();

  const baixar = async () => {
    if (!barber || !period) return;
    try {
      await download.mutateAsync({
        barberId: barber.barberId,
        type: period.type,
        ...(period.type === 'WEEKLY' ? { anchor: period.start } : { month: period.month }),
      });
    } catch (error) {
      toast({
        message: error instanceof Error ? error.message : 'Não foi possível gerar o PDF.',
        tone: 'danger',
      });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      aria-label="Relatório de comissão"
      hideCloseButton
      bodyClassName="p-0"
      className="md:w-[560px]"
      footer={
        <div className="flex justify-end gap-2.5">
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
          <Button loading={download.isPending} disabled={!barber} onClick={() => void baixar()}>
            Baixar PDF
          </Button>
        </div>
      }
    >
      <div className="bg-[#F2F3F5] p-6 text-[#1A1D22] md:p-8">
        {/* ── Cabeçalho da folha ────────────────────────────────────────── */}
        <div className="flex items-center gap-3.5 border-b-2 border-[#1A1D22] pb-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-[10px] bg-[repeating-linear-gradient(45deg,#D6D9DE,#D6D9DE_4px,#E9EBEE_4px,#E9EBEE_8px)] font-mono text-[9px] font-semibold text-[#8A8F98]">
            LOGO
          </span>
          <div className="min-w-0">
            <p className="font-display text-lg font-bold">Relatório de Comissão</p>
            <p className="text-[13px] text-[#5B616B]">
              Período {period ? periodTitle(period) : '—'}
            </p>
          </div>
        </div>

        {barber && (
          <>
            <div className="mt-5">
              <p className="text-[15px] font-semibold">{barber.barberName}</p>
              <p className="mt-0.5 text-[13px] text-[#5B616B]">Regra aplicada: {ruleChipLabel(barber)}</p>
            </div>

            {/* ── Extrato ──────────────────────────────────────────────── */}
            <div className="mt-5 overflow-x-auto">
              {barber.extrato.length === 0 ? (
                <p className="text-[13px] text-[#5B616B]">Nenhum atendimento no período.</p>
              ) : (
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-[#C9CDD4]">
                      <th className="py-1.5 pr-2 text-[11px] font-semibold text-[#5B616B]">Data</th>
                      <th className="py-1.5 pr-2 text-[11px] font-semibold text-[#5B616B]">Cliente</th>
                      <th className="py-1.5 pr-2 text-[11px] font-semibold text-[#5B616B]">Serviço</th>
                      <th className="py-1.5 pr-2 text-right text-[11px] font-semibold text-[#5B616B]">Valor</th>
                      <th className="py-1.5 text-right text-[11px] font-semibold text-[#5B616B]">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {barber.extrato.map((entry, index) => (
                      <tr key={index} className="border-b border-[#E3E5E9]">
                        <td className="whitespace-nowrap py-1.5 pr-2 text-xs">{dayLabel(entry.date, timezone)}</td>
                        <td className="py-1.5 pr-2 text-xs font-medium">{entry.clientName}</td>
                        <td className="py-1.5 pr-2 text-xs text-[#5B616B]">{entry.itemName}</td>
                        <td className="whitespace-nowrap py-1.5 pr-2 text-right text-xs font-medium tabular-nums">
                          {formatBRL(entry.baseCents)}
                        </td>
                        <td className="whitespace-nowrap py-1.5 text-right text-xs font-semibold tabular-nums">
                          {percentLabel(entry.percentBps)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* ── Totais ───────────────────────────────────────────────── */}
            <dl className="mt-5 flex flex-col gap-1.5 rounded-[10px] bg-[#E9EBEE] px-4 py-3.5">
              <ReportLine label="Comissão serviços" value={formatBRL(barber.comissaoServicosCents)} />
              <ReportLine label="Comissão produtos" value={formatBRL(barber.comissaoProdutosCents)} />
              <ReportLine
                label={barber.deductVales ? '(−) Vales' : '(−) Vales (não descontados nesta regra)'}
                value={formatBRL(barber.valeCents)}
                className="text-[#B03A3A]"
              />
              <div className="mt-0.5 flex justify-between gap-3 border-t border-[#C9CDD4] pt-2 font-display text-base font-bold">
                <dt>Total a receber</dt>
                <dd className="tabular-nums">{formatBRL(barber.totalCents)}</dd>
              </div>
            </dl>
          </>
        )}
      </div>
    </Modal>
  );
}

function ReportLine({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={`flex justify-between gap-3 text-[13px] ${className ?? ''}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
