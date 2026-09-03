'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CheckIcon,
  EmptyState,
  Input,
  LockIcon,
  PlusIcon,
  ResponsiveTable,
  Select,
  Skeleton,
  Switch,
  Tabs,
  maskPhoneInput,
  useEstablishmentAuth,
  useToast,
} from '@barbervp/ui';
import {
  ANTECEDENCIA_OPTIONS,
  CANCELAMENTO_OPTIONS,
  FALTAS_OPTIONS,
  TENANT_TIMEZONES,
  formatBRL,
  formatPhone,
} from '@barbervp/types';
import type {
  SaasInvoiceItem,
  SaasPlanOption,
  TenantBusinessHour,
  UnitItem,
  UnitStatus,
} from '@barbervp/types';
import { DashboardChrome } from '@/components/dashboard/dashboard-chrome';
import { BlockError } from '@/components/dashboard/blocks';
import { UpgradeModal } from '@/components/dashboard/upgrade-modal';
import { BusinessHoursEditor } from '@/components/dashboard/settings/business-hours-editor';
import { PlanChangeModal } from '@/components/dashboard/settings/plan-change-modal';
import { UnitModal } from '@/components/dashboard/settings/unit-modal';
import { LoyaltyProgramCard } from '@/components/dashboard/settings/loyalty-program-card';
import { inputToCents } from '@/components/dashboard/finance/finance-shared';
import { useDashboardShellQuery } from '@/lib/dashboard/api/dashboard';
import {
  useBarbershopSettingsQuery,
  useChangePlanMutation,
  useCurrentPlanQuery,
  useInvoicePdfMutation,
  usePreferencesQuery,
  useUnitsQuery,
  useUpdateBarbershopSettingsMutation,
  useUpdatePreferencesMutation,
} from '@/lib/dashboard/api/settings';

/**
 * As QUATRO sub-abas do protótipo (`Dashboard.dc.html` l.2468–2472).
 *
 * "Meu perfil" NÃO é uma delas: o desenho tem uma tela própria para ela
 * (`isMeuPerfilScreen`, l.2737), fora do nav, alcançada pelo menu do avatar —
 * e é para lá que o item aponta agora (`/app/meu-perfil`).
 */
const TABS = [
  { value: 'barbearia', label: 'Barbearia' },
  { value: 'unidades', label: 'Unidades' },
  { value: 'plano', label: 'Plano e cobrança' },
  { value: 'preferencias', label: 'Preferências' },
] as const;
type CfgTab = (typeof TABS)[number]['value'];

const UNIT_STATUS: Record<UnitStatus, { label: string; tone: 'success' | 'warning' | 'danger' }> = {
  ACTIVE: { label: 'Ativa', tone: 'success' },
  SETUP: { label: 'Em configuração', tone: 'warning' },
  INACTIVE: { label: 'Inativa', tone: 'danger' },
};

// ── Barbearia ──────────────────────────────────────────────────────────────

function BarbeariaTab() {
  const { toast } = useToast();
  const settingsQuery = useBarbershopSettingsQuery();
  const update = useUpdateBarbershopSettingsMutation();

  const [name, setName] = useState('');
  const [document, setDocument] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [timezone, setTimezone] = useState('');
  const [hours, setHours] = useState<TenantBusinessHour[]>([]);

  useEffect(() => {
    const data = settingsQuery.data;
    if (!data) return;
    setName(data.name);
    setDocument(data.document ?? '');
    setPhone(data.phone ? maskPhoneInput(formatPhone(data.phone)) : '');
    setAddress(data.address ?? '');
    setTimezone(data.timezone);
    setHours(data.businessHours);
  }, [settingsQuery.data]);

  const patchHour = (weekday: number, patch: Partial<TenantBusinessHour>) => {
    setHours((current) => current.map((h) => (h.weekday === weekday ? { ...h, ...patch } : h)));
  };

  const save = async () => {
    try {
      await update.mutateAsync({
        name,
        document: document.trim() || null,
        phone: phone.trim() || null,
        address: address.trim() || null,
        timezone,
        businessHours: hours,
      });
      toast({ message: 'Dados da barbearia salvos.', tone: 'success' });
    } catch (error) {
      toast({
        message: error instanceof Error ? error.message : 'Não foi possível salvar.',
        tone: 'danger',
      });
    }
  };

  // Esqueleto na altura do card final — carregar não pode empurrar o layout.
  if (settingsQuery.isLoading) return <Skeleton className="h-[640px] max-w-[720px] rounded-xl" />;
  if (settingsQuery.isError) {
    return <BlockError label="os dados da barbearia" onRetry={() => void settingsQuery.refetch()} />;
  }

  // Tenant recém-criado ainda não tem as 7 linhas de expediente: a aba precisa
  // renderizar mesmo assim (regra 4), com o bloco explicando o vazio.
  const hasHours = hours.length > 0;

  return (
    <Card className="max-w-[720px] gap-4 p-5">
      <CardHeader title="Dados da barbearia" />

      <Input label="Nome" value={name} onChange={(e) => setName(e.target.value)} />
      <Input
        label="CNPJ (opcional)"
        value={document}
        onChange={(e) => setDocument(e.target.value)}
      />
      <Input label="Endereço" value={address} onChange={(e) => setAddress(e.target.value)} />
      {/* Mesmo par do cadastro de barbeiro: `formatPhone` tira o 55 do E.164
          guardado e `maskPhoneInput` mantém a máscara enquanto se digita. Sem
          isto o campo mostrava "551133334444" cru. */}
      <Input
        label="Telefone"
        inputMode="tel"
        value={phone}
        onChange={(e) => setPhone(maskPhoneInput(e.target.value))}
      />
      <Select
        label="Fuso horário"
        value={timezone}
        onChange={(e) => setTimezone(e.target.value)}
        options={TENANT_TIMEZONES.map((tz) => ({ value: tz.value, label: tz.label }))}
      />

      <div className="mt-1 h-px bg-border" />

      <h4 className="text-sm font-semibold text-fg">Horário de funcionamento</h4>
      {hasHours ? (
        <BusinessHoursEditor hours={hours} onChange={patchHour} />
      ) : (
        <p className="text-[13px] text-fg-muted">
          O expediente da casa ainda não foi definido. Ele é preenchido no wizard de configuração —
          termine-o para liberar a agenda online.
        </p>
      )}

      <div className="mt-1 flex justify-end">
        <Button loading={update.isPending} onClick={() => void save()}>
          Salvar alterações
        </Button>
      </div>
    </Card>
  );
}

// ── Unidades ───────────────────────────────────────────────────────────────

function UnidadesTab() {
  const shellQuery = useDashboardShellQuery();
  const unitsQuery = useUnitsQuery();
  const [modalOpen, setModalOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  /**
   * O cadeado é o MESMO do "+ Nova unidade" da topbar (l.102–106): a lista
   * continua visível e é o botão que trava. Quem realmente barra é o servidor —
   * `POST /settings/units` responde 403 sem `multiUnidades`.
   */
  const locked = shellQuery.data ? !shellQuery.data.features.multiUnidades : false;

  const columns = [
    {
      key: 'name',
      header: 'Unidade',
      mobile: 'title' as const,
      render: (unit: UnitItem) => (
        <span className="whitespace-nowrap font-semibold text-fg">{unit.name}</span>
      ),
    },
    {
      key: 'address',
      header: 'Endereço',
      mobile: 'subtitle' as const,
      render: (unit: UnitItem) => <span className="text-fg-muted">{unit.address ?? '—'}</span>,
    },
    {
      key: 'barbers',
      header: 'Barbeiros',
      align: 'right' as const,
      mobile: 'meta' as const,
      render: (unit: UnitItem) => <span className="font-semibold text-fg">{unit.barberCount}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      mobile: 'meta' as const,
      render: (unit: UnitItem) => (
        <Badge tone={UNIT_STATUS[unit.status].tone}>{UNIT_STATUS[unit.status].label}</Badge>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-control border border-gold/35 bg-gold/10 p-3.5">
        <span className="shrink-0 text-gold" aria-hidden="true">
          ⓘ
        </span>
        <p className="text-[13px] font-medium text-fg">
          Relatórios consolidados disponíveis em{' '}
          <Link href="/app/relatorios" className="text-gold underline-offset-2 hover:underline">
            Relatórios
          </Link>
          .
        </p>
      </div>

      <div className="flex justify-end">
        <Button
          size="sm"
          iconLeft={locked ? <LockIcon size={15} /> : <PlusIcon size={16} />}
          onClick={() => (locked ? setUpgradeOpen(true) : setModalOpen(true))}
        >
          Nova unidade
        </Button>
      </div>

      {unitsQuery.isLoading && <Skeleton className="h-56 rounded-xl" />}

      {unitsQuery.isError && (
        <Card flush>
          <BlockError label="as unidades" onRetry={() => void unitsQuery.refetch()} />
        </Card>
      )}

      {unitsQuery.data && (
        <Card flush>
          <ResponsiveTable
            caption="Unidades da barbearia"
            columns={columns}
            rows={unitsQuery.data}
            getRowKey={(unit) => unit.id}
            empty={
              <EmptyState
                message="Nenhuma unidade cadastrada."
                description={
                  locked
                    ? 'Múltiplas unidades fazem parte do plano Avançado.'
                    : 'Cadastre a primeira em "Nova unidade".'
                }
              />
            }
          />
        </Card>
      )}

      <UnitModal open={modalOpen} onClose={() => setModalOpen(false)} />
      <UpgradeModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        minPlanLabel="Avançado"
        description="Múltiplas unidades fazem parte do plano Avançado."
        benefits={[
          'Cadastre unidades ilimitadas',
          'Relatórios consolidados entre unidades',
          'Equipe e agenda por unidade',
        ]}
      />
    </div>
  );
}

// ── Plano e cobrança ───────────────────────────────────────────────────────

function invoiceStatus(invoice: SaasInvoiceItem): { label: string; tone: 'success' | 'warning' | 'danger' } {
  if (invoice.status === 'PAID') return { label: 'Pago', tone: 'success' };
  if (invoice.status === 'FAILED') return { label: 'Recusado', tone: 'danger' };
  return invoice.overdue ? { label: 'Atrasado', tone: 'danger' } : { label: 'Pendente', tone: 'warning' };
}

function PlanoTab() {
  const { toast } = useToast();
  const planQuery = useCurrentPlanQuery();
  const changePlan = useChangePlanMutation();
  const invoicePdf = useInvoicePdfMutation();
  const [targetPlanId, setTargetPlanId] = useState<string | null>(null);

  if (planQuery.isLoading) return <Skeleton className="h-[560px] rounded-xl" />;
  if (planQuery.isError) {
    return <BlockError label="o plano da barbearia" onRetry={() => void planQuery.refetch()} />;
  }

  const plan = planQuery.data;
  if (!plan) return null;

  const confirmChange = async (planId: string) => {
    try {
      await changePlan.mutateAsync({ planId });
      setTargetPlanId(null);
      toast({ message: 'Plano alterado.', tone: 'success' });
    } catch (error) {
      toast({
        message: error instanceof Error ? error.message : 'Não foi possível trocar de plano.',
        tone: 'danger',
      });
    }
  };

  const downloadPdf = (invoice: SaasInvoiceItem) => {
    invoicePdf.mutate(invoice.id, {
      onError: (error) =>
        toast({
          message: error instanceof Error ? error.message : 'Não foi possível baixar a fatura.',
          tone: 'danger',
        }),
    });
  };

  const invoiceColumns = [
    {
      key: 'issuedAt',
      header: 'Data',
      mobile: 'title' as const,
      render: (invoice: SaasInvoiceItem) => (
        <span className="whitespace-nowrap font-medium text-fg">
          {new Date(invoice.issuedAt).toLocaleDateString('pt-BR')}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Valor',
      mobile: 'meta' as const,
      render: (invoice: SaasInvoiceItem) => (
        <span className="whitespace-nowrap font-semibold text-fg">
          {formatBRL(invoice.amountCents)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      mobile: 'meta' as const,
      render: (invoice: SaasInvoiceItem) => {
        const status = invoiceStatus(invoice);
        return <Badge tone={status.tone}>{status.label}</Badge>;
      },
    },
    {
      key: 'pdf',
      header: '',
      align: 'right' as const,
      render: (invoice: SaasInvoiceItem) => (
        <button
          type="button"
          className="text-xs font-semibold text-gold underline-offset-2 hover:underline disabled:opacity-60"
          disabled={invoicePdf.isPending}
          onClick={() => downloadPdf(invoice)}
        >
          PDF
        </button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <Card className="flex-row flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2.5">
            <span className="font-display text-lg font-bold text-fg">{plan.plan.name}</span>
            <Badge tone="success">Ativo</Badge>
          </div>
          <span className="text-[13px] text-fg-muted">
            {formatBRL(plan.plan.priceCents)}/mês
            {plan.renewsAt
              ? ` · renova em ${new Date(plan.renewsAt).toLocaleDateString('pt-BR')}`
              : ' · sem assinatura ativa'}
          </span>
        </div>
        <Button
          variant="outline"
          onClick={() =>
            document
              .getElementById('planos-comparacao')
              ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
          }
        >
          Mudar de plano
        </Button>
      </Card>

      <div
        id="planos-comparacao"
        className="grid gap-4"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}
      >
        {plan.availablePlans.map((option) => (
          <PlanCard
            key={option.id}
            option={option}
            current={option.id === plan.plan.id}
            onChange={() => setTargetPlanId(option.id)}
          />
        ))}
      </div>

      <Card flush>
        <h3 className="border-b border-border px-5 py-4 font-display text-base font-bold text-fg">
          Histórico de faturas
        </h3>
        <ResponsiveTable
          caption="Faturas da assinatura"
          columns={invoiceColumns}
          rows={plan.invoices}
          getRowKey={(invoice) => invoice.id}
          empty={<EmptyState message="Nenhuma fatura emitida ainda." />}
        />
      </Card>

      <PlanChangeModal
        planId={targetPlanId}
        onClose={() => setTargetPlanId(null)}
        onConfirm={(planId) => void confirmChange(planId)}
        confirming={changePlan.isPending}
      />
    </div>
  );
}

/**
 * Card de um plano na grade de comparação (l.2633–2650).
 *
 * Os bullets são `SaasPlan.marketing` — a MESMA cópia que a landing mostra. O
 * `baseLabel` ("Tudo do Essencial, mais:") sai dourado e sem ✓, como no
 * desenho, porque não é um recurso: é o encadeamento dos planos.
 */
function PlanCard({
  option,
  current,
  onChange,
}: {
  option: SaasPlanOption;
  current: boolean;
  onChange: () => void;
}) {
  return (
    <Card highlighted={current} className="gap-4 p-5">
      <div className="flex flex-col gap-0.5">
        <span className="font-display text-base font-bold text-fg">{option.name}</span>
        <span className="text-[13px] text-fg-muted">
          <span className="font-display text-[22px] font-bold text-fg">
            {formatBRL(option.priceCents)}
          </span>
          /mês
        </span>
      </div>

      {option.marketing && (
        <div className="flex flex-col gap-2.5">
          {option.marketing.baseLabel && (
            <span className="text-[13px] font-medium text-gold">{option.marketing.baseLabel}</span>
          )}
          {option.marketing.features.map((feature) => (
            <span key={feature} className="flex items-start gap-2 text-[13px] text-fg">
              <CheckIcon size={15} className="mt-0.5 shrink-0 text-success" />
              {feature}
            </span>
          ))}
        </div>
      )}

      <Button
        className="mt-auto"
        variant={current ? 'outline' : 'primary'}
        disabled={current}
        fullWidth
        onClick={onChange}
      >
        {current ? 'Plano atual' : 'Mudar de plano'}
      </Button>
    </Card>
  );
}

// ── Preferências ───────────────────────────────────────────────────────────

/**
 * Monta as opções de um seletor garantindo que o valor GRAVADO esteja nelas.
 *
 * Um tenant pode ter uma política fora do menu (o seed nasce com 2h de
 * cancelamento, e o desenho oferece 1/3/12/24). Sem esta costura o `<select>`
 * cairia na primeira opção e a próxima gravação trocaria, em silêncio, uma
 * regra de negócio da barbearia.
 */
function optionsWithCurrent(
  values: readonly number[],
  current: number,
  label: (value: number) => string,
): { value: string; label: string }[] {
  const all = values.includes(current) ? [...values] : [...values, current].sort((a, b) => a - b);
  return all.map((value) => ({ value: String(value), label: label(value) }));
}

const minutesLabel = (minutes: number) =>
  minutes < 60
    ? `${minutes}min`
    : minutes % 60 === 0
      ? `${minutes / 60}h`
      : `${Math.floor(minutes / 60)}h${minutes % 60}`;

function PreferenciasTab() {
  const { toast } = useToast();
  const prefsQuery = usePreferencesQuery();
  const update = useUpdatePreferencesMutation();

  // A meta é digitada, então vive como rascunho e só sobe no `blur` — salvar a
  // cada tecla mandaria "1", "12", "120" enquanto o dono ainda escreve "1200".
  const [goalInput, setGoalInput] = useState('');
  const goalCents = prefsQuery.data?.monthlyGoalCents ?? null;
  useEffect(() => {
    setGoalInput(goalCents === null ? '' : (goalCents / 100).toFixed(2).replace('.', ','));
  }, [goalCents]);

  if (prefsQuery.isLoading) return <Skeleton className="h-[420px] max-w-[640px] rounded-xl" />;
  if (prefsQuery.isError) {
    return <BlockError label="as preferências" onRetry={() => void prefsQuery.refetch()} />;
  }

  const prefs = prefsQuery.data;
  if (!prefs) return null;

  const save = (patch: Parameters<typeof update.mutate>[0]) => {
    update.mutate(patch, {
      onError: (error) =>
        toast({
          message: error instanceof Error ? error.message : 'Não foi possível salvar.',
          tone: 'danger',
        }),
    });
  };

  /** Campo vazio = sem meta (`null`), que é o que apaga a linha do gráfico. */
  const saveGoal = () => {
    const next = goalInput.trim() === '' ? null : inputToCents(goalInput);
    if (next === goalCents) return;
    save({ monthlyGoalCents: next });
  };

  return (
    <div className="flex flex-col gap-4">
    <Card className="max-w-[640px] gap-0 p-5">
      <div className="flex flex-col gap-2.5 border-b border-border pb-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-medium text-fg">Bloquear após</span>
            <Select
              aria-label="Número de faltas que bloqueiam o agendamento online"
              className="w-20"
              value={String(prefs.bloquearFaltasQtd)}
              onChange={(e) => save({ bloquearFaltasQtd: Number(e.target.value) })}
              options={optionsWithCurrent(FALTAS_OPTIONS, prefs.bloquearFaltasQtd, String)}
            />
            <span className="text-[13px] font-medium text-fg">faltas</span>
          </div>
          <Switch
            aria-label="Bloquear agendamento online por faltas"
            checked={prefs.bloquearFaltasAtivo}
            onChange={(e) => save({ bloquearFaltasAtivo: e.target.checked })}
          />
        </div>
        <span className="text-xs text-fg-muted">
          Clientes com faltas consecutivas não poderão agendar online até liberação manual.
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-border py-3.5">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-fg">
            Antecedência mínima de agendamento online
          </p>
          <p className="mt-0.5 text-xs text-fg-muted">
            Tempo mínimo antes do horário para o cliente agendar.
          </p>
        </div>
        <Select
          aria-label="Antecedência mínima de agendamento online"
          className="w-28"
          value={String(prefs.antecedenciaMinima)}
          onChange={(e) => save({ antecedenciaMinima: Number(e.target.value) })}
          options={optionsWithCurrent(
            ANTECEDENCIA_OPTIONS,
            prefs.antecedenciaMinima,
            minutesLabel,
          )}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2.5 py-3.5">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-fg">Cancelamento pelo cliente até</p>
          <p className="mt-0.5 text-xs text-fg-muted">
            Prazo limite para o cliente cancelar sem custo.
          </p>
        </div>
        <Select
          aria-label="Prazo de cancelamento pelo cliente"
          className="w-32"
          value={String(prefs.cancelamentoHoras)}
          onChange={(e) => save({ cancelamentoHoras: Number(e.target.value) })}
          options={optionsWithCurrent(
            CANCELAMENTO_OPTIONS,
            prefs.cancelamentoHoras,
            (hours) => `${hours}h antes`,
          )}
        />
      </div>

      {/*
        META MENSAL — acrescentada pelo agente 29.

        `TenantSettings.monthlyGoalCents` já era gravável por
        `PATCH /settings/preferences` e o gráfico do Dashboard já a desenhava
        como linha tracejada, mas NENHUMA tela tinha o campo: a linha da meta
        só aparecia para quem editasse o banco à mão. Fica aqui, com as outras
        regras de operação da casa.
      */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-border py-3.5">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-fg">Meta de faturamento mensal</p>
          <p className="mt-0.5 text-xs text-fg-muted">
            Vira a linha tracejada do gráfico do Dashboard. Deixe vazio para não ter meta.
          </p>
        </div>
        <Input
          aria-label="Meta de faturamento mensal"
          className="w-36"
          inputMode="decimal"
          addonLeft="R$"
          value={goalInput}
          onChange={(event) => setGoalInput(event.target.value)}
          onBlur={saveGoal}
        />
      </div>

      {/*
        O protótipo desenha aqui um quarto bloco, "Tema escuro" (l.2730). Ele
        NÃO foi portado: o `SPEC.md` fixa tema escuro em todas as superfícies,
        "sem alternância claro/escuro no produto real", e o design system não
        tem paleta clara. Um interruptor sem um segundo tema atrás seria
        exatamente o botão decorativo que a regra 2 proíbe. Ver CONTEXT.md.
      */}
    </Card>

    {/*
      O PROGRAMA DE PONTOS mora aqui desde o agente 29: é regra de operação da
      casa, vizinha do bloqueio por faltas e da antecedência mínima, e não dado
      cadastral (que é a aba Barbearia). Até então `GET|PATCH /loyalty/program`
      não tinha tela NENHUMA — um recurso usado em três telas que ninguém podia
      ligar. O card traz o próprio gate `fidelidadePontos`.
    */}
    <LoyaltyProgramCard />
    </div>
  );
}

// ── Casca ──────────────────────────────────────────────────────────────────

function ConfiguracoesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { activeMembership } = useEstablishmentAuth();

  /**
   * `SPEC.md` → RBAC: o gerente administra a barbearia, mas billing e plano do
   * SaaS são do dono. A aba some do menu porque o endpoint responde 403 — não
   * se oferece um caminho que termina em erro.
   */
  const isOwner = activeMembership?.role === 'OWNER';
  const tabs = useMemo(
    () => TABS.filter((tab) => tab.value !== 'plano' || isOwner),
    [isOwner],
  );

  const requested = searchParams.get('tab') as CfgTab | null;
  const initial = tabs.some((tab) => tab.value === requested) ? (requested as CfgTab) : 'barbearia';
  const [tab, setTab] = useState<CfgTab>(initial);

  // O upsell manda para `?tab=plano` de qualquer tela da casca; a aba precisa
  // reagir à URL, e não só ao primeiro render.
  useEffect(() => {
    if (requested && tabs.some((item) => item.value === requested)) {
      setTab(requested);
    }
  }, [requested, tabs]);

  const select = (value: CfgTab) => {
    setTab(value);
    router.replace(`/app/configuracoes?tab=${value}`, { scroll: false });
  };

  /**
   * `BARBER` não tem Configurações — nem no nav (`navForRole`) nem na API
   * (`@Roles('OWNER','MANAGER')`). Quem digita a URL merece a frase, e não
   * quatro sub-abas que respondem 403 com um "Tentar de novo" que nunca vai
   * dar certo: um botão de repetir uma ação impossível é um botão falso.
   */
  if (activeMembership?.role === 'BARBER') {
    return (
      <DashboardChrome activeKey="configuracoes">
        <EmptyState
          message="Configurações é a área do dono e do gerente."
          description="Seus dados pessoais e sua senha ficam em Meu perfil."
          action={
            <Button variant="outline" onClick={() => router.push('/app/meu-perfil')}>
              Ir para Meu perfil
            </Button>
          }
        />
      </DashboardChrome>
    );
  }

  return (
    <DashboardChrome activeKey="configuracoes">
      <div className="flex max-w-[1400px] flex-col gap-5">
        <h1 className="font-display text-xl font-bold text-fg">Configurações</h1>
        <Tabs
          label="Configurações"
          variant="segmented"
          value={tab}
          onChange={(value) => select(value as CfgTab)}
          items={tabs.map((item) => ({ value: item.value, label: item.label }))}
          // `width: fit-content` é o desenho (l.2468) — mas só onde cabe:
          // abaixo de `md` a barra ocupa a largura e rola por dentro.
          className="md:w-fit"
        />
        {tab === 'barbearia' && <BarbeariaTab />}
        {tab === 'unidades' && <UnidadesTab />}
        {tab === 'plano' && isOwner && <PlanoTab />}
        {tab === 'preferencias' && <PreferenciasTab />}
      </div>
    </DashboardChrome>
  );
}

/**
 * `useSearchParams()` (a aba inicial vem de `?tab=`) obriga a um limite de
 * Suspense: o hook tira a rota da renderização estática e, sem ele, o
 * `next build` falha no prerender. O fallback repete a casca da tela, então
 * não há salto visual.
 */
export default function ConfiguracoesPage() {
  return (
    <Suspense fallback={<ConfiguracoesFallback />}>
      <ConfiguracoesContent />
    </Suspense>
  );
}

function ConfiguracoesFallback() {
  return (
    <DashboardChrome activeKey="configuracoes">
      <div className="flex max-w-[1400px] flex-col gap-5">
        <h1 className="font-display text-xl font-bold text-fg">Configurações</h1>
        <Skeleton className="h-9 w-[420px] max-w-full rounded-control" />
        <Skeleton className="h-[640px] max-w-[720px] rounded-xl" />
      </div>
    </DashboardChrome>
  );
}
