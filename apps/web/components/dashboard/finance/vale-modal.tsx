'use client';

import { useEffect, useState } from 'react';
import { Button, Input, Modal, Select, useToast } from '@barbervp/ui';
import type { BarberListItem } from '@barbervp/types';
import { useCreateValeMutation } from '@/lib/dashboard/api/commissions';
import { financeErrorMessage, inputToCents, todayInput } from './finance-shared';

export interface ValeModalProps {
  open: boolean;
  onClose: () => void;
  barbers: BarberListItem[];
}

/** `modalNovoVale` (`Dashboard.dc.html` l.4066). */
export function ValeModal({ open, onClose, barbers }: ValeModalProps) {
  const { toast } = useToast();
  // Só quem está na ativa recebe vale — um barbeiro desligado no seletor é
  // lançamento errado esperando acontecer.
  const options = barbers.filter((barber) => barber.active);

  const [barberId, setBarberId] = useState('');
  const [date, setDate] = useState(todayInput());
  const [amountInput, setAmountInput] = useState('');
  const [reason, setReason] = useState('');
  const create = useCreateValeMutation();

  useEffect(() => {
    if (!open) return;
    setBarberId(options[0]?.id ?? '');
    setDate(todayInput());
    setAmountInput('');
    setReason('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const amountCents = inputToCents(amountInput);
  const canSubmit = barberId !== '' && amountCents > 0 && date !== '';

  async function submit() {
    if (!canSubmit) return;
    try {
      await create.mutateAsync({
        barberId,
        amountCents,
        date,
        description: reason.trim() || null,
      });
      toast({ message: 'Vale registrado.', tone: 'success' });
      onClose();
    } catch (error) {
      toast({
        message: financeErrorMessage(error, 'Não foi possível registrar o vale.'),
        tone: 'danger',
      });
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Novo vale"
      footer={
        <div className="flex justify-end gap-2.5">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={create.isPending} disabled={!canSubmit} onClick={() => void submit()}>
            Salvar
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3.5">
        {options.length === 0 ? (
          <p className="rounded-control border border-border bg-surface-2 px-3.5 py-3 text-[13px] text-fg-muted">
            Nenhum funcionário ativo na equipe — cadastre um antes de lançar vales.
          </p>
        ) : (
          <Select
            label="Funcionário"
            value={barberId}
            onChange={(event) => setBarberId(event.target.value)}
            options={options.map((barber) => ({ value: barber.id, label: barber.name }))}
          />
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Data" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          <Input
            label="Valor"
            placeholder="0,00"
            inputMode="decimal"
            addonLeft={<span className="text-sm font-medium text-fg-muted">R$</span>}
            value={amountInput}
            onChange={(event) => setAmountInput(event.target.value)}
          />
        </div>

        <Input
          label="Motivo"
          placeholder="ex.: adiantamento quinzenal"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />

        <p className="rounded-control border border-gold/35 bg-gold/10 px-3 py-2.5 text-xs text-gold">
          Este valor será deduzido automaticamente na tela de Comissões.
        </p>
      </div>
    </Modal>
  );
}
