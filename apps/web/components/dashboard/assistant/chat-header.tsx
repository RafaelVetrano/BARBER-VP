'use client';

import { useState } from 'react';
import { Button, Modal, MoreIcon, useToast } from '@barbervp/ui';
import { useClearAiChatMutation } from '@/lib/dashboard/api/assistant';
import { NavalhaMark } from './chat-message';

/**
 * Header fixo de 64px (protótipo l.2821–2836): selo, nome, "online" e o botão
 * de ícone à direita.
 *
 * No protótipo esse botão não faz nada. Aqui ele é "limpar conversa" — a única
 * ação de manutenção que a tela tem — porque botão sem função não passa na
 * regra 2. A confirmação existe porque a conversa não volta.
 */
export function ChatHeader() {
  const { toast } = useToast();
  const clear = useClearAiChatMutation();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const confirm = async () => {
    try {
      await clear.mutateAsync();
      setConfirmOpen(false);
      toast({ message: 'Conversa limpa.', tone: 'success' });
    } catch {
      toast({ message: 'Não foi possível limpar a conversa.', tone: 'danger' });
    }
  };

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border px-4 md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <NavalhaMark size={36} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="truncate font-display text-base font-bold text-fg">Navalha — seu assistente</h1>
          <p className="flex items-center gap-1.5 text-xs font-medium text-fg-muted">
            <span className="size-[7px] rounded-full bg-success" aria-hidden="true" />
            online
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        title="Limpar conversa"
        aria-label="Limpar conversa"
        className="flex size-11 shrink-0 items-center justify-center rounded-[9px] text-fg-muted transition-colors hover:bg-surface hover:text-fg md:size-9"
      >
        <MoreIcon size={18} />
      </button>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Limpar conversa"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button loading={clear.isPending} onClick={() => void confirm()}>
              Limpar
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg-muted">
          O histórico sai da tela e não volta. As mensagens já enviadas continuam contando para a cota
          do mês — limpar a conversa não devolve mensagens do plano.
        </p>
      </Modal>
    </header>
  );
}
