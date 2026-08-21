'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Input,
  PasswordInput,
  PlusIcon,
  Skeleton,
  Switch,
  Tabs,
  authErrorMessage,
  establishmentApi,
  isPasswordValid,
  useEstablishmentAuth,
  useToast,
} from '@barbervp/ui';
import { WEEKDAY_LABELS, formatBRL, minutesToTime, timeToMinutes } from '@barbervp/types';
import type { OnboardingBusinessHour } from '@barbervp/types';
import { DashboardChrome } from '@/components/dashboard/dashboard-chrome';
import { FeatureLocked } from '@/components/dashboard/feature-locked';
import { isFeatureGateError } from '@/lib/dashboard/feature-error';
import { UnitModal } from '@/components/dashboard/settings/unit-modal';
import {
  useBarbershopSettingsQuery,
  useChangePlanMutation,
  useCurrentPlanQuery,
  usePreferencesQuery,
  usePriceCalculatorMutation,
  useUnitsQuery,
  useUpdateBarbershopSettingsMutation,
  useUpdatePreferencesMutation,
} from '@/lib/dashboard/api/settings';

const TABS = [
  { value: 'perfil', label: 'Meu perfil' },
  { value: 'barbearia', label: 'Barbearia' },
  { value: 'unidades', label: 'Unidades' },
  { value: 'plano', label: 'Plano' },
  { value: 'preferencias', label: 'Preferências' },
  { value: 'calculadora', label: 'Calculadora de preço' },
] as const;
type CfgTab = (typeof TABS)[number]['value'];

function BarbeariaTab() {
  const { toast } = useToast();
  const settingsQuery = useBarbershopSettingsQuery();
  const update = useUpdateBarbershopSettingsMutation();
  const [name, setName] = useState('');
  const [document, setDocument] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [hours, setHours] = useState<OnboardingBusinessHour[]>([]);

  useEffect(() => {
    if (!settingsQuery.data) return;
    setName(settingsQuery.data.name);
    setDocument(settingsQuery.data.document ?? '');
    setPhone(settingsQuery.data.phone ?? '');
    setAddress(settingsQuery.data.address ?? '');
    setHours(settingsQuery.data.businessHours);
  }, [settingsQuery.data]);

  const patchHour = (weekday: number, patch: Partial<OnboardingBusinessHour>) => {
    setHours((current) => current.map((h) => (h.weekday === weekday ? { ...h, ...patch } : h)));
  };

  const save = async () => {
    try {
      await update.mutateAsync({ name, document, phone, address, businessHours: hours });
      toast({ message: 'Dados salvos.', tone: 'success' });
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Não foi possível salvar.', tone: 'danger' });
    }
  };

  if (settingsQuery.isLoading) return <Skeleton className="h-64 w-full rounded-2xl" />;

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader title="Dados da barbearia" />
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Nome" value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="CNPJ" value={document} onChange={(e) => setDocument(e.target.value)} />
          <Input label="Telefone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Input label="Endereço" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
      </Card>

      <Card>
        <CardHeader title="Horário de funcionamento" />
        <div className="mt-3 flex flex-col gap-2">
          {hours.map((hour) => (
            <div key={hour.weekday} className="flex flex-col gap-2.5 rounded-xl border border-border bg-surface-2 p-3 sm:flex-row sm:items-center">
              <span className="w-20 shrink-0 text-sm font-semibold text-fg">{WEEKDAY_LABELS[hour.weekday]}</span>
              <Switch label="Aberto" checked={!hour.closed} onChange={(e) => patchHour(hour.weekday, { closed: !e.target.checked })} className="shrink-0 sm:w-28" />
              {!hour.closed && (
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    className="h-9 rounded-control border border-border bg-surface px-2 text-sm text-fg outline-none"
                    value={minutesToTime(hour.opensAt)}
                    onChange={(e) => patchHour(hour.weekday, { opensAt: timeToMinutes(e.target.value) ?? hour.opensAt })}
                  />
                  <span className="text-fg-muted">às</span>
                  <input
                    type="time"
                    className="h-9 rounded-control border border-border bg-surface px-2 text-sm text-fg outline-none"
                    value={minutesToTime(hour.closesAt)}
                    onChange={(e) => patchHour(hour.weekday, { closesAt: timeToMinutes(e.target.value) ?? hour.closesAt })}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Button className="self-start" loading={update.isPending} onClick={() => void save()}>
        Salvar alterações
      </Button>
    </div>
  );
}

function UnidadesTab() {
  const unitsQuery = useUnitsQuery();
  const [modalOpen, setModalOpen] = useState(false);

  if (isFeatureGateError(unitsQuery.error)) {
    return (
      <FeatureLocked
        title="Múltiplas unidades"
        description="Gerencie várias unidades da mesma barbearia num só painel — disponível no plano Avançado."
        benefits={['Cada unidade com seu próprio time', 'Agenda e caixa separados por endereço', 'Visão consolidada do negócio']}
        minPlanLabel="Avançado"
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button size="sm" iconLeft={<PlusIcon size={16} />} onClick={() => setModalOpen(true)}>
          Nova unidade
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(unitsQuery.data ?? []).map((unit) => (
          <Card key={unit.id}>
            <CardHeader title={unit.name} description={unit.address ?? undefined} action={<Badge tone={unit.isDefault ? 'gold' : 'neutral'}>{unit.isDefault ? 'Matriz' : unit.active ? 'Ativa' : 'Inativa'}</Badge>} />
            <p className="mt-2 text-sm text-fg-muted">{unit.barberCount} barbeiro(s)</p>
          </Card>
        ))}
        {unitsQuery.data?.length === 0 && <EmptyState message="Nenhuma unidade cadastrada além da matriz." />}
      </div>
      <UnitModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}

function PlanoTab() {
  const { toast } = useToast();
  const planQuery = useCurrentPlanQuery();
  const changePlan = useChangePlanMutation();

  if (planQuery.isLoading) return <Skeleton className="h-64 w-full rounded-2xl" />;
  const plan = planQuery.data;
  if (!plan) return null;

  const handleChange = async (planId: string) => {
    if (!confirm('Confirmar a troca de plano?')) return;
    try {
      await changePlan.mutateAsync({ planId });
      toast({ message: 'Plano atualizado.', tone: 'success' });
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Não foi possível trocar de plano.', tone: 'danger' });
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <Card highlighted>
        <CardHeader title={`Plano ${plan.plan.name}`} description={`${formatBRL(plan.plan.priceCents)}/mês · renova em ${new Date(plan.renewsAt).toLocaleDateString('pt-BR')}`} />
        <p className="mt-2 text-sm text-fg-muted">{plan.barbersInUse} barbeiro(s) ativo(s){plan.plan.maxBarbers !== null ? ` de ${plan.plan.maxBarbers}` : ' (ilimitado)'}</p>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {plan.availablePlans.map((option) => (
          <Card key={option.id} highlighted={option.isPopular}>
            <CardHeader title={option.name} description={`${formatBRL(option.priceCents)}/mês`} />
            {option.id === plan.plan.id ? (
              <Badge tone="gold" className="mt-3 self-start">Plano atual</Badge>
            ) : (
              <Button size="sm" variant="outline" className="mt-3" loading={changePlan.isPending} onClick={() => void handleChange(option.id)}>
                {option.tier > plan.plan.tier ? 'Fazer upgrade' : 'Trocar para este'}
              </Button>
            )}
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader title="Faturas" />
        <ul className="mt-3 flex flex-col gap-2">
          {plan.invoices.map((invoice) => (
            <li key={invoice.id} className="flex items-center justify-between text-sm">
              <span className="text-fg-muted">{new Date(invoice.issuedAt).toLocaleDateString('pt-BR')}</span>
              <span className="font-semibold text-fg">{formatBRL(invoice.amountCents)}</span>
              <Badge tone={invoice.status === 'PAID' ? 'success' : 'warning'}>{invoice.status === 'PAID' ? 'Pago' : invoice.status}</Badge>
            </li>
          ))}
          {plan.invoices.length === 0 && <li className="text-sm text-fg-muted">Sem faturas ainda.</li>}
        </ul>
      </Card>
    </div>
  );
}

function PreferenciasTab() {
  const { toast } = useToast();
  const prefsQuery = usePreferencesQuery();
  const update = useUpdatePreferencesMutation();
  const prefs = prefsQuery.data;

  if (prefsQuery.isLoading) return <Skeleton className="h-48 w-full rounded-2xl" />;
  if (!prefs) return null;

  const save = (patch: Parameters<typeof update.mutate>[0]) => {
    update.mutate(patch, {
      onError: (error) => toast({ message: error instanceof Error ? error.message : 'Não foi possível salvar.', tone: 'danger' }),
    });
  };

  return (
    <Card>
      <CardHeader title="Preferências de agendamento" />
      <div className="mt-3 flex flex-col gap-4">
        <label className="flex items-center justify-between">
          <span className="text-sm text-fg">Bloquear agendamento online após faltas</span>
          <Switch checked={prefs.bloquearFaltasAtivo} onChange={(e) => save({ bloquearFaltasAtivo: e.target.checked })} />
        </label>
        <Input
          label="Número de faltas"
          type="number"
          min={1}
          defaultValue={prefs.bloquearFaltasQtd}
          onBlur={(e) => save({ bloquearFaltasQtd: Number(e.target.value) || prefs.bloquearFaltasQtd })}
        />
        <Input
          label="Antecedência mínima para agendar (minutos)"
          type="number"
          min={0}
          defaultValue={prefs.antecedenciaMinima}
          onBlur={(e) => save({ antecedenciaMinima: Number(e.target.value) })}
        />
        <Input
          label="Janela de cancelamento sem penalidade (horas)"
          type="number"
          min={0}
          defaultValue={prefs.cancelamentoHoras}
          onBlur={(e) => save({ cancelamentoHoras: Number(e.target.value) })}
        />
      </div>
    </Card>
  );
}

/**
 * "Meu perfil" — o destino do primeiro item do menu do avatar (fase 13).
 *
 * O protótipo tem uma tela inteira para isto (`Dashboard.dc.html`, linhas
 * 2737–2817: "Dados pessoais", "Segurança", "Privacidade e dados"). Aqui está
 * só o que já tem endpoint: os dados da sessão e a troca de senha
 * (`POST /auth/password/change`, que existia em `auth-api.ts` sem nenhuma UI
 * que a chamasse). O resto vem na auditoria de Configurações — o que NÃO se
 * faz é deixar o item de menu apontando para uma aba que não existe e cair
 * silenciosamente em "Barbearia".
 */
function PerfilTab() {
  const { client, user, activeMembership } = useEstablishmentAuth();
  const { toast } = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [saving, setSaving] = useState(false);

  const canSubmit = current.length > 0 && isPasswordValid(next) && !saving;

  const submit = async () => {
    setSaving(true);
    try {
      await establishmentApi.changePassword(client, { currentPassword: current, newPassword: next });
      setCurrent('');
      setNext('');
      // O backend derruba as DEMAIS sessões e mantém esta — avisar, senão o
      // usuário descobre sozinho ao trocar de dispositivo.
      toast({ tone: 'success', message: 'Senha alterada. As outras sessões foram encerradas.' });
    } catch (error) {
      toast({ tone: 'danger', message: authErrorMessage(error, 'Não foi possível alterar a senha.') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader title="Dados pessoais" description="Vêm do seu login e valem para todas as barbearias que você atende." />
        <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-fg-muted">Nome</dt>
            <dd className="text-sm font-medium text-fg">{user?.name ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-fg-muted">E-mail</dt>
            <dd className="truncate text-sm font-medium text-fg">{user?.email ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-fg-muted">Barbearia ativa</dt>
            <dd className="text-sm font-medium text-fg">{activeMembership?.tenantName ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-fg-muted">Seu papel</dt>
            <dd className="text-sm font-medium text-fg">
              {activeMembership?.role === 'OWNER'
                ? 'Dono'
                : activeMembership?.role === 'MANAGER'
                  ? 'Gerente'
                  : 'Barbeiro'}
            </dd>
          </div>
        </dl>
      </Card>

      <Card>
        <CardHeader title="Segurança" description="Trocar a senha encerra as suas outras sessões." />
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <PasswordInput
            label="Senha atual"
            autoComplete="current-password"
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
          />
          <PasswordInput
            label="Nova senha"
            autoComplete="new-password"
            showStrength
            value={next}
            onChange={(event) => setNext(event.target.value)}
          />
        </div>
        <Button className="mt-4 self-start" disabled={!canSubmit} loading={saving} onClick={() => void submit()}>
          Alterar senha
        </Button>
      </Card>
    </div>
  );
}

function CalculadoraTab() {
  const calc = usePriceCalculatorMutation();
  const [custo, setCusto] = useState('15');
  const [margem, setMargem] = useState('30');
  const [fixos, setFixos] = useState('3459');
  const [atendimentos, setAtendimentos] = useState('480');
  const [comissao, setComissao] = useState('40');

  if (isFeatureGateError(calc.error)) {
    return (
      <FeatureLocked
        title="Calculadora de preço inteligente"
        description="Sugestão de preço a partir de custo, margem e comissão — disponível no plano Avançado."
        benefits={['Rateio automático dos custos fixos por atendimento', 'Preço sugerido já contando a comissão do barbeiro', 'Menos achismo na hora de precificar']}
        minPlanLabel="Avançado"
      />
    );
  }

  const submit = () => {
    calc.mutate({
      custoCents: Math.round(Number(custo.replace(',', '.')) * 100),
      margemPercent: Number(margem.replace(',', '.')),
      custosFixosCents: Math.round(Number(fixos.replace(',', '.')) * 100),
      atendimentosMes: Number(atendimentos),
      comissaoPercent: Number(comissao.replace(',', '.')),
    });
  };

  return (
    <Card>
      <CardHeader title="Calculadora de preço inteligente" description="Sugere o preço de um serviço a partir do custo, margem e comissão." />
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input label="Custo variável (R$)" inputMode="decimal" value={custo} onChange={(e) => setCusto(e.target.value)} />
        <Input label="Margem desejada (%)" inputMode="decimal" value={margem} onChange={(e) => setMargem(e.target.value)} />
        <Input label="Custos fixos do mês (R$)" inputMode="decimal" value={fixos} onChange={(e) => setFixos(e.target.value)} />
        <Input label="Atendimentos/mês" inputMode="decimal" value={atendimentos} onChange={(e) => setAtendimentos(e.target.value)} />
        <Input label="Comissão do barbeiro (%)" inputMode="decimal" value={comissao} onChange={(e) => setComissao(e.target.value)} />
      </div>
      <Button className="mt-4 self-start" loading={calc.isPending} onClick={submit}>
        Calcular preço sugerido
      </Button>
      {calc.data && (
        <div className="mt-4 rounded-xl border border-gold/30 bg-gold/10 p-4">
          <p className="text-xs text-fg-muted">Preço sugerido</p>
          <p className="font-display text-2xl font-bold text-gold">{formatBRL(calc.data.precoSugeridoCents)}</p>
        </div>
      )}
    </Card>
  );
}

function ConfiguracoesContent() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get('tab') as CfgTab | null) ?? 'barbearia';
  const [tab, setTab] = useState<CfgTab>(TABS.some((t) => t.value === initialTab) ? initialTab : 'barbearia');

  return (
    <DashboardChrome activeKey="configuracoes">
      <div className="flex flex-col gap-5">
        <h1 className="font-display text-xl font-bold text-fg">Configurações</h1>
        <Tabs label="Configurações" value={tab} onChange={(v) => setTab(v as CfgTab)} items={TABS.map((t) => ({ value: t.value, label: t.label }))} />
        {tab === 'perfil' && <PerfilTab />}
        {tab === 'barbearia' && <BarbeariaTab />}
        {tab === 'unidades' && <UnidadesTab />}
        {tab === 'plano' && <PlanoTab />}
        {tab === 'preferencias' && <PreferenciasTab />}
        {tab === 'calculadora' && <CalculadoraTab />}
      </div>
    </DashboardChrome>
  );
}

/**
 * `useSearchParams()` (a aba inicial vem de `?tab=`) obriga a um limite de
 * Suspense: o hook tira a rota da renderização estática e, sem ele, o
 * `next build` falha no prerender — era o que quebrava o build de produção
 * desta app. O fallback repete a casca da tela, então não há salto visual.
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
      <div className="flex flex-col gap-5">
        <h1 className="font-display text-xl font-bold text-fg">Configurações</h1>
        <Skeleton className="h-64" />
      </div>
    </DashboardChrome>
  );
}
