'use client';

import { useEffect, useState } from 'react';
import { Button, Input, Modal, Select, useToast } from '@barbervp/ui';
import {
  BANK_ACCOUNT_METHODS,
  CASH_ENTRY_CATEGORIES,
  CASH_EXIT_CATEGORIES,
  formatBRL,
} from '@barbervp/types';
import type { PaymentMethod } from '@barbervp/types';
import { useCreateCashMovementMutation } from '@/lib/dashboard/api/finance';
import { financeErrorMessage, inputToCents, methodLabel } from './finance-shared';

export interface CashMovementModalProps {
  open: boolean;
  direction: 'IN' | 'OUT';
  onClose: () => void;
}

/**
 * "+ Entrada avulsa" e "+ Saída/Sangria" (`Dashboard.dc.html` l.780).
 *
 * No protótipo os dois botões só disparavam um toast. Aqui gravam movimentação
 * de verdade: a categoria vem da lista da direção escolhida e o servidor é
 * quem inverte o sinal de uma saída.
 */
export function CashMovementModal({ open, direction, onClose }: CashMovementModalProps) {
  const { toast } = useToast();
  const outgoing = direction === 'OUT';
  const categories = outgoing ? CASH_EXIT_CATEGORIES : CASH_ENTRY_CATEGORIES;

  const [amountInput, setAmountInput] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>(categories[0]);
  const [method, setMethod] = useState<PaymentMethod>('CASH');

  const create = useCreateCashMovementMutation();

  useEffect(() => {
    if (!open) return;
    setAmountInput('');
    setDescription('');
    setCategory(categories[0]);
    setMethod('CASH');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, direction]);

  const amountCents = inputToCents(amountInput);
  const canSubmit = amountCents > 0 && description.trim().length > 1;

  async function submit() {
    if (!canSubmit) return;
    try {
      await create.mutateAsync({
        direction,
        amountCents,
        description: description.trim(),
        category,
        method,
      });
      toast({
        message: outgoing
          ? `Saída de ${formatBRL(amountCents)} registrada.`
          : `Entrada de ${formatBRL(amountCents)} registrada.`,
        tone: 'success',
      });
      onClose();
    } catch (error) {
      toast({
        message: financeErrorMessage(error, 'Não foi possível registrar a movimentação.'),
        tone: 'danger',
      });
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={outgoing ? 'Saída / sangria' : 'Entrada avulsa'}
      footer={
        <div className="flex justify-end gap-2.5">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={create.isPending} disabled={!canSubmit} onClick={() => void submit()}>
            Registrar
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Input
          label="Valor"
          placeholder="0,00"
          inputMode="decimal"
          addonLeft={<span className="text-sm font-medium text-fg-muted">R$</span>}
          value={amountInput}
          onChange={(event) => setAmountInput(event.target.value)}
        />
        <Input
          label="Descrição"
          placeholder={outgoing ? 'ex.: depósito bancário' : 'ex.: troco reposto'}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select
            label="Categoria"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            options={categories.map((item) => ({ value: item, label: item }))}
          />
          <Select
            label="Forma"
            hint={outgoing ? 'Só o dinheiro sai da gaveta' : 'Só o dinheiro entra na gaveta'}
            value={method}
            onChange={(event) => setMethod(event.target.value as PaymentMethod)}
            options={BANK_ACCOUNT_METHODS.map((item) => ({ value: item, label: methodLabel(item) }))}
          />
        </div>
      </div>
    </Modal>
  );
}
