'use client';

import { useEffect, useState } from 'react';
import { Button, Checkbox, Input, Modal, useToast } from '@barbervp/ui';
import { useCreateRaffleMutation } from '../../lib/api/loyalty';

export interface RaffleModalProps {
  open: boolean;
  onClose: () => void;
}

const in30Days = () => new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

export function RaffleModal({ open, onClose }: RaffleModalProps) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [prize, setPrize] = useState('');
  const [endsAt, setEndsAt] = useState(in30Days());
  const [pointsPerEntry, setPointsPerEntry] = useState('10');
  const [notifyWhatsapp, setNotifyWhatsapp] = useState(true);
  const create = useCreateRaffleMutation();

  useEffect(() => {
    if (!open) return;
    setName('');
    setPrize('');
    setEndsAt(in30Days());
    setPointsPerEntry('10');
    setNotifyWhatsapp(true);
  }, [open]);

  const canSubmit = name.trim().length > 1 && prize.trim().length > 1;

  const submit = async () => {
    if (!canSubmit) return;
    try {
      await create.mutateAsync({
        name: name.trim(),
        prize: prize.trim(),
        endsAt: new Date(`${endsAt}T23:59:59.000Z`).toISOString(),
        pointsPerEntry: Number(pointsPerEntry) || 10,
        notifyWhatsapp,
      });
      toast({ message: 'Sorteio criado.', tone: 'success' });
      onClose();
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Não foi possível criar o sorteio.', tone: 'danger' });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Novo sorteio"
      footer={
        <Button fullWidth loading={create.isPending} disabled={!canSubmit} onClick={() => void submit()}>
          Criar sorteio
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Input label="Nome do sorteio" value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Prêmio" value={prize} onChange={(e) => setPrize(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Encerra em" type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          <Input label="Pontos por cupom" type="number" min={1} value={pointsPerEntry} onChange={(e) => setPointsPerEntry(e.target.value)} />
        </div>
        <label className="flex cursor-pointer items-center gap-2.5">
          <Checkbox checked={notifyWhatsapp} onChange={(e) => setNotifyWhatsapp(e.target.checked)} />
          <span className="text-sm text-fg">Avisar clientes por WhatsApp</span>
        </label>
      </div>
    </Modal>
  );
}
