'use client';

import { useEffect, useState } from 'react';
import { Button, Input, Modal, useToast } from '@barbervp/ui';
import { useSaveUnitMutation } from '@/lib/dashboard/api/settings';

export function UnitModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const save = useSaveUnitMutation();

  useEffect(() => {
    if (!open) return;
    setName('');
    setAddress('');
    setPhone('');
  }, [open]);

  const canSubmit = name.trim().length > 1;

  const submit = async () => {
    if (!canSubmit) return;
    try {
      await save.mutateAsync({ dto: { name: name.trim(), address: address.trim() || undefined, phone: phone.trim() || undefined } });
      toast({ message: 'Unidade criada.', tone: 'success' });
      onClose();
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Não foi possível criar a unidade.', tone: 'danger' });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nova unidade"
      footer={
        <Button fullWidth loading={save.isPending} disabled={!canSubmit} onClick={() => void submit()}>
          Criar unidade
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Input label="Nome" value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Endereço" value={address} onChange={(e) => setAddress(e.target.value)} />
        <Input label="Telefone" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
    </Modal>
  );
}
