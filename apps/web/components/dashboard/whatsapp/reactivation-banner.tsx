'use client';

import { useState } from 'react';
import { Button, LockIcon, Modal, Skeleton, useToast } from '@barbervp/ui';
import type { WhatsappReactivationSummary } from '@barbervp/types';
import { BlockError } from '@/components/dashboard/blocks';
import { useSendWhatsappReactivationMutation } from '@/lib/dashboard/api/whatsapp';
import { isFeatureGateError } from '@/lib/dashboard/feature-error';
import { WhatsappBubble } from './whatsapp-bubble';

/**
 * Faixa dourada de reativação — protótipo l.1687–1691 — e o modal "Enviar
 * reativação em massa" (l.4318–4333).
 *
 * A janela ("há 30+ dias") NÃO é fixa: é a mesma da automação de reativação
 * logo acima. Trocar o `<select>` para 45 dias muda a contagem daqui.
 *
 * Some por inteiro quando não há ninguém inativo — o protótipo desenha a faixa
 * como um alerta, e alerta de "0 clientes" é ruído.
 */
export function ReactivationBanner({
  summary,
  isLoading,
  isError,
  onRetry,
  onLockedAttempt,
}: {
  summary: WhatsappReactivationSummary | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onLockedAttempt: () => void;
}) {
  const { toast } = useToast();
  const send = useSendWhatsappReactivationMutation();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isLoading) {
    return <Skeleton className="h-[74px] rounded-xl" />;
  }
  if (isError) {
    return (
      <div className="rounded-xl border border-border bg-surface p-5">
        <BlockError label="os clientes inativos" onRetry={onRetry} />
      </div>
    );
  }
  if (!summary || summary.clientCount === 0) {
    return null;
  }

  const confirm = async () => {
    setError(null);
    try {
      const result = await send.mutateAsync();
      setConfirmOpen(false);
      toast({
        message:
          result.skipped > 0
            ? `${result.queued} mensagens enviadas · ${result.skipped} recusaram receber.`
            : `${result.queued} mensagens enviadas.`,
        tone: 'success',
      });
    } catch (cause) {
      setError(
        isFeatureGateError(cause)
          ? 'A reativação em massa faz parte do WhatsApp completo.'
          : 'Não foi possível enviar as mensagens. Tente de novo.',
      );
    }
  };

  const label = `${summary.clientCount} ${
    summary.clientCount === 1 ? 'cliente inativo' : 'clientes inativos'
  } há ${summary.inactiveDays}+ dias`;

  return (
    <>
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gold bg-gold/10 px-5 py-4">
        <span className="text-[13px] font-medium text-fg">{label}</span>
        <Button
          onClick={() => (summary.locked ? onLockedAttempt() : setConfirmOpen(true))}
          className={summary.locked ? 'opacity-50' : undefined}
        >
          {summary.locked && <LockIcon size={14} />}
          Enviar mensagem de reativação agora
        </Button>
      </section>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Enviar reativação em massa"
        footer={
          <div className="flex justify-end gap-2.5">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button loading={send.isPending} onClick={() => void confirm()}>
              Enviar agora
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-[13px] text-fg-muted">
            Esta mensagem será enviada para{' '}
            <strong className="text-fg">
              {summary.clientCount - summary.optedOutCount}
              {summary.clientCount - summary.optedOutCount === 1 ? ' cliente' : ' clientes'}
            </strong>{' '}
            sem visita há {summary.inactiveDays}+ dias.
            {summary.optedOutCount > 0 &&
              ` ${summary.optedOutCount} ${
                summary.optedOutCount === 1 ? 'desligou' : 'desligaram'
              } o aviso por WhatsApp e não ${summary.optedOutCount === 1 ? 'recebe' : 'recebem'}.`}
          </p>
          <WhatsappBubble text={summary.preview} />
          {error && (
            <p role="alert" className="text-[13px] text-danger">
              {error}
            </p>
          )}
        </div>
      </Modal>
    </>
  );
}
