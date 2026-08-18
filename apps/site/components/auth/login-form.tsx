'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  AlertCircleIcon,
  Button,
  Input,
  PasswordInput,
  authErrorMessage,
  buttonClasses,
  establishmentApi,
  useEstablishmentAuth,
} from '@barbervp/ui';
import { ADMIN_URL, BOOKING_URL, DASHBOARD_URL } from '../../lib/urls';

const schema = z.object({
  email: z.string().trim().min(1, 'Informe seu e-mail.').email('E-mail inválido.'),
  password: z.string().min(1, 'Informe sua senha.'),
});

type LoginValues = z.infer<typeof schema>;

/**
 * Login do painel (`BarberVP Login Estabelecimento.dc.html`).
 *
 * O formulário não guarda token nenhum: o `EstablishmentAuthProvider` adota a
 * sessão devolvida, o refresh vem em cookie httpOnly e o destino depende do
 * onboarding — quem ainda não configurou a barbearia cai direto no wizard,
 * exatamente o encadeamento que o protótipo desenha.
 */
export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { client, adopt } = useEstablishmentAuth();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: params.get('email') ?? '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const session = await establishmentApi.login(client, values);
      adopt(session);

      // `SUPER_ADMIN` (fase 08) não tem `Membership` nenhum — não faz sentido
      // mandar pro seletor de barbearia, o destino é sempre `apps/admin`.
      if (session.user.isSuperAdmin) {
        window.location.assign(ADMIN_URL);
        return;
      }

      const membership = session.memberships.find(
        (item) => item.tenantId === session.activeTenantId,
      );

      // Sem tenant ativo o usuário tem N barbearias e precisa escolher; o
      // seletor de contexto mora no dashboard.
      if (!session.activeTenantId) {
        window.location.assign(`${DASHBOARD_URL}/selecionar-barbearia`);
        return;
      }

      window.location.assign(
        membership && !membership.onboardingDone
          ? `${DASHBOARD_URL}/configurar`
          : `${DASHBOARD_URL}`,
      );
    } catch (error) {
      setFormError(authErrorMessage(error, 'Não foi possível entrar. Tente novamente.'));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <Input
        label="E-mail"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="voce@suabarbearia.com"
        error={errors.email?.message}
        {...register('email')}
      />

      <div className="flex flex-col gap-1.5">
        <PasswordInput
          label="Senha"
          autoComplete="current-password"
          placeholder="Sua senha"
          error={errors.password?.message}
          value={watch('password')}
          {...register('password')}
        />
        <Link
          href="/recuperar-senha"
          className="self-end text-[13px] font-semibold text-gold hover:text-gold-hover"
        >
          Esqueci a senha
        </Link>
      </div>

      {formError && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-control border border-danger bg-danger/10 px-3 py-2.5 text-[13px] text-fg"
        >
          <AlertCircleIcon size={16} className="mt-px shrink-0 text-danger" />
          {formError}
        </p>
      )}

      <Button type="submit" size="lg" fullWidth loading={isSubmitting} loadingText="Entrando…">
        Entrar no painel
      </Button>

      <div className="mt-2 h-px bg-border" />

      <p className="text-center text-sm text-fg-muted">Quer cadastrar sua barbearia?</p>
      {/* Âncora de verdade, não botão com `onClick`: o site é indexado. */}
      <Link
        href="/cadastro"
        className={buttonClasses({
          variant: 'outline',
          size: 'lg',
          fullWidth: true,
          className: 'border-gold text-gold hover:border-gold-hover hover:bg-gold/10 hover:text-gold-hover',
        })}
      >
        Cadastrar barbearia →
      </Link>

      <p className="text-center text-[13px] text-fg-subtle">
        <Link href={BOOKING_URL} className="hover:text-fg-muted">
          ← Entrar como cliente
        </Link>
      </p>
    </form>
  );
}
