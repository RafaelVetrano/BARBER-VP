'use client';

import { useState } from 'react';
import { Badge, Button, Card, CardHeader, Input, Modal, useToast } from '@barbervp/ui';
import { formatBRL, parseBRLToCents } from '@barbervp/types';
import { useCashRegisterQuery, useCloseCashMutation, useOpenCashMutation } from '@/lib/dashboard/api/finance';

export function CashRegisterCard() {
  const { toast } = useToast();
  const statusQuery = useCashRegisterQuery();
  const openCash = useOpenCashMutation();
  const closeCash = useCloseCashMutation();
  const [openModal, setOpenModal] = useState<'open' | 'close' | null>(null);
  const [amountInput, setAmountInput] = useState('');

  const status = statusQuery.data;

  const submitOpen = async () => {
    try {
      await openCash.mutateAsync({ openingCents: parseBRLToCents(amountInput || '0') });
      toast({ message: 'Caixa aberto.', tone: 'success' });
      setOpenModal(null);
      setAmountInput('');
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Não foi possível abrir o caixa.', tone: 'danger' });
    }
  };

  const submitClose = async () => {
    try {
      const closed = await closeCash.mutateAsync({ countedCents: parseBRLToCents(amountInput || '0') });
      const diff = closed.register?.differenceCents ?? 0;
      toast({
        message: diff === 0 ? 'Caixa fechado — sem diferença.' : `Caixa fechado — diferença de ${formatBRL(diff)}.`,
        tone: diff === 0 ? 'success' : 'warning',
      });
      setOpenModal(null);
      setAmountInput('');
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Não foi possível fechar o caixa.', tone: 'danger' });
    }
  };

  return (
    <Card>
      <CardHeader
        title="Caixa"
        description={status?.open ? 'Aberto desde ' + new Date(status.register!.openedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'Fechado'}
        action={<Badge tone={status?.open ? 'success' : 'neutral'}>{status?.open ? 'Aberto' : 'Fechado'}</Badge>}
      />

      {status?.open && status.register ? (
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-fg-muted">Saldo inicial</span>
            <span className="font-semibold text-fg">{formatBRL(status.register.openingCents)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-fg-muted">Saldo atual</span>
            <span className="font-semibold text-fg">{formatBRL(status.register.currentCents)}</span>
          </div>
          <Button variant="outline" onClick={() => setOpenModal('close')}>
            Fechar caixa
          </Button>
        </div>
      ) : (
        <Button className="mt-4" onClick={() => setOpenModal('open')}>
          Abrir caixa
        </Button>
      )}

      <Modal
        open={openModal === 'open'}
        onClose={() => setOpenModal(null)}
        title="Abrir caixa"
        footer={
          <Button fullWidth loading={openCash.isPending} onClick={() => void submitOpen()}>
            Abrir com este saldo
          </Button>
        }
      >
        <Input label="Saldo inicial" placeholder="0,00" inputMode="decimal" value={amountInput} onChange={(e) => setAmountInput(e.target.value)} />
      </Modal>

      <Modal
        open={openModal === 'close'}
        onClose={() => setOpenModal(null)}
        title="Fechar caixa"
        footer={
          <Button fullWidth loading={closeCash.isPending} onClick={() => void submitClose()}>
            Confirmar fechamento
          </Button>
        }
      >
        <Input label="Valor conferido em caixa" placeholder="0,00" inputMode="decimal" value={amountInput} onChange={(e) => setAmountInput(e.target.value)} />
      </Modal>
    </Card>
  );
}
