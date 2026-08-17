'use client';

import { useEffect, useState } from 'react';
import { Button, Input, Modal, Select, useToast } from '@barbervp/ui';
import { ACCOUNT_PAYABLE_CATEGORIES, ACCOUNT_RECEIVABLE_CATEGORIES, parseBRLToCents } from '@barbervp/types';
import { useCreatePayableMutation, useCreateReceivableMutation } from '../../lib/api/finance';

export interface AccountModalProps {
  open: boolean;
  onClose: () => void;
  kind: 'payable' | 'receivable';
  bankAccounts: Array<{ id: string; name: string }>;
}

const today = () => new Date().toISOString().slice(0, 10);

export function AccountModal({ open, onClose, kind, bankAccounts }: AccountModalProps) {
  const { toast } = useToast();
  const categories = kind === 'payable' ? ACCOUNT_PAYABLE_CATEGORIES : ACCOUNT_RECEIVABLE_CATEGORIES;

  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>(categories[0]);
  const [party, setParty] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [dueDate, setDueDate] = useState(today());
  const [installments, setInstallments] = useState('1');
  const [bankAccountId, setBankAccountId] = useState('');

  useEffect(() => {
    if (!open) return;
    setDescription('');
    setCategory(categories[0]);
    setParty('');
    setAmountInput('');
    setDueDate(today());
    setInstallments('1');
    setBankAccountId(bankAccounts[0]?.id ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kind]);

  const createPayable = useCreatePayableMutation();
  const createReceivable = useCreateReceivableMutation();
  const pending = createPayable.isPending || createReceivable.isPending;

  const canSubmit = description.trim().length > 1 && amountInput.trim().length > 0 && dueDate;

  const submit = async () => {
    if (!canSubmit) return;
    try {
      const amountCents = parseBRLToCents(amountInput);
      const shared = {
        description: description.trim(),
        amountCents,
        dueDate,
        installments: Number(installments) || 1,
        bankAccountId: bankAccountId || undefined,
      };
      if (kind === 'payable') {
        await createPayable.mutateAsync({ ...shared, category: category as never, supplier: party.trim() || undefined });
      } else {
        await createReceivable.mutateAsync({ ...shared, category: category as never, customer: party.trim() || undefined });
      }
      toast({ message: 'Conta criada.', tone: 'success' });
      onClose();
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Não foi possível criar a conta.', tone: 'danger' });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={kind === 'payable' ? 'Nova conta a pagar' : 'Nova conta a receber'}
      footer={
        <Button fullWidth loading={pending} disabled={!canSubmit} onClick={() => void submit()}>
          Salvar
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Input label="Descrição" value={description} onChange={(e) => setDescription(e.target.value)} />
        <Select
          label="Categoria"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          options={categories.map((c) => ({ value: c, label: c }))}
        />
        <Input
          label={kind === 'payable' ? 'Fornecedor (opcional)' : 'Cliente (opcional)'}
          value={party}
          onChange={(e) => setParty(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Valor" placeholder="0,00" inputMode="decimal" value={amountInput} onChange={(e) => setAmountInput(e.target.value)} />
          <Input label="Vencimento" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <Input label="Parcelas" type="number" min={1} value={installments} onChange={(e) => setInstallments(e.target.value)} />
        {bankAccounts.length > 0 && (
          <Select
            label={kind === 'payable' ? 'Conta de saída' : 'Conta de entrada'}
            value={bankAccountId}
            onChange={(e) => setBankAccountId(e.target.value)}
            options={bankAccounts.map((b) => ({ value: b.id, label: b.name }))}
          />
        )}
      </div>
    </Modal>
  );
}
