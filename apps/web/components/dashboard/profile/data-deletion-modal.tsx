'use client';

import { Button, Modal, useToast } from '@barbervp/ui';
import { useRequestDataDeletionMutation } from '@/lib/dashboard/api/profile';

/**
 * "Solicitar exclusão dos meus dados" (`DashboardFuncionario.dc.html` l.1212).
 *
 * Quem não é dono da barbearia não apaga a barbearia — o pedido vai para quem
 * responde pelo tratamento desses dados. No protótipo isso terminava num
 * toast; aqui o `POST` manda e-mail a todos os donos e grava a trilha.
 */
export function DataDeletionModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const request = useRequestDataDeletionMutation();

  const submit = async () => {
    try {
      await request.mutateAsync();
      toast({ message: 'Solicitação enviada ao administrador.', tone: 'success' });
      onClose();
    } catch (error) {
      toast({
        message: error instanceof Error ? error.message : 'Não foi possível enviar a solicitação.',
        tone: 'danger',
      });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Solicitar exclusão dos meus dados"
      footer={
        <div className="flex w-full gap-2.5">
          <Button variant="outline" fullWidth onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" fullWidth loading={request.isPending} onClick={() => void submit()}>
            Enviar solicitação
          </Button>
        </div>
      }
    >
      <p className="text-[13px] leading-relaxed text-fg-muted">
        Sua solicitação será enviada ao administrador da barbearia, responsável pelo tratamento dos
        seus dados. Dados vinculados a obrigações legais (comissões, registros fiscais) podem ser
        mantidos pelo prazo exigido por lei.
      </p>
    </Modal>
  );
}
