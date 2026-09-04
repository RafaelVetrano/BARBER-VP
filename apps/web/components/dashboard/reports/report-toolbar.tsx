'use client';

import {
  Avatar,
  Button,
  ChevronDownIcon,
  Popover,
  PopoverItem,
  Segmented,
  cn,
} from '@barbervp/ui';
import { REPORT_PERIOD_LABEL, REPORT_PERIOD_KEYS } from '@barbervp/types';
import type { DashboardShellUnit, ReportPeriodKey } from '@barbervp/types';

export interface ReportFilters {
  period: ReportPeriodKey;
  from: string;
  to: string;
  barberIds: string[];
  unitId: string | null;
}

export interface ReportToolbarProps {
  filters: ReportFilters;
  onChange: (next: ReportFilters) => void;
  /** Vazio ou 1 item = o filtro não aparece (o `BARBER` nunca escolhe barbeiro). */
  barbers: Array<{ id: string; name: string }>;
  /** Vazio = tenant sem multi-unidade; o seletor some, como na topbar. */
  units: DashboardShellUnit[];
  /** Fora do plano os dois botões ficam translúcidos e abrem o upsell. */
  exportLocked: boolean;
  exporting: 'pdf' | 'csv' | null;
  onExport: (format: 'pdf' | 'csv') => void;
}

const PERIOD_OPTIONS = REPORT_PERIOD_KEYS.map((key) => ({
  value: key,
  label: REPORT_PERIOD_LABEL[key],
}));

/**
 * A barra de filtros da aba (`Dashboard.dc.html` l.1231–1279): pílulas de
 * período, o intervalo personalizado, o filtro de barbeiros (multi-seleção) e
 * o de unidades, com os dois botões de exportação à direita.
 *
 * Os dois botões de exportação NÃO somem fora do plano — ficam a 50% e abrem o
 * upsell, exatamente como `exportBtnOpacity`/`exportBtnTitle` (l.6931–6932).
 * Esconder o botão esconderia também o motivo.
 */
export function ReportToolbar({
  filters,
  onChange,
  barbers,
  units,
  exportLocked,
  exporting,
  onExport,
}: ReportToolbarProps) {
  const allBarbers = filters.barberIds.length === 0;
  const barberLabel = allBarbers
    ? 'Todos os barbeiros'
    : `${filters.barberIds.length} selecionado(s)`;
  const unitLabel = units.find((unit) => unit.id === filters.unitId)?.name ?? 'Todas as unidades';

  const toggleBarber = (id: string) => {
    // Lista vazia = "todos". Desmarcar o último volta para "todos" em vez de
    // pedir um relatório de ninguém, que renderizaria a aba inteira zerada.
    const selected = allBarbers ? barbers.map((barber) => barber.id) : filters.barberIds;
    const next = selected.includes(id)
      ? selected.filter((entry) => entry !== id)
      : [...selected, id];
    onChange({
      ...filters,
      barberIds: next.length === 0 || next.length === barbers.length ? [] : next,
    });
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2.5">
        <Segmented
          label="Período do relatório"
          options={PERIOD_OPTIONS}
          value={filters.period}
          onChange={(period) => onChange({ ...filters, period })}
          // O trilho do design system é `shrink-0` (a barra da Agenda precisa
          // disso); aqui são CINCO pílulas, que a 360px não cabem numa linha —
          // o próprio protótipo põe `flex-wrap` neste trilho (l.1233).
          className="shrink flex-wrap"
        />

        {filters.period === 'custom' && (
          <div className="flex items-center gap-1.5">
            <DateInput
              label="Data inicial"
              value={filters.from}
              max={filters.to}
              onChange={(from) => onChange({ ...filters, from })}
            />
            <span className="text-xs font-medium text-fg-muted">até</span>
            <DateInput
              label="Data final"
              value={filters.to}
              min={filters.from}
              onChange={(to) => onChange({ ...filters, to })}
            />
          </div>
        )}

        {barbers.length > 1 && (
          <Popover
            label="Filtrar por barbeiro"
            title="Barbeiros"
            width={220}
            triggerClassName={triggerClasses}
            trigger={
              <>
                <span className="truncate text-[13px] font-medium">{barberLabel}</span>
                <ChevronDownIcon size={12} className="shrink-0 text-fg-muted" />
              </>
            }
          >
            {() => (
              <div className="flex flex-col gap-0.5">
                {barbers.map((barber) => {
                  const selected = allBarbers || filters.barberIds.includes(barber.id);
                  return (
                    <button
                      key={barber.id}
                      type="button"
                      role="checkbox"
                      aria-checked={selected}
                      onClick={() => toggleBarber(barber.id)}
                      className="flex items-center gap-2.5 rounded-[7px] px-2.5 py-2.5 text-left transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          'size-4 shrink-0 rounded border-[1.5px]',
                          selected ? 'border-gold bg-gold' : 'border-border',
                        )}
                      />
                      <Avatar name={barber.name} size="xs" />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg">
                        {barber.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </Popover>
        )}

        {units.length > 0 && (
          <Popover
            label="Filtrar por unidade"
            title="Unidades"
            width={220}
            triggerClassName={triggerClasses}
            trigger={
              <>
                <span className="truncate text-[13px] font-medium">{unitLabel}</span>
                <ChevronDownIcon size={12} className="shrink-0 text-fg-muted" />
              </>
            }
          >
            {(close) => (
              <div className="flex flex-col gap-0.5">
                <PopoverItem
                  selected={filters.unitId === null}
                  onSelect={() => {
                    onChange({ ...filters, unitId: null });
                    close();
                  }}
                >
                  Todas as unidades
                </PopoverItem>
                {units.map((unit) => (
                  <PopoverItem
                    key={unit.id}
                    selected={filters.unitId === unit.id}
                    onSelect={() => {
                      onChange({ ...filters, unitId: unit.id });
                      close();
                    }}
                  >
                    {unit.name}
                  </PopoverItem>
                ))}
              </div>
            )}
          </Popover>
        )}
      </div>

      <div className="flex gap-2.5">
        <Button
          variant="outline"
          className={cn(exportLocked && 'opacity-50')}
          title={exportLocked ? 'Disponível no plano Profissional' : undefined}
          loading={exporting === 'pdf'}
          onClick={() => onExport('pdf')}
        >
          Exportar PDF
        </Button>
        <Button
          className={cn(exportLocked && 'opacity-50')}
          title={exportLocked ? 'Disponível no plano Profissional' : undefined}
          loading={exporting === 'csv'}
          onClick={() => onExport('csv')}
        >
          Exportar CSV
        </Button>
      </div>
    </div>
  );
}

/** Gatilho dos dois filtros — 38px no desenho, 44px no toque abaixo de `md`. */
const triggerClasses =
  'flex h-11 items-center gap-2 rounded-[9px] border border-border bg-surface px-3 text-fg md:h-[38px]';

function DateInput({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: string;
  min?: string;
  max?: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      type="date"
      aria-label={label}
      value={value}
      min={min}
      max={max}
      onChange={(event) => onChange(event.target.value)}
      className="h-11 rounded-lg border border-border bg-surface px-2.5 text-xs font-medium text-fg [color-scheme:dark] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold md:h-9"
    />
  );
}
