'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { EmailCheckResult, EstablishmentSession } from '@barbervp/types';
import {
  Button,
  PasswordInput,
  authErrorMessage,
  establishmentApi,
  useEstablishmentAuth,
} from '@barbervp/ui';

type LinkAccount = NonNullable<EmailCheckResult['account']>;

export interface LinkAccountCardProps {
  account: LinkAccount;
  email: string;
  shopName: string;
  acceptTerms: boolean;
  onLinked: (session: EstablishmentSession) => void;
  onUseAnotherEmail: () => void;
}

/**
 * "Que bom te ver de novo! 👋" — o card que o protótipo abre quando o e-mail
 * digitado já é conta de cliente.
 *
 * A promessa da tela ("seus agendamentos como cliente continuam intactos") é
 * literal na implementação: `POST /auth/register/link` reaproveita o `Client`
 * existente, cria o login de estabelecimento com a MESMA senha e amarra os dois
 * por `Client.userId`. Nenhum cadastro é duplicado, nenhum histórico se perde.
 */
export function LinkAccountCard({
  account,
  email,
  shopName,
  acceptTerms,
  onLinked,
  onUseAnotherEmail,
}: LinkAccountCardProps) {
  const { client } = useEstablishmentAuth();
  const [password, setPassword] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const missingShop = shopName.trim().length < 2;
  const passwordEmpty = password.trim().length === 0;
  const canSubmit = !passwordEmpty && !missingShop && acceptTerms;

  const localError = attempted
    ? passwordEmpty
      ? 'Digite sua senha para confirmar.'
      : missingShop
        ? 'Informe o nome da barbearia acima.'
        : !acceptTerms
          ? 'É preciso aceitar os termos de uso.'
          : null
    : null;

  const submit = async () => {
    setAttempted(true);
    setError(null);
    if (!canSubmit) return;

    setLoading(true);
    try {
      onLinked(
        await establishmentApi.linkAccount(client, {
          email,
          password,
          shopName: shopName.trim(),
          acceptTerms: true,
        }),
      );
    } catch (caught) {
      setError(authErrorMessage(caught, 'Não foi possível vincular a conta.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col rounded-2xl border border-gold/30 bg-gold/[0.08] p-4 sm:p-[18px]">
      <div className="mb-3.5 flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-gold-hover to-gold font-display text-xs font-bold text-bg"
        >
          {account.initials}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-bold text-fg">{account.name}</span>
          <span className="block truncate text-[11.5px] font-medium text-fg-subtle">
            {account.emailMasked}
          </span>
        </span>
      </div>

      <p className="mb-2 text-[15px] font-bold text-fg">Que bom te ver de novo! 👋</p>
      <p className="mb-4 text-[13px] leading-relaxed text-fg-muted">
        Este e-mail já tem uma conta BarberVP como cliente. Você pode usar a mesma conta para
        gerenciar sua barbearia — seus agendamentos como cliente continuam intactos.
      </p>

      <PasswordInput
        label="Confirme sua senha para continuar"
        autoComplete="current-password"
        placeholder="Sua senha atual"
        value={password}
        onChange={(event) => {
          setPassword(event.target.value);
          setError(null);
        }}
        error={error ?? localError ?? undefined}
      />

      <p className="mb-4 mt-1.5 text-right">
        <Link href="/recuperar-senha" className="text-xs font-semibold text-gold hover:underline">
          Esqueci minha senha
        </Link>
      </p>

      <Button
        onClick={submit}
        size="lg"
        fullWidth
        loading={loading}
        loadingText="Vinculando…"
      >
        Entrar e vincular minha barbearia
      </Button>

      <button
        type="button"
        onClick={onUseAnotherEmail}
        className="mt-3.5 text-center text-[12.5px] font-medium text-fg-subtle hover:text-fg-muted"
      >
        Prefiro usar outro e-mail
      </button>
    </div>
  );
}
