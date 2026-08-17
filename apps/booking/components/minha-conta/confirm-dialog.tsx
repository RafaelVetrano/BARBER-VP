'use client';

import { Button, Modal } from '@barbervp/ui';

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  confirmLabel: string;
  /** `primary` = ações neutras (pausar); `danger` = destrutivas (cancelar, excluir). */
  tone?: 'primary' | 'danger';
  busy?: boolean;
  onConfirm: () => void;
  /** Rótulo do botão de saída — "Manter agendamento", "Voltar", etc. */
  cancelLabel?: string;
}

/**
 * Confirmação genérica — os quatro bottom-sheets do protótipo (cancelar
 * agendamento, excluir conta, pausar assinatura, cancelar assinatura) tinham
 * a mesma estrutura com textos diferentes; aqui é UM componente.
 *
 * É um `Modal` dentro de outro `Modal` (a `MinhaConta`/`AssinaturaCliente`
 * continuam abertas atrás) — o mesmo empilhamento que o wizard já faz com o
 * `ClienteAuth`, e por isso `useScrollLock` conta aberturas em vez de só ligar/
 * desligar.
 */
export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  tone = 'primary',
  busy = false,
  onConfirm,
  cancelLabel = 'Cancelar',
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} dismissOnOverlayClick={!busy}>
      <div className="flex flex-col gap-5">
        <p className="text-sm leading-relaxed text-fg-muted">{description}</p>
        <div className="flex flex-col gap-2">
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} loading={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
