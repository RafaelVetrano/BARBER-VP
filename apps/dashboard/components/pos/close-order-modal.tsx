'use client';

import { useEffect, useState } from 'react';
import { Button, Input, Modal, useToast } from '@barbervp/ui';
import { formatBRL, parseBRLToCents } from '@barbervp/types';
import type { OrderDetail, PaymentMethod } from '@barbervp/types';
import { useCloseOrderMutation } from '../../lib/api/pos';

const METHODS: Array<{ value: PaymentMethod; label: string }> = [
  { value: 'PIX', label: 'Pix' },
  { value: 'CASH', label: 'Dinheiro' },
  { value: 'DEBIT', label: 'Débito' },
  { value: 'CREDIT', label: 'Crédito' },
];

export interface CloseOrderModalProps {
  open: boolean;
  onClose: () => void;
  order: OrderDetail;
  onClosed: () => void;
}

/**
 * Fechar comanda — split entre Pix/Dinheiro/Débito/Crédito ("Dividir" do
 * protótipo é só ter mais de uma linha preenchida). A soma tem que bater
 * com o total EXATO — o backend valida de novo dentro da transação.
 */
export function CloseOrderModal({ open, onClose, order, onClosed }: CloseOrderModalProps) {
  const { toast } = useToast();
  const [amounts, setAmounts] = useState<Record<PaymentMethod, string>>({
    PIX: '',
    CASH: '',
    DEBIT: '',
    CREDIT: '',
    SUBSCRIPTION: '',
    LOYALTY: '',
  });
  const close = useCloseOrderMutation(order.id);

  useEffect(() => {
    if (!open) return;
    setAmounts({ PIX: '', CASH: '', DEBIT: '', CREDIT: '', SUBSCRIPTION: '', LOYALTY: '' });
  }, [open, order.id]);

  const parsed = METHODS.map((method) => ({
    method: method.value,
    amountCents: amounts[method.value].trim() ? parseBRLToCentsSafe(amounts[method.value]) : 0,
  })).filter((entry) => entry.amountCents > 0);

  const sum = parsed.reduce((total, entry) => total + entry.amountCents, 0);
  const remaining = order.totalCents - sum;
  const canSubmit = parsed.length > 0 && remaining === 0;

  const fillRemaining = (method: PaymentMethod) => {
    setAmounts((current) => ({ ...current, [method]: (order.totalCents / 100).toFixed(2).replace('.', ',') }));
  };

  const submit = async () => {
    if (!canSubmit) return;
    try {
      await close.mutateAsync({ payments: parsed });
      toast({ message: `Comanda #${order.number} fechada.`, tone: 'success' });
      onClosed();
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Não foi possível fechar a comanda.', tone: 'danger' });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Fechar comanda"
      footer={
        <div className="flex w-full flex-col gap-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-fg-muted">Falta alocar</span>
            <span className={remaining === 0 ? 'font-semibold text-success' : 'font-semibold text-danger'}>
              {formatBRL(Math.max(0, remaining))}
            </span>
          </div>
          <Button fullWidth loading={close.isPending} disabled={!canSubmit} onClick={() => void submit()}>
            Finalizar — {formatBRL(order.totalCents)}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-fg-muted">
          Total da comanda <span className="font-semibold text-fg">{formatBRL(order.totalCents)}</span>. Divida entre
          uma ou mais formas de pagamento.
        </p>
        {METHODS.map((method) => (
          <div key={method.value} className="flex items-end gap-2">
            <Input
              label={method.label}
              placeholder="0,00"
              inputMode="decimal"
              value={amounts[method.value]}
              onChange={(event) => setAmounts((current) => ({ ...current, [method.value]: event.target.value }))}
            />
            <Button variant="outline" size="sm" onClick={() => fillRemaining(method.value)}>
              Tudo
            </Button>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function parseBRLToCentsSafe(input: string): number {
  try {
    return parseBRLToCents(input);
  } catch {
    return 0;
  }
}
