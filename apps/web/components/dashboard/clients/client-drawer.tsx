'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Avatar,
  Badge,
  Button,
  Drawer,
  EmptyState,
  Select,
  Skeleton,
  Tabs,
  Textarea,
  useToast,
  type TabItem,
} from '@barbervp/ui';
import { PAYMENT_METHOD_LABEL, formatBRL, formatPhone } from '@barbervp/types';
import type { ClientDetail } from '@barbervp/types';
import { useBarbersQuery } from '@/lib/dashboard/api/team';
import { useClientDetailQuery, useUpdateClientMutation } from '@/lib/dashboard/api/clients';
import {
  CLIENT_STATUS_APPEARANCE,
  SUBSCRIPTION_STATUS_APPEARANCE,
  clientsErrorMessage,
  formatBirthday,
  formatShortDate,
  whatsappLink,
} from './clients-shared';

type DrawerTab = 'historico' | 'fidelidade' | 'assinatura' | 'preferencias';

const TABS: TabItem<DrawerTab>[] = [
  { value: 'historico', label: 'Histórico' },
  { value: 'fidelidade', label: 'Fidelidade' },
  { value: 'assinatura', label: 'Assinatura' },
  { value: 'preferencias', label: 'Preferências' },
];

export interface ClientDrawerProps {
  /** Id do `ClientProfile` aberto — `null` fecha o painel. */
  clientId: string | null;
  onClose: () => void;
}

/**
 * Perfil do cliente (`Dashboard.dc.html` l.3001).
 *
 * Estrutura 1:1: cabeçalho com avatar/nome/telefone·aniversário, os dois
 * selos (status e pontos), a grade 2×2 de KPIs, as quatro sub-abas e o rodapé
 * com "+ Agendar" e "Enviar mensagem".
 *
 * Tudo vem de `GET /clients/:id` numa chamada só — trocar de sub-aba não pede
 * nada ao servidor.
 */
export function ClientDrawer({ clientId, onClose }: ClientDrawerProps) {
  const query = useClientDetailQuery(clientId);
  const [tab, setTab] = useState<DrawerTab>('historico');

  // Abrir OUTRO cliente volta para a primeira aba: manter "Fidelidade" aberta
  // de um cliente para o próximo faria o painel abrir num assunto que ninguém
  // pediu.
  useEffect(() => {
    setTab('historico');
  }, [clientId]);

  const client = query.data;

  return (
    <Drawer
      open={clientId !== null}
      onClose={onClose}
      title="Perfil do cliente"
      footer={client ? <ClientDrawerFooter client={client} onClose={onClose} /> : undefined}
    >
      {query.isLoading && <ClientDrawerSkeleton />}

      {query.isError && (
        <EmptyState
          message="Não foi possível carregar o perfil."
          description={clientsErrorMessage(query.error)}
          action={
            <Button variant="outline" onClick={() => void query.refetch()}>
              Tentar de novo
            </Button>
          }
        />
      )}

      {client && (
        <div className="flex flex-col gap-4">
          <ClientDrawerHeader client={client} />

          <Tabs
            items={TABS}
            value={tab}
            onChange={setTab}
            variant="segmented"
            label="Seções do perfil do cliente"
            idPrefix="client-tab"
          />

          {tab === 'historico' && <HistoricoTab client={client} />}
          {tab === 'fidelidade' && <FidelidadeTab client={client} />}
          {tab === 'assinatura' && <AssinaturaTab client={client} />}
          {tab === 'preferencias' && <PreferenciasTab client={client} />}
        </div>
      )}
    </Drawer>
  );
}

function ClientDrawerHeader({ client }: { client: ClientDetail }) {
  const status = CLIENT_STATUS_APPEARANCE[client.status];
  const birthday = formatBirthday(client.birthDate);

  return (
    <>
      <div className="flex items-center gap-3">
        <Avatar name={client.name} size="lg" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate font-display text-[17px] font-bold text-fg">{client.name}</span>
          <span className="text-xs text-fg-muted">
            {formatPhone(client.phone)}
            {birthday && ` · 🎂 ${birthday}`}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge tone={status.tone}>{status.label}</Badge>
        {/* Sem programa de pontos ligado o selo não aparece — em vez de
            anunciar "0 pts" numa barbearia que não pontua. */}
        {client.loyaltyPoints !== null && <Badge tone="gold">{client.loyaltyPoints} pts</Badge>}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <KpiTile label="Total gasto" value={formatBRL(client.totalSpentCents)} />
        <KpiTile label="Visitas" value={String(client.visitCount)} />
        <KpiTile label="Ticket médio" value={formatBRL(client.ticketAverageCents)} />
        <KpiTile label="Faltas" value={String(client.noShowCount)} />
      </div>
    </>
  );
}

function KpiTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2 p-3">
      <p className="text-[11px] text-fg-muted">{label}</p>
      <p className="mt-1 font-display text-base font-bold text-fg">{value}</p>
    </div>
  );
}

function HistoricoTab({ client }: { client: ClientDetail }) {
  if (client.history.length === 0) {
    return (
      <EmptyState
        message="Nenhum atendimento fechado ainda."
        description="O histórico lista as comandas fechadas deste cliente."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {client.history.map((entry) => (
        <li
          key={entry.orderId}
          className="flex flex-col gap-0.5 rounded-lg border border-border bg-surface-2 px-3 py-2.5"
        >
          <div className="flex justify-between gap-3">
            <span className="text-xs font-semibold text-fg">{formatShortDate(entry.date)}</span>
            <span className="text-xs font-semibold tabular-nums text-gold">
              {formatBRL(entry.totalCents)}
            </span>
          </div>
          <span className="text-xs text-fg-muted">
            {[
              entry.items.join(', ') || 'Sem itens',
              entry.barberName,
              entry.paymentMethods.map((method) => PAYMENT_METHOD_LABEL[method]).join(' + '),
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </li>
      ))}
    </ul>
  );
}

function FidelidadeTab({ client }: { client: ClientDetail }) {
  if (!client.loyaltyEnabled) {
    return (
      <EmptyState
        message="Programa de pontos desligado."
        // A aba Fidelidade ficou só com Assinaturas (agente 21) — apontar para
        // lá mandaria o dono para uma tela que não liga mais nada.
        description="Enquanto o programa estiver desligado, as comandas deste cliente não geram pontos."
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13px] font-semibold text-gold">Saldo: {client.loyaltyPoints} pontos</p>
      {client.loyaltyLedger.length === 0 ? (
        <EmptyState message="Nenhum lançamento de pontos ainda." />
      ) : (
        <ul className="flex flex-col gap-2">
          {client.loyaltyLedger.map((entry) => (
            <li
              key={entry.id}
              className="flex justify-between gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-xs"
            >
              <span className="text-fg-muted">
                {formatShortDate(entry.date)} · {entry.description}
              </span>
              <span className="shrink-0 tabular-nums text-fg">
                {entry.points > 0 ? `+${entry.points}` : entry.points} pts
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AssinaturaTab({ client }: { client: ClientDetail }) {
  const subscription = client.subscription;
  if (!subscription) {
    return <p className="py-5 text-center text-[13px] text-fg-muted">Sem assinatura ativa.</p>;
  }

  const billing = SUBSCRIPTION_STATUS_APPEARANCE[subscription.status];

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface-2 p-3.5">
      <span className="text-sm font-semibold text-fg">
        {subscription.planName} · {formatBRL(subscription.priceCents)}/mês
      </span>
      <span className="text-xs text-fg-muted">
        Usos neste ciclo: {subscription.usedTotal}/{subscription.quotaTotal}
      </span>
      {/* A quebra por serviço só aparece quando o plano tem mais de um: com um
          serviço só ela repetiria a linha acima. */}
      {subscription.usages.length > 1 && (
        <ul className="flex flex-col gap-1">
          {subscription.usages.map((usage) => (
            <li key={usage.serviceName} className="flex justify-between gap-3 text-xs text-fg-muted">
              <span className="truncate">{usage.serviceName}</span>
              <span className="shrink-0 tabular-nums">
                {usage.used}/{usage.quota}
              </span>
            </li>
          ))}
        </ul>
      )}
      <Badge tone={billing.tone} className="self-start">
        {billing.label}
      </Badge>
    </div>
  );
}

/**
 * Preferências.
 *
 * O protótipo exibe barbeiro favorito e observações como texto morto. Aqui são
 * os controles de verdade: `PATCH /clients/:id` já existia desde a fase 06 e
 * esta é a única tela do produto que grava esses dois campos — deixá-los
 * somente-leitura tiraria a função sem tirar o bloco.
 */
function PreferenciasTab({ client }: { client: ClientDetail }) {
  const { toast } = useToast();
  const barbersQuery = useBarbersQuery();
  const update = useUpdateClientMutation();

  const [favoriteBarberId, setFavoriteBarberId] = useState(client.favoriteBarberId ?? '');
  const [notes, setNotes] = useState(client.notes ?? '');

  const dirty = favoriteBarberId !== (client.favoriteBarberId ?? '') || notes !== (client.notes ?? '');

  const save = async () => {
    try {
      await update.mutateAsync({
        id: client.id,
        dto: { notes: notes.trim() || null, favoriteBarberId: favoriteBarberId || null },
      });
      toast({ message: 'Preferências salvas.', tone: 'success' });
    } catch (cause) {
      toast({ message: clientsErrorMessage(cause), tone: 'danger' });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <Select
        label="Barbeiro favorito"
        value={favoriteBarberId}
        onChange={(event) => setFavoriteBarberId(event.target.value)}
        placeholder="Nenhum"
        options={(barbersQuery.data ?? []).map((barber) => ({ value: barber.id, label: barber.name }))}
      />
      <Textarea
        label="Observações"
        rows={4}
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        placeholder="Nenhuma observação registrada."
      />
      <Button variant="outline" disabled={!dirty} loading={update.isPending} onClick={() => void save()}>
        Salvar preferências
      </Button>
    </div>
  );
}

function ClientDrawerFooter({ client, onClose }: { client: ClientDetail; onClose: () => void }) {
  const router = useRouter();

  return (
    <div className="flex gap-2.5">
      <Button
        fullWidth
        onClick={() => {
          onClose();
          // Ação de outra aba = navegar para ela, com o cliente já escolhido.
          router.push(`/app/agenda?novo=1&cliente=${client.id}`);
        }}
      >
        + Agendar
      </Button>
      <Button
        fullWidth
        variant="outline"
        onClick={() => window.open(whatsappLink(client.phone), '_blank', 'noopener,noreferrer')}
      >
        Enviar mensagem
      </Button>
    </div>
  );
}

function ClientDrawerSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Skeleton className="size-12 rounded-full" />
        <div className="flex flex-1 flex-col gap-1.5">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <Skeleton className="h-6 w-40" />
      <div className="grid grid-cols-2 gap-2.5">
        <Skeleton className="h-[68px]" />
        <Skeleton className="h-[68px]" />
        <Skeleton className="h-[68px]" />
        <Skeleton className="h-[68px]" />
      </div>
      <Skeleton className="h-11" />
      <Skeleton className="h-16" />
      <Skeleton className="h-16" />
    </div>
  );
}
