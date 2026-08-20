'use client';

import { useState } from 'react';
import { isPasswordValid } from '@barbervp/types';
import { Button, PasswordInput, authErrorMessage, clientApi, useClientAuth } from '@barbervp/ui';

export interface NewPasswordScreenProps {
  /** Token de uso único devolvido pela verificação do OTP de recuperação. */
  resetToken: string;
  onDone: () => void;
}

/** Última etapa da recuperação: define a senha nova. */
export function NewPasswordScreen({ resetToken, onDone }: NewPasswordScreenProps) {
  const { api } = useClientAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [touched, setTouched] = useState({ password: false, confirm: false });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const passwordValid = isPasswordValid(password);
  const confirmValid = confirmPassword.length > 0 && confirmPassword === password;
  const canSubmit = passwordValid && confirmValid && !loading;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setTouched({ password: true, confirm: true });
    if (!canSubmit) return;

    setLoading(true);
    setError(null);
    try {
      await clientApi.resetPassword(api, { resetToken, password, confirmPassword });
      onDone();
    } catch (caught) {
      setError(authErrorMessage(caught, 'Não foi possível salvar a nova senha.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <PasswordInput
        label="Nova senha"
        showStrength
        value={password}
        onChange={(event) => {
          setPassword(event.target.value);
          setError(null);
        }}
        onBlur={() => setTouched((current) => ({ ...current, password: true }))}
        placeholder="mínimo 8 caracteres"
        autoComplete="new-password"
        autoFocus
        error={
          touched.password && !passwordValid ? 'Mínimo 8 caracteres, com letra e número' : undefined
        }
      />

      <PasswordInput
        label="Confirmar nova senha"
        value={confirmPassword}
        onChange={(event) => {
          setConfirmPassword(event.target.value);
          setError(null);
        }}
        onBlur={() => setTouched((current) => ({ ...current, confirm: true }))}
        placeholder="repita a senha"
        autoComplete="new-password"
        error={touched.confirm && !confirmValid ? 'As senhas não coincidem' : undefined}
      />

      {error && (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      )}

      <Button
        type="submit"
        size="lg"
        fullWidth
        disabled={!canSubmit}
        loading={loading}
        loadingText="Salvando…"
      >
        Salvar nova senha
      </Button>
    </form>
  );
}
