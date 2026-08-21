'use client';

import { useState } from 'react';
import type { AuthClient } from '@barbervp/types';
import {
  Button,
  Input,
  PasswordInput,
  authErrorMessage,
  clientApi,
  useClientAuth,
} from '@barbervp/ui';

export interface LoginScreenProps {
  initialIdentifier?: string;
  onAuthenticated: (client: AuthClient) => void;
  onGoToRegister: () => void;
  onForgotPassword: (identifier: string) => void;
  onGoogle: () => void;
}

/** Tela de login do cliente: um campo único para telefone OU e-mail. */
export function LoginScreen({
  initialIdentifier = '',
  onAuthenticated,
  onGoToRegister,
  onForgotPassword,
  onGoogle,
}: LoginScreenProps) {
  const { api, adopt } = useClientAuth();
  const [identifier, setIdentifier] = useState(initialIdentifier);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const disabled = !identifier.trim() || !password || loading;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (disabled) return;

    setLoading(true);
    setError(null);
    try {
      const session = await clientApi.login(api, { identifier: identifier.trim(), password });
      adopt(session);
      onAuthenticated(session.client);
    } catch (caught) {
      setError(authErrorMessage(caught, 'Telefone/e-mail ou senha incorretos'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Input
        label="Telefone ou e-mail"
        value={identifier}
        onChange={(event) => {
          setIdentifier(event.target.value);
          setError(null);
        }}
        placeholder="Insira seu telefone ou e-mail"
        autoComplete="username"
        autoFocus
      />

      <div className="flex flex-col gap-1.5">
        <PasswordInput
          label="Senha"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setError(null);
          }}
          placeholder="Sua senha"
          autoComplete="current-password"
          error={error ?? undefined}
        />
        <button
          type="button"
          onClick={() => onForgotPassword(identifier)}
          className="self-end text-[13px] text-gold hover:text-gold-hover"
        >
          Esqueci minha senha
        </button>
      </div>

      <Button type="submit" size="lg" fullWidth disabled={disabled} loading={loading} loadingText="Entrando…">
        Entrar
      </Button>

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-fg-muted">ou</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      {/*
        O protótipo já desenha o botão do Google, mas o OAuth fica para uma fase
        futura (adapter próprio). A interface existe e avisa "Em breve" — o que
        não pode existir é um botão que finge autenticar.
      */}
      <Button variant="outline" onClick={onGoogle} fullWidth>
        <span className="font-bold" aria-hidden="true">
          G
        </span>
        Continuar com Google
      </Button>

      <p className="text-center text-sm text-fg-muted">
        Não tem conta?{' '}
        <button
          type="button"
          onClick={onGoToRegister}
          className="font-semibold text-gold hover:text-gold-hover"
        >
          Criar conta
        </button>
      </p>
    </form>
  );
}
