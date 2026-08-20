'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AuthClient, OtpChallenge } from '@barbervp/types';
import { IconButton, Modal, ArrowLeftIcon, useToast } from '@barbervp/ui';
import { LoginScreen } from './login-screen';
import { RegisterScreen } from './register-screen';
import { OtpScreen } from './otp-screen';
import { RecoverRequestScreen } from './recover-request-screen';
import { NewPasswordScreen } from './new-password-screen';
import { SuccessScreen } from './success-screen';

export type ClienteAuthMode = 'login' | 'registro';

type Screen =
  | 'login'
  | 'registro'
  | 'otp'
  | 'recuperar-request'
  | 'recuperar-newpass'
  | 'sucesso';

/** O que o desafio de OTP está servindo — decide o destino da verificação. */
export type OtpContext = 'registro' | 'recuperar';

export interface ClienteAuthSheetProps {
  open: boolean;
  onClose: () => void;
  /** Tela inicial. O wizard de agendamento abre em `login`. */
  initialMode?: ClienteAuthMode;
  /** Disparado quando a sessão passa a existir (login ou cadastro concluído). */
  onAuthSuccess?: (client: AuthClient) => void;
}

const TITLES: Record<Screen, string> = {
  login: 'Entrar',
  registro: 'Criar conta',
  otp: 'Verificar',
  'recuperar-request': 'Recuperar senha',
  'recuperar-newpass': 'Nova senha',
  sucesso: '',
};

/**
 * `ClienteAuth` — o sheet de autenticação do cliente final.
 *
 * É **componente**, não página: o wizard de agendamento (fase 04) e a página
 * pública da barbearia abrem o MESMO sheet, com `open`/`onClose`/`onAuthSuccess`.
 * Por isso ele não navega nem conhece rota nenhuma — só avisa quem o abriu.
 *
 * Seis telas internas, as do protótipo: login · registro · OTP · recuperação ·
 * nova senha · sucesso. O `Modal` de `packages/ui` já resolve a responsividade
 * (bottom-sheet < 768px, modal centrado acima), o foco preso, o ESC e o scroll
 * lock — aqui cuidamos só do fluxo.
 */
export function ClienteAuthSheet({
  open,
  onClose,
  initialMode = 'login',
  onAuthSuccess,
}: ClienteAuthSheetProps) {
  const { toast } = useToast();
  const [screen, setScreen] = useState<Screen>(initialMode);
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  const [otpContext, setOtpContext] = useState<OtpContext>('registro');
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [prefillIdentifier, setPrefillIdentifier] = useState('');
  const [newClient, setNewClient] = useState<AuthClient | null>(null);

  // Reabrir o sheet recomeça do zero — nada de resquício da sessão anterior.
  useEffect(() => {
    if (open) {
      setScreen(initialMode);
      setChallenge(null);
      setResetToken(null);
      setNewClient(null);
    }
  }, [open, initialMode]);

  const finish = useCallback(
    (client: AuthClient) => {
      onAuthSuccess?.(client);
      onClose();
    },
    [onAuthSuccess, onClose],
  );

  const goBack = () => {
    switch (screen) {
      case 'registro':
        setScreen('login');
        break;
      case 'otp':
        setScreen(otpContext === 'registro' ? 'registro' : 'recuperar-request');
        break;
      case 'recuperar-request':
        setScreen('login');
        break;
      case 'recuperar-newpass':
        setScreen('recuperar-request');
        break;
      default:
        break;
    }
  };

  const showBack = screen !== 'login' && screen !== 'sucesso';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={screen === 'sucesso' ? undefined : TITLES[screen]}
      aria-label={screen === 'sucesso' ? 'Conta criada' : TITLES[screen]}
      hideCloseButton={screen === 'sucesso'}
      // No meio do cadastro um clique no fundo perderia tudo o que foi digitado.
      dismissOnOverlayClick={screen === 'login'}
      headerAction={
        showBack ? (
          <IconButton aria-label="Voltar" onClick={goBack}>
            <ArrowLeftIcon size={18} />
          </IconButton>
        ) : undefined
      }
    >
      {screen === 'login' && (
        <LoginScreen
          initialIdentifier={prefillIdentifier}
          onAuthenticated={finish}
          onGoToRegister={() => setScreen('registro')}
          onForgotPassword={(identifier) => {
            setPrefillIdentifier(identifier);
            setScreen('recuperar-request');
          }}
          onGoogle={() => toast({ message: 'Em breve' })}
        />
      )}

      {screen === 'registro' && (
        <RegisterScreen
          onChallenge={(next, identifier) => {
            setChallenge(next);
            setOtpContext('registro');
            setPrefillIdentifier(identifier);
            setScreen('otp');
          }}
          onGoToLogin={(identifier) => {
            if (identifier) setPrefillIdentifier(identifier);
            setScreen('login');
          }}
        />
      )}

      {screen === 'otp' && challenge && (
        <OtpScreen
          challenge={challenge}
          context={otpContext}
          onChangeDestination={goBack}
          onChallengeRefreshed={setChallenge}
          onVerified={(result) => {
            if (result.kind === 'session') {
              setNewClient(result.session.client);
              // No cadastro a conta acabou de nascer: comemora antes de fechar.
              setScreen(otpContext === 'registro' ? 'sucesso' : 'login');
              if (otpContext !== 'registro') finish(result.session.client);
              return;
            }
            setResetToken(result.resetToken);
            setScreen('recuperar-newpass');
          }}
        />
      )}

      {screen === 'recuperar-request' && (
        <RecoverRequestScreen
          initialIdentifier={prefillIdentifier}
          onChallenge={(next, identifier) => {
            setChallenge(next);
            setOtpContext('recuperar');
            setPrefillIdentifier(identifier);
            setScreen('otp');
          }}
        />
      )}

      {screen === 'recuperar-newpass' && resetToken && (
        <NewPasswordScreen
          resetToken={resetToken}
          onDone={() => {
            toast({ message: 'Senha alterada com sucesso', tone: 'success' });
            setScreen('login');
          }}
        />
      )}

      {screen === 'sucesso' && newClient && (
        <SuccessScreen client={newClient} onContinue={() => finish(newClient)} onClose={() => finish(newClient)} />
      )}
    </Modal>
  );
}
