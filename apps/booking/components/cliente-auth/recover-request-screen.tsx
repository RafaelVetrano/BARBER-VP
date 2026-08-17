'use client';

import { useState } from 'react';
import type { OtpChallenge } from '@barbervp/types';
import { Button, Input, authErrorMessage, clientApi, useClientAuth } from '@barbervp/ui';

export interface RecoverRequestScreenProps {
  initialIdentifier?: string;
  onChallenge: (challenge: OtpChallenge, identifier: string) => void;
}

/**
 * Pedido de recuperação — reusa o mesmo desafio OTP do cadastro, como no
 * protótipo.
 *
 * A resposta é sempre a mesma, exista a conta ou não: a API abre um desafio de
 * fachada para destinos desconhecidos (sem enviar nada a ninguém), então a tela
 * não vira um oráculo de "quem tem conta aqui".
 */
export function RecoverRequestScreen({
  initialIdentifier = '',
  onChallenge,
}: RecoverRequestScreenProps) {
  const { api } = useClientAuth();
  const [identifier, setIdentifier] = useState(initialIdentifier);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!identifier.trim() || loading) return;

    setLoading(true);
    setError(null);
    try {
      const challenge = await clientApi.forgotPassword(api, identifier.trim());
      onChallenge(challenge, identifier.trim());
    } catch (caught) {
      setError(authErrorMessage(caught, 'Não foi possível enviar o código.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <p className="text-sm leading-relaxed text-fg-muted">
        Informe o telefone ou e-mail da sua conta para receber um código de recuperação.
      </p>

      <Input
        label="Telefone ou e-mail"
        value={identifier}
        onChange={(event) => {
          setIdentifier(event.target.value);
          setError(null);
        }}
        placeholder="(16) 9 9999-9999 ou voce@email.com"
        autoComplete="username"
        autoFocus
        error={error ?? undefined}
      />

      <Button
        type="submit"
        size="lg"
        fullWidth
        disabled={!identifier.trim()}
        loading={loading}
        loadingText="Enviando…"
      >
        Enviar código de recuperação
      </Button>
    </form>
  );
}
