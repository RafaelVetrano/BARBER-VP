'use client';

import { useState } from 'react';
import { Button, Modal, Textarea, useToast } from '@barbervp/ui';
import { formatBRL } from '@barbervp/types';
import type { OrderListItem } from '@barbervp/types';
import { useReopenOrderMutation } from '@/lib/dashboard/api/pos';
import { posErrorMessage } from './pos-shared';

const MIN_REASON = 3;

export interface ReopenOrderModalProps {
  order: OrderListItem;
  onClose: () => void;
  onReopened: (orderId: string) => void;
}

/**
 * Reabertura de comanda — `POST /orders/:id/reopen`, só `OWNER`/`MANAGER`.
 *
 * O motivo é obrigatório porque a rota grava `AuditLog`: reabrir desfaz
 * pagamento, baixa de estoque e comissão já lançada, e um registro sem
 * justificativa não explica o buraco no caixa do dia seguinte.
 */
export function ReopenOrderModal({ order, onClose, onReopened }: ReopenOrderModalProps) {
  const { toast } = useToast();
  const reopen = useReopenOrderMutation();
  const [reason, setReason] = useState('');

  const submit = async () => {
    if (reason.trim().length < MIN_REASON) return;
    try {
      const reopened = await reopen.mutateAsync({ id: order.id, dto: { reason: reason.trim() } });
      onReopened(reopened.id);
    } catch (error) {
      toast({ message: posErrorMessage(error, 'Não foi possível reabrir a comanda.'), tone: 'danger' });
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Reabrir comanda #${order.number}`}
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            loading={reopen.isPending}
            disabled={reason.trim().length < MIN_REASON}
            onClick={() => void submit()}
          >
            Reabrir comanda
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-[13px] leading-relaxed text-fg-muted">
          A comanda de <span className="font-semibold text-fg">{order.clientName ?? 'cliente avulso'}</span>,
          fechada em <span className="font-semibold text-fg">{formatBRL(order.totalCents)}</span>, volta a
          aceitar itens. Os pagamentos lançados são desfeitos e precisam ser refeitos no novo fechamento.
        </p>
        <Textarea
          label="Motivo"
          hint="Fica no registro de auditoria da barbearia."
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>
    </Modal>
  );
}
