'use client';

import { useEffect, useState } from 'react';
import { Button, Input, Modal, useToast } from '@barbervp/ui';
import { useSaveUnitMutation } from '@/lib/dashboard/api/settings';

/**
 * "Nova unidade" (`Dashboard.dc.html` l.2596–2620): dois campos, Nome
 * obrigatório e Endereço, e os botões Cancelar/Criar unidade.
 *
 * Sem campo de telefone: o protótipo não o desenha e a tabela não o mostra.
 * `Unit.phone` continua no schema (e no `UpsertUnitDto`) para o dia em que a
 * tela pedir — o que não se faz é acrescentar um campo que ninguém lê.
 */
export function UnitModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const save = useSaveUnitMutation();

  useEffect(() => {
    if (!open) return;
    setName('');
    setAddress('');
  }, [open]);

  const canSubmit = name.trim().length > 1;

  const submit = async () => {
    if (!canSubmit) return;
    try {
      await save.mutateAsync({ dto: { name: name.trim(), address: address.trim() || null } });
      toast({ message: 'Unidade criada.', tone: 'success' });
      onClose();
    } catch (error) {
      toast({
        message: error instanceof Error ? error.message : 'Não foi possível criar a unidade.',
        tone: 'danger',
      });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nova unidade"
      footer={
        <div className="flex w-full justify-end gap-2.5">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={save.isPending} disabled={!canSubmit} onClick={() => void submit()}>
            Criar unidade
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Input label="Nome" required value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Endereço" value={address} onChange={(e) => setAddress(e.target.value)} />
      </div>
    </Modal>
  );
}
