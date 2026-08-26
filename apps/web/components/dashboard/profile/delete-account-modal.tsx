'use client';

import { useEffect, useState } from 'react';
import { Button, Input, Modal, useToast } from '@barbervp/ui';
import {
  ACCOUNT_DELETION_CONFIRM_WORD,
  ACCOUNT_DELETION_GRACE_DAYS,
  type MyProfile,
} from '@barbervp/types';
import { useRequestAccountDeletionMutation } from '@/lib/dashboard/api/profile';

/** Os quatro itens do passo 1 (`Dashboard.dc.html` l.3519–3522). */
const LOSSES = [
  'Dados da barbearia e unidades',
  'Equipe e comissões',
  'Agendamentos e histórico',
  'Configurações e integrações',
];

/**
 * `modalExcluirConta` (`Dashboard.dc.html` l.3511–3546) — dois passos no MESMO
 * diálogo: o aviso do que se perde e a confirmação digitada.
 *
 * O segundo passo não é cerimônia: "Excluir permanentemente" só acende quando
 * a palavra bate exatamente, e o servidor exige a mesma palavra — quem chamar
 * o endpoint por fora da tela também tem de digitá-la.
 */
export function DeleteAccountModal({
  open,
  onClose,
  onScheduled,
}: {
  open: boolean;
  onClose: () => void;
  onScheduled: (profile: MyProfile) => void;
}) {
  const { toast } = useToast();
  const [step, setStep] = useState<'aviso' | 'confirmar'>('aviso');
  const [confirmText, setConfirmText] = useState('');
  const request = useRequestAccountDeletionMutation();

  useEffect(() => {
    if (!open) return;
    setStep('aviso');
    setConfirmText('');
  }, [open]);

  const canDelete = confirmText === ACCOUNT_DELETION_CONFIRM_WORD;

  const submit = async () => {
    if (!canDelete) return;
    try {
      onScheduled(await request.mutateAsync(confirmText));
      onClose();
    } catch (error) {
      toast({
        message: error instanceof Error ? error.message : 'Não foi possível excluir a conta.',
        tone: 'danger',
      });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={step === 'aviso' ? 'Excluir sua conta e barbearia?' : 'Confirmação final'}
      // Fechar sem querer no meio de uma exclusão irreversível é o tipo de
      // acidente que este diálogo existe para evitar.
      dismissOnOverlayClick={false}
      footer={
        step === 'aviso' ? (
          <div className="flex w-full gap-2.5">
            <Button variant="outline" fullWidth onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="danger" fullWidth onClick={() => setStep('confirmar')}>
              Continuar
            </Button>
          </div>
        ) : (
          <div className="flex w-full gap-2.5">
            <Button variant="outline" fullWidth onClick={() => setStep('aviso')}>
              Voltar
            </Button>
            <Button
              variant="danger"
              fullWidth
              disabled={!canDelete}
              loading={request.isPending}
              onClick={() => void submit()}
            >
              Excluir permanentemente
            </Button>
          </div>
        )
      }
    >
      {step === 'aviso' ? (
        <div className="flex flex-col gap-4">
          <p className="text-[13px] text-fg-muted">Isso vai excluir permanentemente:</p>
          <ul className="flex flex-col gap-1.5">
            {LOSSES.map((item) => (
              <li key={item} className="flex items-center gap-2 text-[13px] text-fg">
                <span aria-hidden="true" className="text-danger">
                  ✕
                </span>
                {item}
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-2 rounded-control border border-border bg-bg px-3.5 py-3">
            <p className="text-xs text-fg-muted">
              Sua assinatura será cancelada imediatamente, sem reembolso proporcional.
            </p>
            <p className="text-xs text-fg-muted">
              Registros fiscais e financeiros serão mantidos pelo prazo exigido por lei, conforme a
              LGPD.
            </p>
            <p className="text-xs text-fg-muted">
              Você terá {ACCOUNT_DELETION_GRACE_DAYS} dias para reativar a conta antes da exclusão
              definitiva dos dados.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-[13px] text-fg-muted">
            Para confirmar, digite{' '}
            <strong className="font-semibold text-fg">{ACCOUNT_DELETION_CONFIRM_WORD}</strong> no
            campo abaixo
          </p>
          {/* Sem rótulo visível: o desenho põe a instrução acima do campo e
              deixa só o placeholder. O nome acessível vem do `aria-label`,
              senão o leitor de tela anuncia um campo de texto anônimo. */}
          <Input
            aria-label={`Digite ${ACCOUNT_DELETION_CONFIRM_WORD} para confirmar`}
            placeholder={ACCOUNT_DELETION_CONFIRM_WORD}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="[&_input]:tracking-[1px]"
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
          />
        </div>
      )}
    </Modal>
  );
}
