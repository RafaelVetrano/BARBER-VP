'use client';

import { useEffect, useState } from 'react';
import type { OtpChallenge, OtpVerifyResult } from '@barbervp/types';
import {
  Button,
  OtpInput,
  authErrorMessage,
  clientApi,
  useClientAuth,
  useToast,
} from '@barbervp/ui';
import { useResendCountdown } from './use-resend-countdown';
import type { OtpContext } from './cliente-auth-sheet';

export interface OtpScreenProps {
  challenge: OtpChallenge;
  context: OtpContext;
  onChangeDestination: () => void;
  onChallengeRefreshed: (challenge: OtpChallenge) => void;
  onVerified: (result: OtpVerifyResult) => void;
}

/**
 * Verificação do código de 6 dígitos.
 *
 * Traz o comportamento inteiro do protótipo: avanço automático entre caixas
 * (do `OtpInput` do design system), shake no erro, contador de 59s no reenvio e
 * a opção "receber por chamada". O destino aparece mascarado — a API nunca
 * devolve o telefone completo aqui.
 */
export function OtpScreen({
  challenge,
  context,
  onChangeDestination,
  onChallengeRefreshed,
  onVerified,
}: OtpScreenProps) {
  const { api, adopt } = useClientAuth();
  const { toast } = useToast();
  const countdown = useResendCountdown();

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    countdown.start(challenge.resendInSeconds);
    // Um cooldown por desafio: reiniciar a cada render zeraria o contador.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challenge.challengeId]);

  const verify = async (value: string = code) => {
    if (value.length !== 6 || verifying) return;

    setVerifying(true);
    setError(null);
    try {
      const result = await clientApi.verifyOtp(api, {
        challengeId: challenge.challengeId,
        code: value,
      });
      if (result.kind === 'session') {
        adopt(result.session);
      }
      onVerified(result);
    } catch (caught) {
      setError(authErrorMessage(caught, 'Código inválido. Tente novamente.'));
      setCode('');
    } finally {
      setVerifying(false);
    }
  };

  const resend = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await clientApi.resendOtp(api, { challengeId: challenge.challengeId });
      onChallengeRefreshed(next);
      countdown.start(next.resendInSeconds);
      setCode('');
      toast({ message: 'Código reenviado', tone: 'success' });
    } catch (caught) {
      toast({ message: authErrorMessage(caught, 'Não foi possível reenviar.'), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  const requestCall = async () => {
    setBusy(true);
    try {
      const next = await clientApi.requestCall(api, challenge.challengeId);
      onChallengeRefreshed(next);
      countdown.start(next.resendInSeconds);
      toast({ message: 'Vamos ligar para você em instantes' });
    } catch (caught) {
      toast({ message: authErrorMessage(caught, 'Não foi possível solicitar a chamada.'), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 pt-3">
      <span
        aria-hidden="true"
        className="grid size-16 place-items-center rounded-full bg-gold/15 text-2xl"
      >
        ✉️
      </span>

      <h3 className="text-center font-display text-xl font-bold text-fg">
        {context === 'registro' ? 'Confirme seu telefone' : 'Verifique seu acesso'}
      </h3>

      <p className="text-center text-sm leading-relaxed text-fg-muted">
        Enviamos um código de 6 dígitos para {challenge.destinationMasked}{' '}
        <button type="button" onClick={onChangeDestination} className="text-gold hover:underline">
          alterar
        </button>
      </p>

      <OtpInput
        value={code}
        onChange={(next) => {
          setCode(next);
          setError(null);
        }}
        onComplete={(next) => void verify(next)}
        error={error}
        autoFocus
      />

      {countdown.canResend ? (
        <button
          type="button"
          onClick={() => void resend()}
          disabled={busy}
          className="text-[13px] text-gold hover:underline disabled:opacity-50"
        >
          Reenviar código
        </button>
      ) : (
        <p className="text-[13px] text-fg-muted" aria-live="polite">
          Reenviar código em {countdown.label}
        </p>
      )}

      <button
        type="button"
        onClick={() => void requestCall()}
        disabled={busy}
        className="text-[13px] text-fg-muted underline hover:text-fg disabled:opacity-50"
      >
        Receber por chamada
      </button>

      <Button
        onClick={() => void verify()}
        size="lg"
        fullWidth
        disabled={code.length !== 6}
        loading={verifying}
        loadingText="Verificando…"
        className="mt-2"
      >
        Verificar
      </Button>
    </div>
  );
}
