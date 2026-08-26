'use client';

import { useMemo, useState } from 'react';
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  ResponsiveTable,
  Segmented,
  Skeleton,
  useEstablishmentAuth,
  useToast,
  type TableColumn,
} from '@barbervp/ui';
import { formatBRL } from '@barbervp/types';
import type { CommissionBarberSummary, CommissionPeriodType } from '@barbervp/types';
import { DashboardChrome } from '@/components/dashboard/dashboard-chrome';
import { FeatureLocked } from '@/components/dashboard/feature-locked';
import { BlockError, FinanceStat, StatGrid, StatGridSkeleton, Panel } from '@/components/dashboard/blocks';
import { PdfModal } from '@/components/dashboard/commissions/pdf-modal';
import { RuleModal } from '@/components/dashboard/commissions/rule-modal';
import {
  dayLabel,
  extractNote,
  monthNameOf,
  percentLabel,
  periodRangeLabel,
  periodTitle,
  ruleChipLabel,
  shiftAnchor,
  todayISO,
  weekStartOf,
} from '@/components/dashboard/commissions/commissions-shared';
import { isFeatureGateError } from '@/lib/dashboard/feature-error';
import {
  useClosePeriodMutation,
  useCommissionPeriodQuery,
  useCommissionRulesQuery,
} from '@/lib/dashboard/api/commissions';
import { useDashboardShellQuery } from '@/lib/dashboard/api/dashboard';
import { useBarbersQuery } from '@/lib/dashboard/api/team';

/** `comissoesLockedFeatureBullets` do protótipo (l.1214–1216). */
const LOCKED_BULLETS = [
  'Cálculo automático por barbeiro',
  'Faixas progressivas de comissão',
  'Relatório em PDF',
];

/**
 * Aba **Comissões** (`Dashboard.dc.html` l.1089–1228).
 *
 * Recorte (Semanal/Mensal) + stepper de período, três KPIs, e a tabela de
 * nove colunas com o extrato de atendimentos abrindo por barbeiro. Os dois
 * modais do protótipo — regras (l.4154) e relatório (l.4228) — moram em
 * `components/dashboard/commissions/`.
 */
export default function ComissoesPage() {
  const { toast } = useToast();
  const { activeMembership } = useEstablishmentAuth();
  const isBarberRole = activeMembership?.role === 'BARBER';

  const [type, setType] = useState<CommissionPeriodType>('MONTHLY');
  const [anchor, setAnchor] = useState(todayISO);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [ruleModalBarberId, setRuleModalBarberId] = useState<string | null>(null);
  const [pdfBarberId, setPdfBarberId] = useState<string | null>(null);

  const shellQuery = useDashboardShellQuery();
  const timezone = shellQuery.data?.tenant.timezone ?? 'America/Sao_Paulo';

  const periodQuery = useCommissionPeriodQuery(
    type === 'WEEKLY' ? { type, anchor: weekStartOf(anchor) } : { type, anchor },
  );
  // `BARBER` não administra regras (o endpoint recusa) — pedir a lista só
  // renderia um 403 no console e nenhum ganho na tela.
  const rulesQuery = useCommissionRulesQuery({ enabled: !isBarberRole });
  const barbersQuery = useBarbersQuery();
  const closePeriod = useClosePeriodMutation();

  const period = periodQuery.data;
  const barberNames = useMemo(
    () => new Map((barbersQuery.data ?? []).map((barber) => [barber.id, barber.name])),
    [barbersQuery.data],
  );
  const findBarber = (id: string | null) =>
    id === null ? null : (period?.barbers.find((row) => row.barberId === id) ?? null);

  // Período sem UM lançamento não tem o que travar: o endpoint aceitaria a
  // chamada e não faria nada, e o dono ficaria achando que fechou algo.
  const nothingToClose = (period?.barbers ?? []).every((row) => row.extrato.length === 0);

  const handleClosePeriod = async () => {
    if (!period) return;
    const label = monthNameOf(period.month);
    // O fechamento trava o cálculo do MÊS — inclusive quando a tela está no
    // recorte semanal, e é justamente aí que a confirmação precisa dizê-lo.
    if (
      !confirm(
        `Fechar a competência de ${label}? A taxa final de cada barbeiro trava e os vales do mês são quitados.`,
      )
    ) {
      return;
    }
    try {
      await closePeriod.mutateAsync({ month: period.month });
      toast({ message: `Competência de ${label} fechada.`, tone: 'success' });
    } catch (error) {
      toast({
        message: error instanceof Error ? error.message : 'Não foi possível fechar o período.',
        tone: 'danger',
      });
    }
  };

  // A aba inteira depende de `comissoes` (Profissional+). Sem tratar o 403, um
  // tenant Essencial veria "Nenhuma comissão neste período" — mentira, e que
  // esconde o motivo real (regra 3 do enunciado).
  if (isFeatureGateError(periodQuery.error)) {
    return (
      <DashboardChrome activeKey="comissoes">
        <h1 className="sr-only">Comissões</h1>
        <FeatureLocked
          title="Disponível no plano Profissional"
          description="Comissão calculada sozinha a cada comanda fechada, com regra por barbeiro, extrato do período e fechamento com desconto de vales."
          benefits={LOCKED_BULLETS}
          minPlanLabel="Profissional"
        />
      </DashboardChrome>
    );
  }

  const columns: TableColumn<CommissionBarberSummary>[] = [
    {
      key: 'barbeiro',
      header: 'Barbeiro',
      mobile: 'title',
      render: (row) => (
        <span className="flex items-center gap-2.5">
          <Avatar name={row.barberName} size="sm" />
          <span className="font-semibold">{row.barberName}</span>
        </span>
      ),
    },
    {
      key: 'fat-servicos',
      header: 'Fat. serviços',
      align: 'right',
      mobile: 'meta',
      render: (row) => formatBRL(row.faturadoServicosCents),
    },
    {
      key: 'fat-produtos',
      header: 'Fat. produtos',
      align: 'right',
      mobile: 'meta',
      render: (row) => formatBRL(row.faturadoProdutosCents),
    },
    {
      key: 'regra',
      header: 'Regra aplicada',
      mobile: 'subtitle',
      render: (row) =>
        // Só quem administra a barbearia edita a regra: para o `BARBER` o chip
        // é um rótulo, não um botão que levaria a um 403.
        isBarberRole ? (
          <Badge tone="info">{ruleChipLabel(row)}</Badge>
        ) : (
          <button
            type="button"
            onClick={() => setRuleModalBarberId(row.barberId)}
            aria-label={`Editar a regra de comissão de ${row.barberName}`}
            className="inline-flex min-h-11 items-center rounded-full md:min-h-0"
          >
            <Badge tone="info" className="cursor-pointer hover:brightness-125">
              {ruleChipLabel(row)} ✎
            </Badge>
          </button>
        ),
    },
    {
      key: 'com-servicos',
      header: 'Comissão serviços',
      align: 'right',
      mobile: 'meta',
      render: (row) => <span className="font-semibold">{formatBRL(row.comissaoServicosCents)}</span>,
    },
    {
      key: 'com-produtos',
      header: 'Comissão produtos',
      align: 'right',
      mobile: 'meta',
      render: (row) => <span className="font-semibold">{formatBRL(row.comissaoProdutosCents)}</span>,
    },
    {
      key: 'vales',
      header: '(−) Vales',
      align: 'right',
      mobile: 'meta',
      render: (row) => {
        // Vermelho é o sinal de "isto sai do bolso": zerado não sai nada, e
        // pintar R$ 0,00 de vermelho grita um alarme que não existe.
        const tone =
          row.valeCents === 0
            ? 'text-fg-muted'
            : row.deductVales
              ? 'text-danger'
              : 'text-fg-muted line-through';
        return (
          <span
            className={`font-semibold ${tone}`}
            title={
              row.valeCents > 0 && !row.deductVales
                ? 'A regra deste barbeiro não desconta vales automaticamente.'
                : undefined
            }
          >
            {formatBRL(row.valeCents)}
          </span>
        );
      },
    },
    {
      key: 'total',
      header: 'Total a receber',
      align: 'right',
      mobile: 'meta',
      render: (row) => <span className="text-[15px] font-bold text-gold">{formatBRL(row.totalCents)}</span>,
    },
    {
      key: 'pdf',
      // O protótipo deixa este `<th>` vazio; o rótulo existe só para o leitor
      // de tela — e é ele que nomeia o botão no card mobile, onde a coluna
      // vira um item da lista de metadados.
      header: <span className="sr-only">Relatório</span>,
      align: 'right',
      mobile: 'meta',
      render: (row) => (
        <Button variant="outline" size="sm" onClick={() => setPdfBarberId(row.barberId)}>
          PDF
        </Button>
      ),
    },
  ];

  return (
    <DashboardChrome activeKey="comissoes">
      <h1 className="sr-only">Comissões</h1>

      <div className="flex flex-col gap-5">
        {/* ── Recorte, stepper e fechamento (l.1093) ────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Segmented
              label="Recorte do período"
              value={type}
              onChange={(next) => {
                setType(next);
                setExpanded(null);
              }}
              options={[
                { value: 'WEEKLY', label: 'Semanal' },
                { value: 'MONTHLY', label: 'Mensal' },
              ]}
            />

            <div className="flex shrink-0 items-center gap-0.5 rounded-[9px] border border-border bg-surface p-1">
              <StepperButton label="Período anterior" onClick={() => setAnchor((day) => shiftAnchor(day, type, -1))}>
                ‹
              </StepperButton>
              <span className="min-w-[124px] px-1 text-center text-[13px] font-semibold tabular-nums text-fg">
                {period ? periodTitle(period) : '—'}
              </span>
              <StepperButton label="Próximo período" onClick={() => setAnchor((day) => shiftAnchor(day, type, 1))}>
                ›
              </StepperButton>
            </div>
          </div>

          {/* Fechar período é ação de dono/gerente — o endpoint recusa `BARBER`. */}
          {!isBarberRole && (
            <Button
              className="whitespace-nowrap"
              title={nothingToClose ? 'Nenhuma comissão lançada neste período.' : undefined}
              disabled={!period || period.closed || nothingToClose}
              loading={closePeriod.isPending}
              onClick={() => void handleClosePeriod()}
            >
              Fechar período
            </Button>
          )}
        </div>

        {/* ── KPIs (l.1108) ─────────────────────────────────────────────── */}
        {periodQuery.isLoading ? (
          <StatGridSkeleton count={3} min={200} />
        ) : (
          period && (
            <StatGrid min={200}>
              <FinanceStat
                label={period.scoped ? 'Você tem a receber' : 'Total a pagar'}
                value={formatBRL(period.totalAPagarCents)}
                tone="gold"
              />
              <FinanceStat label="Período" value={periodRangeLabel(period)} />
              <FinanceStat label="Status">
                <Badge tone={period.closed ? 'success' : 'warning'}>
                  {period.closed ? 'Fechado' : 'Aberto'}
                </Badge>
              </FinanceStat>
            </StatGrid>
          )
        )}

        {/* ── Tabela (l.1130) ───────────────────────────────────────────── */}
        {periodQuery.isLoading ? (
          <Skeleton className="h-64 rounded-xl" />
        ) : periodQuery.isError ? (
          <BlockError label="as comissões do período" onRetry={() => void periodQuery.refetch()} />
        ) : (
          <Panel>
            <ResponsiveTable
              columns={columns}
              rows={period?.barbers ?? []}
              getRowKey={(row) => row.barberId}
              caption="Comissão por barbeiro no período"
              expansion={{
                isExpanded: (row) => expanded === row.barberId,
                onToggle: (row) =>
                  setExpanded((current) => (current === row.barberId ? null : row.barberId)),
                getLabel: (row) => `Ver o extrato de atendimentos de ${row.barberName}`,
                render: (row) => <Extrato barber={row} month={period?.month ?? ''} timezone={timezone} />,
              }}
              empty={
                <EmptyState
                  message="Nenhuma comissão neste período"
                  description={
                    period?.scoped
                      ? 'Suas comissões aparecem aqui assim que uma comanda que você atendeu for fechada.'
                      : 'As comissões nascem no fechamento das comandas. Feche uma em Comandas e ela aparece aqui.'
                  }
                />
              }
            />
          </Panel>
        )}
      </div>

      <RuleModal
        open={ruleModalBarberId !== null}
        onClose={() => setRuleModalBarberId(null)}
        barber={findBarber(ruleModalBarberId)}
        rules={rulesQuery.data ?? []}
        barberNames={barberNames}
      />

      <PdfModal
        open={pdfBarberId !== null}
        onClose={() => setPdfBarberId(null)}
        barber={findBarber(pdfBarberId)}
        period={period}
        timezone={timezone}
      />
    </DashboardChrome>
  );
}

/** `‹` / `›` do stepper — 44px de alvo no dedo, 28px no mouse. */
function StepperButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex size-11 items-center justify-center rounded-md text-[15px] font-semibold text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold md:size-7"
    >
      {children}
    </button>
  );
}

/** "Extrato de atendimentos" — a linha que abre sob o barbeiro (l.1170). */
function Extrato({
  barber,
  month,
  timezone,
}: {
  barber: CommissionBarberSummary;
  month: string;
  timezone: string;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-muted">
        Extrato de atendimentos
      </p>

      {barber.extrato.length === 0 ? (
        <p className="text-[13px] text-fg-muted">Nenhum atendimento neste período.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[460px] border-collapse text-left">
            <thead>
              <tr>
                <th className="py-1.5 pr-3 text-[11px] font-semibold text-fg-muted">Data</th>
                <th className="py-1.5 pr-3 text-[11px] font-semibold text-fg-muted">Cliente</th>
                <th className="py-1.5 pr-3 text-[11px] font-semibold text-fg-muted">Serviço</th>
                <th className="py-1.5 pr-3 text-right text-[11px] font-semibold text-fg-muted">Valor</th>
                <th className="py-1.5 text-right text-[11px] font-semibold text-fg-muted">% aplicado</th>
              </tr>
            </thead>
            <tbody>
              {barber.extrato.map((entry, index) => (
                <tr key={index}>
                  <td className="whitespace-nowrap py-1.5 pr-3 text-[13px] text-fg-muted">
                    {dayLabel(entry.date, timezone)}
                  </td>
                  <td className="py-1.5 pr-3 text-[13px] font-medium text-fg">{entry.clientName}</td>
                  <td className="py-1.5 pr-3 text-[13px] text-fg-muted">
                    {entry.itemName}
                    {/* Produto e serviço convivem na mesma coluna do protótipo;
                        o selo é o que diz por que a taxa é outra. */}
                    {entry.kind === 'PRODUCT' && (
                      <span className="ml-1.5 rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                        produto
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap py-1.5 pr-3 text-right text-[13px] font-medium tabular-nums text-fg">
                    {formatBRL(entry.baseCents)}
                  </td>
                  <td className="whitespace-nowrap py-1.5 text-right text-[13px] font-semibold tabular-nums text-gold">
                    {percentLabel(entry.percentBps)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-fg-muted">{extractNote(barber, monthNameOf(month))}</p>
    </div>
  );
}
