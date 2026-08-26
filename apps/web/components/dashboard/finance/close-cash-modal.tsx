'use client';

import { useEffect, useState } from 'react';
import { Button, Input, Modal, cn, useToast } from '@barbervp/ui';
import { formatBRL } from '@barbervp/types';
import type { CashRegisterSummary } from '@barbervp/types';
import { useCloseCashMutation } from '@/lib/dashboard/api/finance';
import { financeErrorMessage, inputToCents, methodLabel } from './finance-shared';

export interface CloseCashModalProps {
  open: boolean;
  register: CashRegisterSummary;
  onClose: () => void;
}

/**
 * `modalFecharCaixa` (`Dashboard.dc.html` l.3876).
 *
 * A faixa de diferença aparece assim que o campo tem conteúdo e muda de cor
 * conforme o resultado — verde "Caixa confere", âmbar "Sobra de caixa",
 * vermelho "Quebra de caixa". A conta é contra o DINHEIRO esperado, não contra
 * o total do dia: Pix e cartão não estão na gaveta que o operador conta.
 */
export function CloseCashModal({ open, register, onClose }: CloseCashModalProps) {
  const { toast } = useToast();
  const [countedInput, setCountedInput] = useState('');
  const closeCash = useCloseCashMutation();

  useEffect(() => {
    if (open) setCountedInput('');
  }, [open]);

  const touched = countedInput.trim() !== '';
  const countedCents = inputToCents(countedInput);
  const differenceCents = countedCents - register.expectedCashCents;
  const matches = differenceCents === 0;

  const tone = matches
    ? { text: 'text-success', bg: 'bg-success/10', border: 'border-success/35' }
    : differenceCents > 0
      ? { text: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/35' }
      : { text: 'text-danger', bg: 'bg-danger/10', border: 'border-danger/35' };

  async function submit() {
    try {
      const result = await closeCash.mutateAsync({ countedCents });
      const difference = result.register?.differenceCents ?? 0;
      toast({
        message:
          difference === 0
            ? 'Caixa fechado — sem diferença.'
            : `Caixa fechado — diferença de ${formatBRL(difference)}.`,
        tone: difference === 0 ? 'success' : 'warning',
      });
      onClose();
    } catch (error) {
      toast({
        message: financeErrorMessage(error, 'Não foi possível fechar o caixa.'),
        tone: 'danger',
      });
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Fechar caixa"
      footer={
        <div className="flex justify-end gap-2.5">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={closeCash.isPending} disabled={!touched} onClick={() => void submit()}>
            Confirmar fechamento
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <p className="mb-2 text-[13px] font-medium text-fg-muted">Resumo por forma de pagamento</p>
          {register.byMethod.length === 0 ? (
            <p className="text-[13px] text-fg-muted">Nenhuma venda registrada neste caixa.</p>
          ) : (
            <dl className="flex flex-col gap-1.5">
              {register.byMethod.map((entry) => (
                <div key={entry.method} className="flex justify-between text-[13px]">
                  <dt className="text-fg-muted">{methodLabel(entry.method)}</dt>
                  <dd className="font-semibold tabular-nums text-fg">{formatBRL(entry.amountCents)}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        <Input
          label="Valor conferido em dinheiro"
          placeholder="0,00"
          inputMode="decimal"
          addonLeft={<span className="text-sm font-medium text-fg-muted">R$</span>}
          hint={`Esperado na gaveta: ${formatBRL(register.expectedCashCents)}`}
          value={countedInput}
          onChange={(event) => setCountedInput(event.target.value)}
        />

        {touched && (
          <div
            className={cn(
              'flex items-center justify-between rounded-control border px-3.5 py-3',
              tone.bg,
              tone.border,
            )}
          >
            <span className={cn('text-[13px] font-medium', tone.text)}>
              {matches ? 'Caixa confere' : differenceCents > 0 ? 'Sobra de caixa' : 'Quebra de caixa'}
            </span>
            <span className={cn('font-display text-sm font-bold tabular-nums', tone.text)}>
              {differenceCents > 0 ? '+' : differenceCents < 0 ? '-' : ''}
              {formatBRL(Math.abs(differenceCents))}
            </span>
          </div>
        )}
      </div>
    </Modal>
  );
}
