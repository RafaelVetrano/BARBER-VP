'use client';

import { useState } from 'react';
import { ErrorCode, isEmail, normalizeMobilePhone, type OtpChallenge } from '@barbervp/types';
import {
  Button,
  Checkbox,
  Input,
  PasswordInput,
  authErrorCode,
  authErrorMessage,
  clientApi,
  maskPhoneInput,
  useClientAuth,
} from '@barbervp/ui';

export interface RegisterScreenProps {
  onChallenge: (challenge: OtpChallenge, identifier: string) => void;
  onGoToLogin: (identifier?: string) => void;
}

interface Fields {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  confirmEmail: string;
  password: string;
  confirmPassword: string;
}

const EMPTY: Fields = {
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  confirmEmail: '',
  password: '',
  confirmPassword: '',
};

type Touched = Partial<Record<keyof Fields, boolean>>;

/**
 * Cadastro do cliente — todas as validações do protótipo, campo a campo.
 *
 * Ponto importante do fluxo: enviar este formulário **não cria a conta**. A API
 * valida, guarda o cadastro pendente e dispara o OTP; a conta só nasce quando o
 * código é confirmado. Assim ninguém ocupa o telefone de outra pessoa — e o
 * telefone é a identidade do cliente na plataforma.
 */
export function RegisterScreen({ onChallenge, onGoToLogin }: RegisterScreenProps) {
  const { api } = useClientAuth();
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [touched, setTouched] = useState<Touched>({});
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(true);
  const [duplicate, setDuplicate] = useState<'phone' | 'email' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (key: keyof Fields, value: string) => {
    setFields((current) => ({ ...current, [key]: value }));
    setDuplicate(null);
    setError(null);
  };
  const touch = (key: keyof Fields) => setTouched((current) => ({ ...current, [key]: true }));

  const valid = {
    firstName: fields.firstName.trim().length >= 2,
    lastName: fields.lastName.trim().length >= 2,
    phone: normalizeMobilePhone(fields.phone) !== null,
    email: isEmail(fields.email),
    confirmEmail: isEmail(fields.email) && fields.confirmEmail === fields.email,
    password:
      fields.password.length >= 8 && /[A-Za-z]/.test(fields.password) && /\d/.test(fields.password),
    confirmPassword: fields.confirmPassword.length > 0 && fields.confirmPassword === fields.password,
  };

  const errorFor = (key: keyof Fields, message: string) =>
    touched[key] && !valid[key] ? message : undefined;

  const canSubmit = Object.values(valid).every(Boolean) && acceptTerms && !loading;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setTouched({
      firstName: true,
      lastName: true,
      phone: true,
      email: true,
      confirmEmail: true,
      password: true,
      confirmPassword: true,
    });
    if (!canSubmit) return;

    setLoading(true);
    setError(null);
    try {
      const challenge = await clientApi.register(api, {
        firstName: fields.firstName.trim(),
        lastName: fields.lastName.trim(),
        phone: fields.phone,
        email: fields.email.trim().toLowerCase(),
        confirmEmail: fields.confirmEmail.trim().toLowerCase(),
        password: fields.password,
        confirmPassword: fields.confirmPassword,
        acceptTerms: true,
        marketingOptIn,
      });
      onChallenge(challenge, fields.phone);
    } catch (caught) {
      const code = authErrorCode(caught);
      if (code === ErrorCode.PHONE_IN_USE) {
        setDuplicate('phone');
      } else if (code === ErrorCode.EMAIL_IN_USE) {
        setDuplicate('email');
      } else {
        setError(authErrorMessage(caught, 'Não foi possível criar sua conta.'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          label="Nome"
          required
          value={fields.firstName}
          onChange={(event) => set('firstName', event.target.value)}
          onBlur={() => touch('firstName')}
          placeholder="Seu nome"
          autoComplete="given-name"
          success={touched.firstName && valid.firstName}
          error={errorFor('firstName', 'Mínimo 2 caracteres')}
        />
        <Input
          label="Sobrenome"
          required
          value={fields.lastName}
          onChange={(event) => set('lastName', event.target.value)}
          onBlur={() => touch('lastName')}
          placeholder="Seu sobrenome"
          autoComplete="family-name"
          success={touched.lastName && valid.lastName}
          error={errorFor('lastName', 'Mínimo 2 caracteres')}
        />
      </div>

      <Input
        label="Telefone (WhatsApp)"
        required
        value={fields.phone}
        onChange={(event) => set('phone', maskPhoneInput(event.target.value))}
        onBlur={() => touch('phone')}
        placeholder="(16) 9 9999-9999"
        inputMode="numeric"
        autoComplete="tel"
        success={touched.phone && valid.phone}
        error={errorFor('phone', 'Número incompleto')}
      />

      <Input
        label="E-mail"
        required
        type="email"
        value={fields.email}
        onChange={(event) => set('email', event.target.value)}
        onBlur={() => touch('email')}
        placeholder="voce@email.com"
        autoComplete="email"
        success={touched.email && valid.email}
        error={errorFor('email', 'E-mail inválido')}
      />

      <Input
        label="Confirmar e-mail"
        required
        type="email"
        value={fields.confirmEmail}
        onChange={(event) => set('confirmEmail', event.target.value)}
        onBlur={() => touch('confirmEmail')}
        // Colar aqui derrotaria o propósito de conferir o e-mail digitado.
        onPaste={(event) => event.preventDefault()}
        placeholder="repita o e-mail"
        autoComplete="off"
        success={touched.confirmEmail && valid.confirmEmail}
        error={errorFor('confirmEmail', 'Os e-mails não coincidem')}
      />

      <PasswordInput
        label="Senha"
        required
        showStrength
        value={fields.password}
        onChange={(event) => set('password', event.target.value)}
        onBlur={() => touch('password')}
        placeholder="mínimo 8 caracteres"
        autoComplete="new-password"
        error={errorFor('password', 'Mínimo 8 caracteres, com letra e número')}
      />

      <PasswordInput
        label="Confirmar senha"
        required
        value={fields.confirmPassword}
        onChange={(event) => set('confirmPassword', event.target.value)}
        onBlur={() => touch('confirmPassword')}
        placeholder="repita a senha"
        autoComplete="new-password"
        error={errorFor('confirmPassword', 'As senhas não coincidem')}
      />

      {duplicate && (
        <div
          role="alert"
          className="flex flex-col gap-1 rounded-control border border-danger bg-danger/10 px-3 py-2.5 text-[13px] text-fg"
        >
          <span>
            {duplicate === 'phone'
              ? 'Este telefone já possui conta.'
              : 'Este e-mail já possui conta.'}
          </span>
          <button
            type="button"
            onClick={() => onGoToLogin(duplicate === 'phone' ? fields.phone : fields.email)}
            className="self-start font-semibold text-gold hover:text-gold-hover"
          >
            Entrar
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      )}

      <Checkbox
        checked={acceptTerms}
        onChange={(event) => setAcceptTerms(event.target.checked)}
        label={
          <>
            Li e aceito os{' '}
            <a href="/termos" className="text-gold hover:underline">
              Termos de uso
            </a>{' '}
            e a{' '}
            <a href="/privacidade" className="text-gold hover:underline">
              Política de privacidade
            </a>
          </>
        }
      />

      <Checkbox
        checked={marketingOptIn}
        onChange={(event) => setMarketingOptIn(event.target.checked)}
        label="Quero receber lembretes e promoções pelo WhatsApp"
      />

      <Button
        type="submit"
        size="lg"
        fullWidth
        disabled={!canSubmit}
        loading={loading}
        loadingText="Criando conta…"
      >
        Criar conta
      </Button>

      <p className="text-center text-sm text-fg-muted">
        Já tem conta?{' '}
        <button
          type="button"
          onClick={() => onGoToLogin()}
          className="font-semibold text-gold hover:text-gold-hover"
        >
          Entrar
        </button>
      </p>
    </form>
  );
}
