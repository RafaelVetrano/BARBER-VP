'use client';

import type { AuthClient } from '@barbervp/types';
import { Button, SuccessScreen as DesignSuccessScreen } from '@barbervp/ui';

export interface SuccessScreenProps {
  client: AuthClient;
  onContinue: () => void;
  onClose: () => void;
}

/**
 * "Conta criada! 🎉" — a confirmação do cadastro.
 *
 * Reusa o `SuccessScreen` do design system (fase 02), que já consolidou as
 * variações de sucesso do bundle: círculo dourado com `bvpSuccessPop` e check
 * desenhado com `bvpCheckDraw`. O protótipo fechava sozinho depois de 2,5s;
 * aqui quem fecha é o usuário — fechar sozinho tira a leitura de quem usa
 * leitor de tela e frustra quem só quis conferir o que aconteceu.
 */
export function SuccessScreen({ client, onContinue, onClose }: SuccessScreenProps) {
  const firstName = client.name.split(' ')[0] ?? '';

  return (
    <DesignSuccessScreen
      title="Conta criada! 🎉"
      subtitle={`Bem-vindo, ${firstName}. Agora é só escolher seu horário.`}
      actions={
        <>
          <Button size="lg" fullWidth onClick={onContinue}>
            Agendar horário
          </Button>
          <Button variant="ghost" fullWidth onClick={onClose}>
            Fechar
          </Button>
        </>
      }
    />
  );
}
