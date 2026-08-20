'use client';

import { useEffect, useState } from 'react';
import { Button, Input, Modal, Select, useToast } from '@barbervp/ui';
import { parseBRLToCents } from '@barbervp/types';
import { useCreateValeMutation } from '@/lib/dashboard/api/commissions';

export interface ValeModalProps {
  open: boolean;
  onClose: () => void;
  barbers: Array<{ id: string; name: string }>;
}

const today = () => new Date().toISOString().slice(0, 10);

export function ValeModal({ open, onClose, barbers }: ValeModalProps) {
  const { toast } = useToast();
  const [barberId, setBarberId] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [date, setDate] = useState(today());
  const [description, setDescription] = useState('');
  const create = useCreateValeMutation();

  useEffect(() => {
    if (!open) return;
    setBarberId(barbers[0]?.id ?? '');
    setAmountInput('');
    setDate(today());
    setDescription('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const canSubmit = barberId && amountInput.trim().length > 0;

  const submit = async () => {
    if (!canSubmit) return;
    try {
      await create.mutateAsync({ barberId, amountCents: parseBRLToCents(amountInput), date, description: description.trim() || undefined });
      toast({ message: 'Vale registrado.', tone: 'success' });
      onClose();
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Não foi possível registrar o vale.', tone: 'danger' });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Novo vale"
      footer={
        <Button fullWidth loading={create.isPending} disabled={!canSubmit} onClick={() => void submit()}>
          Registrar vale
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Select label="Funcionário" value={barberId} onChange={(e) => setBarberId(e.target.value)} options={barbers.map((b) => ({ value: b.id, label: b.name }))} />
        <Input label="Valor" placeholder="0,00" inputMode="decimal" value={amountInput} onChange={(e) => setAmountInput(e.target.value)} />
        <Input label="Data" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <Input label="Motivo (opcional)" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
    </Modal>
  );
}
