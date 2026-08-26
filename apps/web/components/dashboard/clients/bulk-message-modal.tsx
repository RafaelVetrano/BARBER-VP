'use client';

import { useEffect, useState } from 'react';
import { Button, Modal, Textarea, useToast } from '@barbervp/ui';
import { useBulkMessageClientsMutation } from '@/lib/dashboard/api/clients';
import { clientsErrorMessage } from './clients-shared';

export interface BulkMessageModalProps {
  open: boolean;
  onClose: () => void;
  /** Ids de `ClientProfile` selecionados na tabela. */
  ids: string[];
  /** Chamado depois do envio — a aba limpa a seleção. */
  onSent?: () => void;
}

/**
 * Composição da mensagem em lote.
 *
 * O protótipo tem só o botão "Enviar mensagem" na barra de seleção, sem dizer
 * O QUE seria enviado. Um botão que dispara texto nenhum não é uma função
 * real (regra 2 da fase), então a composição virou este passo — mesmo
 * `{nome}` dos templates de WhatsApp da aba de automações.
 */
export function BulkMessageModal({ open, onClose, ids, onSent }: BulkMessageModalProps) {
  const { toast } = useToast();
  const send = useBulkMessageClientsMutation();
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setBody('');
    setError(null);
  }, [open]);

  const submit = async () => {
    if (body.trim().length < 2) {
      setError('Escreva a mensagem antes de enviar.');
      return;
    }
    setError(null);
    try {
      const result = await send.mutateAsync({ ids, body: body.trim() });
      toast({
        message:
          result.skipped > 0
            ? `${result.queued} mensagens enviadas · ${result.skipped} recusaram receber.`
            : `${result.queued} mensagens enviadas.`,
        tone: 'success',
      });
      onSent?.();
      onClose();
    } catch (cause) {
      setError(clientsErrorMessage(cause));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Enviar mensagem"
      footer={
        <div className="flex justify-end gap-2.5">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={send.isPending} onClick={() => void submit()}>
            Enviar
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3.5">
        <p className="text-[13px] text-fg-muted">
          {ids.length === 1 ? '1 cliente selecionado' : `${ids.length} clientes selecionados`}. Quem
          desligou o aviso de mensagens não recebe.
        </p>
        <Textarea
          label="Mensagem"
          rows={5}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Olá {nome}, temos horários livres nesta semana!"
          hint="Use {nome} para inserir o nome de cada cliente."
        />
        {error && (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
