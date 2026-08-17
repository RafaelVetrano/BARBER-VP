'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { isEmail, normalizeMobilePhone, type EmailCheckResult } from '@barbervp/types';
import {
  AlertCircleIcon,
  Button,
  Checkbox,
  Input,
  PasswordInput,
  authErrorMessage,
  establishmentApi,
  maskPhoneInput,
  useEstablishmentAuth,
} from '@barbervp/ui';
import { DASHBOARD_URL } from '../../lib/urls';
import { LinkAccountCard } from './link-account-card';
import { SignupSuccess } from './signup-success';

const schema = z.object({
  name: z.string().trim().min(3, 'Informe seu nome completo.'),
  phone: z
    .string()
    .refine((value) => normalizeMobilePhone(value) !== null, 'Celular inválido — DDD e 9 dígitos.'),
  email: z.string().trim().min(1, 'Informe seu e-mail.').email('E-mail inválido.'),
  password: z
    .string()
    .min(8, 'Mínimo 8 caracteres, com letra e número.')
    .regex(/[A-Za-z]/, 'Mínimo 8 caracteres, com letra e número.')
    .regex(/\d/, 'Mínimo 8 caracteres, com letra e número.'),
  shopName: z.string().trim().min(2, 'Informe o nome da barbearia.'),
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: 'É preciso aceitar os termos.' }),
  }),
});

type SignupValues = z.infer<typeof schema>;

/** Espera o usuário parar de digitar antes de consultar o e-mail. */
const EMAIL_CHECK_DEBOUNCE_MS = 450;

/**
 * Cadastro de barbearia (`BarberVP Cadastro Estabelecimento.dc.html`).
 *
 * Reproduz os três estados que o protótipo dá ao campo de e-mail:
 *
 * · **livre** — segue o cadastro normal;
 * · **já é estabelecimento** — erro "Já existe um cadastro com este e-mail";
 * · **já é cliente** — abre o card "Que bom te ver de novo!", que pede a senha
 *   atual e vincula a MESMA conta à barbearia nova, sem duplicar cadastro.
 *
 * A checagem vem da API (`/auth/check-email`), não de um array no cliente: os
 * `ESTABLISHMENTS`/`CLIENTS` do protótipo eram mock, aqui é o banco.
 */
export function SignupForm() {
  const { client, adopt } = useEstablishmentAuth();
  const [emailState, setEmailState] = useState<EmailCheckResult | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [linkedShop, setLinkedShop] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<SignupValues>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      name: '',
      phone: '',
      email: '',
      password: '',
      shopName: '',
      acceptTerms: undefined as unknown as true,
    },
  });

  const email = watch('email');
  const shopName = watch('shopName');
  const acceptTerms = watch('acceptTerms');

  // Consulta o estado do e-mail enquanto se digita, com debounce.
  useEffect(() => {
    const trimmed = email.trim().toLowerCase();
    if (!isEmail(trimmed)) {
      setEmailState(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      void establishmentApi
        .checkEmail(client, trimmed)
        .then((result) => {
          if (!cancelled) setEmailState(result);
        })
        .catch(() => {
          // Falha de rede não pode travar o cadastro: o servidor valida de novo
          // no submit, que é onde a decisão realmente importa.
          if (!cancelled) setEmailState(null);
        });
    }, EMAIL_CHECK_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [email, client]);

  const goToDashboard = useCallback(() => {
    window.location.assign(`${DASHBOARD_URL}/configurar`);
  }, []);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      adopt(await establishmentApi.register(client, values));
      goToDashboard();
    } catch (error) {
      setFormError(authErrorMessage(error, 'Não foi possível criar sua conta. Tente novamente.'));
    }
  });

  const useAnotherEmail = () => {
    setValue('email', '');
    setEmailState(null);
    setFocus('email');
  };

  if (linkedShop) {
    return <SignupSuccess shopName={linkedShop} onContinue={goToDashboard} />;
  }

  const isEstablishment = emailState?.status === 'establishment';
  const isClientLink = emailState?.status === 'client';

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {/* Nome e celular saem de cena no vínculo: já vêm da conta existente. */}
      {!isClientLink && (
        <>
          <Input
            label="Nome completo"
            autoComplete="name"
            placeholder="Como você se chama"
            error={errors.name?.message}
            success={!errors.name && watch('name').trim().length >= 3}
            {...register('name')}
          />

          <Input
            label="Celular"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            placeholder="(00) 0 0000-0000"
            error={errors.phone?.message}
            success={!errors.phone && normalizeMobilePhone(watch('phone')) !== null}
            {...register('phone', {
              onChange: (event) => {
                event.target.value = maskPhoneInput(event.target.value);
              },
            })}
          />
        </>
      )}

      <Input
        label="E-mail"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="voce@email.com"
        error={
          errors.email?.message ??
          (isEstablishment ? 'Ops! Já existe um cadastro com este e-mail.' : undefined)
        }
        success={!errors.email && !isEstablishment && !isClientLink && isEmail(email)}
        {...register('email')}
      />

      {isClientLink && emailState.account && (
        <LinkAccountCard
          account={emailState.account}
          email={email.trim().toLowerCase()}
          shopName={shopName}
          acceptTerms={acceptTerms === true}
          onLinked={(session) => {
            adopt(session);
            setLinkedShop(shopName.trim() || 'sua barbearia');
          }}
          onUseAnotherEmail={useAnotherEmail}
        />
      )}

      {!isClientLink && (
        <PasswordInput
          label="Senha"
          autoComplete="new-password"
          placeholder="mínimo 8 caracteres"
          showStrength
          error={errors.password?.message}
          value={watch('password')}
          {...register('password')}
        />
      )}

      <Input
        label="Nome da barbearia"
        placeholder="Ex: Studio Navalha"
        error={errors.shopName?.message}
        success={!errors.shopName && shopName.trim().length >= 2}
        {...register('shopName')}
      />

      <Checkbox
        label={
          <>
            Li e aceito os{' '}
            <Link href="/termos" className="font-semibold text-gold hover:underline">
              termos de uso
            </Link>{' '}
            e a{' '}
            <Link href="/privacidade" className="font-semibold text-gold hover:underline">
              política de privacidade
            </Link>
          </>
        }
        error={errors.acceptTerms?.message}
        {...register('acceptTerms')}
      />

      {formError && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-control border border-danger bg-danger/10 px-3 py-2.5 text-[13px] text-fg"
        >
          <AlertCircleIcon size={16} className="mt-px shrink-0 text-danger" />
          {formError}
        </p>
      )}

      {!isClientLink && (
        <>
          <Button
            type="submit"
            size="lg"
            fullWidth
            loading={isSubmitting}
            loadingText="Criando sua conta…"
            disabled={isEstablishment}
          >
            Criar minha conta grátis
          </Button>

          <p className="text-center text-[11.5px] font-semibold text-success">
            7 dias grátis · sem cartão de crédito
          </p>
          {isEstablishment && (
            <p className="text-center text-[11.5px] font-medium text-fg-subtle">
              Use outro e-mail para continuar
              {' · '}
              <button
                type="button"
                onClick={useAnotherEmail}
                className="font-semibold text-gold hover:underline"
              >
                trocar
              </button>
            </p>
          )}
        </>
      )}

      <div className="flex flex-col items-center gap-2.5 pt-2">
        <p className="text-[13.5px] font-medium text-fg-muted">
          Já tem uma conta?{' '}
          <Link href="/entrar" className="font-semibold text-gold hover:text-gold-hover">
            Entrar aqui
          </Link>
        </p>
      </div>
    </form>
  );
}
