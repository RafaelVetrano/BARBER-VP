'use client';

import { useState } from 'react';
import { Button, EmptyState, Skeleton } from '@barbervp/ui';
import { BANK_ACCOUNT_METHODS, formatBRL } from '@barbervp/types';
import type { BankAccountItem, PaymentMethod } from '@barbervp/types';
import { BankAccountModal } from './bank-account-modal';
import { BlockError } from '../blocks';
import { methodLabel } from './finance-shared';

/**
 * Sub-aba **Contas bancárias** (`Dashboard.dc.html` l.986–1013).
 *
 * Cards das contas + o mapa "forma de pagamento → conta de destino". O mapa é
 * DERIVADO das contas (`acceptedMethods`), não uma segunda configuração: duas
 * fontes para a mesma regra é como elas passam a discordar.
 */
export function BankAccountsTab({
  accounts,
  isLoading,
  isError,
  onRetry,
}: {
  accounts: BankAccountItem[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="ml-auto h-10 w-36 rounded-control" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-[148px] rounded-xl" />
          <Skeleton className="h-[148px] rounded-xl" />
        </div>
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  if (isError) {
    return <BlockError label="as contas bancárias" onRetry={onRetry} />;
  }

  // Uma linha por forma que TEM destino, na ordem canônica das formas — e um
  // aviso para as que ainda não têm, que é a informação que falta ao dono.
  const destinationOf = new Map<PaymentMethod, string[]>();
  for (const account of accounts) {
    for (const method of account.acceptedMethods) {
      destinationOf.set(method, [...(destinationOf.get(method) ?? []), account.name]);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end">
        <Button onClick={() => setModalOpen(true)}>+ Nova conta</Button>
      </div>

      {accounts.length === 0 ? (
        <EmptyState
          message="Nenhuma conta cadastrada"
          description="Cadastre para onde vai cada forma de pagamento — é o que liga o caixa ao banco."
          action={<Button onClick={() => setModalOpen(true)}>+ Nova conta</Button>}
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-[repeat(auto-fit,minmax(240px,1fr))]">
            {accounts.map((account) => (
              <article
                key={account.id}
                className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-5"
              >
                <h3 className="text-[15px] font-semibold text-fg">{account.name}</h3>
                <p className="text-xs text-fg-muted">{account.type ?? account.bank ?? '—'}</p>
                <p className="mt-1.5 font-display text-[26px] font-bold tabular-nums text-gold">
                  {formatBRL(account.balanceCents)}
                </p>
                <p className="mt-1 text-xs text-fg-muted">
                  Recebe:{' '}
                  {account.acceptedMethods.length > 0
                    ? account.acceptedMethods.map(methodLabel).join(', ')
                    : 'nenhuma forma vinculada'}
                </p>
              </article>
            ))}
          </div>

          <section className="rounded-xl border border-border bg-surface px-5 py-4">
            <h3 className="mb-3 text-sm font-semibold text-fg">
              Forma de pagamento → conta de destino
            </h3>
            <dl className="flex flex-col gap-2">
              {BANK_ACCOUNT_METHODS.map((method) => {
                const destinations = destinationOf.get(method);
                return (
                  <div
                    key={method}
                    className="flex flex-wrap justify-between gap-2 rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-[13px]"
                  >
                    <dt className="text-fg-muted">{methodLabel(method)}</dt>
                    <dd className={destinations ? 'text-fg' : 'text-warning'}>
                      {destinations ? destinations.join(', ') : 'sem conta de destino'}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>
        </>
      )}

      <BankAccountModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
