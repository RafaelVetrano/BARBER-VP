'use client';

import { useEffect, useState } from 'react';
import { Button, Input, Modal, useToast } from '@barbervp/ui';
import { parseBRLToCents } from '@barbervp/types';
import { useSaveBankAccountMutation } from '@/lib/dashboard/api/finance';

export interface BankAccountModalProps {
  open: boolean;
  onClose: () => void;
}

export function BankAccountModal({ open, onClose }: BankAccountModalProps) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [balanceInput, setBalanceInput] = useState('');
  const save = useSaveBankAccountMutation();

  useEffect(() => {
    if (!open) return;
    setName('');
    setType('');
    setBalanceInput('');
  }, [open]);

  const canSubmit = name.trim().length > 1;

  const submit = async () => {
    if (!canSubmit) return;
    try {
      await save.mutateAsync({
        dto: { name: name.trim(), bank: type.trim() || undefined, balanceCents: balanceInput ? parseBRLToCents(balanceInput) : 0 },
      });
      toast({ message: 'Conta bancária criada.', tone: 'success' });
      onClose();
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Não foi possível salvar.', tone: 'danger' });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nova conta bancária"
      footer={
        <Button fullWidth loading={save.isPending} disabled={!canSubmit} onClick={() => void submit()}>
          Salvar
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Input label="Nome" placeholder="ex.: Nubank PJ" value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Tipo" placeholder="ex.: Pix / Transferência / Cartão" value={type} onChange={(e) => setType(e.target.value)} />
        <Input label="Saldo inicial" placeholder="0,00" inputMode="decimal" value={balanceInput} onChange={(e) => setBalanceInput(e.target.value)} />
      </div>
    </Modal>
  );
}
