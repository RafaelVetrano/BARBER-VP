'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  AlertCircleIcon,
  Button,
  CheckCircleIcon,
  Input,
  PasswordInput,
  authErrorMessage,
  establishmentApi,
  useEstablishmentAuth,
} from '@barbervp/ui';

const requestSchema = z.object({
  email: z.string().trim().min(1, 'Informe seu e-mail.').email('E-mail inválido.'),
});

const resetSchema = z
  .object({
    password: z
      .string()
      .min(8, 'Mínimo 8 caracteres, com letra e número.')
      .regex(/[A-Za-z]/, 'Mínimo 8 caracteres, com letra e número.')
      .regex(/\d/, 'Mínimo 8 caracteres, com letra e número.'),
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'As senhas não coincidem.',
    path: ['confirmPassword'],
  });

/**
 * Recuperação de senha do painel.
 *
 * Duas telas na mesma rota: sem `?token=`, pede o e-mail; com token (o link do
 * `MailOutbox`), pede a senha nova. O pedido responde sempre a mesma coisa,
 * exista o e-mail ou não — quem informa é o e-mail que chega, não a tela.
 */
export function RecoverPasswordForm() {
  const params = useSearchParams();
  const token = params.get('token');

  return token ? <ResetStep token={token} /> : <RequestStep />;
}

function RequestStep() {
  const { client } = useEstablishmentAuth();
  const [sent, setSent] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof requestSchema>>({ resolver: zodResolver(requestSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const result = await establishmentApi.forgotPassword(client, values.email);
      setSent(result.message);
    } catch (error) {
      setFormError(authErrorMessage(error, 'Não foi possível enviar as instruções.'));
    }
  });

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <CheckCircleIcon size={44} className="text-success" />
        <h2 className="font-display text-2xl font-bold text-fg">Confira seu e-mail</h2>
        <p className="text-[15px] leading-relaxed text-fg-muted">{sent}</p>
        <Link href="/entrar" className="text-sm font-semibold text-gold hover:text-gold-hover">
          Voltar para o login
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <p className="text-[15px] leading-relaxed text-fg-muted">
        Informe o e-mail do painel. Enviaremos um link para você criar uma senha nova.
      </p>

      <Input
        label="E-mail"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="voce@suabarbearia.com"
        error={errors.email?.message}
        {...register('email')}
      />

      {formError && (
        <p role="alert" className="flex items-start gap-2 text-[13px] text-danger">
          <AlertCircleIcon size={16} className="mt-px shrink-0" />
          {formError}
        </p>
      )}

      <Button type="submit" size="lg" fullWidth loading={isSubmitting} loadingText="Enviando…">
        Enviar instruções
      </Button>

      <Link
        href="/entrar"
        className="text-center text-[13px] font-semibold text-fg-muted hover:text-fg"
      >
        ← Voltar para o login
      </Link>
    </form>
  );
}

function ResetStep({ token }: { token: string }) {
  const { client } = useEstablishmentAuth();
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof resetSchema>>({ resolver: zodResolver(resetSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await establishmentApi.resetPassword(client, { token, password: values.password });
      setDone(true);
    } catch (error) {
      setFormError(authErrorMessage(error, 'Não foi possível redefinir a senha.'));
    }
  });

  if (done) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <CheckCircleIcon size={44} className="text-success" />
        <h2 className="font-display text-2xl font-bold text-fg">Senha alterada</h2>
        <p className="text-[15px] text-fg-muted">
          Sua senha foi atualizada e as outras sessões foram encerradas.
        </p>
        <Link href="/entrar" className="text-sm font-semibold text-gold hover:text-gold-hover">
          Entrar com a senha nova
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <p className="text-[15px] leading-relaxed text-fg-muted">
        Escolha uma senha nova para o painel.
      </p>

      <PasswordInput
        label="Nova senha"
        autoComplete="new-password"
        placeholder="mínimo 8 caracteres"
        showStrength
        error={errors.password?.message}
        value={watch('password') ?? ''}
        {...register('password')}
      />

      <PasswordInput
        label="Confirmar nova senha"
        autoComplete="new-password"
        placeholder="repita a senha"
        error={errors.confirmPassword?.message}
        value={watch('confirmPassword') ?? ''}
        {...register('confirmPassword')}
      />

      {formError && (
        <p role="alert" className="flex items-start gap-2 text-[13px] text-danger">
          <AlertCircleIcon size={16} className="mt-px shrink-0" />
          {formError}
        </p>
      )}

      <Button type="submit" size="lg" fullWidth loading={isSubmitting} loadingText="Salvando…">
        Salvar nova senha
      </Button>
    </form>
  );
}
