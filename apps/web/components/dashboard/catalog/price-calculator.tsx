'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  IconButton,
  Input,
  PlusIcon,
  Skeleton,
  TrashIcon,
  centsToInput,
  cn,
  inputToCents,
  useToast,
} from '@barbervp/ui';
import {
  PRICE_CALC_LIMITS,
  computePriceCalculator,
  formatBRL,
  type PriceCalculatorConfig,
  type PriceCalculatorState,
} from '@barbervp/types';
import { BlockError } from '@/components/dashboard/blocks';
import {
  usePriceCalculatorQuery,
  useSavePriceCalculatorMutation,
} from '@/lib/dashboard/api/catalog';

/** Uma linha de custo fixo em edição — o valor vive como texto até virar centavos. */
interface FixedCostDraft {
  key: string;
  name: string;
  amount: string;
}

let draftSeq = 0;
const nextKey = () => `draft-${(draftSeq += 1)}`;

/**
 * Sub-aba "Calculadora de preço" (`Dashboard.dc.html` l.1856–2022) — Avançado.
 *
 * Os números da coluna da direita saem de `computePriceCalculator`, a MESMA
 * função pura que a API roda ao gravar. Recalcular no cliente é o que mantém
 * os dois sliders instantâneos; a fonte da verdade continua sendo o servidor,
 * que devolve o resultado dele a cada `PUT` — se as duas contas divergissem,
 * a divergência apareceria no primeiro salvamento, e não em silêncio.
 */
export function PriceCalculator() {
  const { toast } = useToast();
  const query = usePriceCalculatorQuery();
  const save = useSavePriceCalculatorMutation();

  const [draft, setDraft] = useState<FixedCostDraft[] | null>(null);
  const [custoVariavel, setCustoVariavel] = useState('0,00');
  const [comissao, setComissao] = useState('0');
  const [atendimentos, setAtendimentos] = useState<number>(PRICE_CALC_LIMITS.atendimentosMin);
  const [margem, setMargem] = useState(0);
  const [precoPraticado, setPrecoPraticado] = useState('0,00');

  // O servidor mandou; o rascunho ainda não foi tocado. Serve para não
  // sobrescrever a edição em curso quando o `refetch` chega.
  const hydratedFrom = useRef<PriceCalculatorState | null>(null);

  useEffect(() => {
    const data = query.data;
    if (!data || hydratedFrom.current === data) return;
    hydratedFrom.current = data;
    setDraft(data.fixedCosts.map((cost) => ({ key: cost.id, name: cost.name, amount: centsToInput(cost.amountCents) })));
    setCustoVariavel(centsToInput(data.custoVariavelCents));
    setComissao(String(data.comissaoMediaBps / 100));
    setAtendimentos(data.atendimentosMes);
    setMargem(data.margemBps);
    setPrecoPraticado(centsToInput(data.precoPraticadoCents));
  }, [query.data]);

  const config = useMemo<PriceCalculatorConfig>(
    () => ({
      fixedCosts: (draft ?? []).map((cost) => ({
        id: cost.key,
        name: cost.name,
        amountCents: inputToCents(cost.amount),
      })),
      custoVariavelCents: inputToCents(custoVariavel),
      comissaoMediaBps: Math.round(clamp(Number(comissao.replace(',', '.')) || 0, 0, 100) * 100),
      atendimentosMes: atendimentos,
      margemBps: margem,
      precoPraticadoCents: inputToCents(precoPraticado),
    }),
    [draft, custoVariavel, comissao, atendimentos, margem, precoPraticado],
  );

  const result = useMemo(() => computePriceCalculator(config), [config]);

  if (query.isPending) return <CalculatorSkeleton />;
  if (query.isError) {
    return <BlockError label="a calculadora de preço" onRetry={() => void query.refetch()} />;
  }

  const submit = async () => {
    const named = config.fixedCosts.filter((cost) => cost.name.trim().length > 0);
    try {
      await save.mutateAsync({
        fixedCosts: named.map((cost) => ({ name: cost.name.trim(), amountCents: cost.amountCents })),
        custoVariavelCents: config.custoVariavelCents,
        comissaoMediaBps: config.comissaoMediaBps,
        atendimentosMes: config.atendimentosMes,
        margemBps: config.margemBps,
        precoPraticadoCents: config.precoPraticadoCents,
      });
      toast({ message: 'Calculadora salva.', tone: 'success' });
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Não foi possível salvar.', tone: 'danger' });
    }
  };

  const patchCost = (key: string, patch: Partial<FixedCostDraft>) =>
    setDraft((current) => (current ?? []).map((cost) => (cost.key === key ? { ...cost, ...patch } : cost)));

  return (
    <div className="flex flex-col gap-5">
      {/* O desenho é 1fr 1fr (l.1857); abaixo de lg vira coluna única, senão
          a lista de custos e os KPIs ficam ilegíveis lado a lado no tablet. */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <section className="flex flex-col gap-[18px] rounded-xl border border-border bg-surface p-5">
          <h3 className="font-display text-[15px] font-semibold text-fg">Custos e parâmetros</h3>

          <div>
            <p className="mb-2 text-[13px] font-medium text-fg-muted">Custos fixos mensais</p>
            <div className="flex flex-col gap-2">
              {(draft ?? []).map((cost) => (
                <div key={cost.key} className="flex items-center gap-2">
                  <Input
                    aria-label="Nome do custo fixo"
                    placeholder="Custo"
                    className="min-w-0 flex-1"
                    value={cost.name}
                    onChange={(event) => patchCost(cost.key, { name: event.target.value })}
                  />
                  <Input
                    aria-label={`Valor de ${cost.name || 'custo fixo'}`}
                    inputMode="decimal"
                    placeholder="R$"
                    className="w-28 shrink-0"
                    value={cost.amount}
                    onChange={(event) => patchCost(cost.key, { amount: event.target.value })}
                  />
                  <IconButton
                    aria-label={`Remover ${cost.name || 'custo fixo'}`}
                    variant="ghost"
                    onClick={() => setDraft((current) => (current ?? []).filter((row) => row.key !== cost.key))}
                  >
                    <TrashIcon size={16} />
                  </IconButton>
                </div>
              ))}

              {(draft ?? []).length === 0 && (
                <p className="rounded-lg border border-dashed border-border px-3 py-4 text-[13px] text-fg-muted">
                  Nenhum custo fixo cadastrado. Some aluguel, energia, internet e o que mais sai
                  todo mês — é o que o preço mínimo precisa cobrir.
                </p>
              )}

              <Button
                variant="ghost"
                size="sm"
                className="self-start"
                iconLeft={<PlusIcon size={15} />}
                onClick={() => setDraft((current) => [...(current ?? []), { key: nextKey(), name: '', amount: '0,00' }])}
              >
                Adicionar
              </Button>
            </div>
          </div>

          <hr className="border-border" />

          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] font-medium text-fg">Custo variável por atendimento</span>
            <Input
              aria-label="Custo variável por atendimento em reais"
              inputMode="decimal"
              className="w-28 shrink-0"
              value={custoVariavel}
              onChange={(event) => setCustoVariavel(event.target.value)}
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] font-medium text-fg">Comissão média</span>
            <div className="flex shrink-0 items-center gap-1.5">
              <Input
                aria-label="Comissão média em porcentagem"
                inputMode="decimal"
                className="w-20"
                value={comissao}
                onChange={(event) => setComissao(event.target.value)}
              />
              <span className="text-[13px] text-fg-muted">%</span>
            </div>
          </div>

          <SliderRow
            label="Atendimentos estimados/mês"
            display={String(atendimentos)}
            min={PRICE_CALC_LIMITS.atendimentosMin}
            max={PRICE_CALC_LIMITS.atendimentosMax}
            step={PRICE_CALC_LIMITS.atendimentosStep}
            value={atendimentos}
            onChange={setAtendimentos}
          />

          <SliderRow
            label="Margem desejada"
            display={`${margem / 100}%`}
            min={PRICE_CALC_LIMITS.margemMinBps}
            max={PRICE_CALC_LIMITS.margemMaxBps}
            step={100}
            value={margem}
            onChange={setMargem}
          />
        </section>

        <div className="flex min-w-0 flex-col gap-4">
          <section className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 sm:flex-row sm:justify-between">
            <div className="flex flex-1 flex-col gap-1">
              <span className="text-xs font-medium text-fg-muted">Custo fixo rateado / atendimento</span>
              <span className="font-display text-xl font-bold tabular-nums text-fg">
                {formatBRL(result.custoFixoRateadoCents)}
              </span>
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <span className="text-xs font-medium text-fg-muted">Preço mínimo sugerido</span>
              <span className="font-display text-[26px] font-bold tabular-nums text-gold">
                {formatBRL(result.precoMinimoCents)}
              </span>
            </div>
          </section>

          <section className="flex flex-col gap-3.5 rounded-xl border border-border bg-surface p-5">
            <h3 className="font-display text-[15px] font-semibold text-fg">
              {result.pontoEquilibrio != null
                ? `Ponto de equilíbrio: ${result.pontoEquilibrio} atendimentos/mês`
                : 'Ponto de equilíbrio: não existe neste preço'}
            </h3>

            {result.pontoEquilibrio != null ? (
              <>
                <div className="relative h-2.5 rounded-full bg-border">
                  <div
                    className="absolute left-0 top-0 h-2.5 rounded-full bg-info"
                    style={{ width: `${result.breakEvenBarPct}%` }}
                  />
                  <div
                    className="absolute -top-1 h-[18px] w-0.5 bg-gold"
                    style={{ left: `${result.estimadosMarkerPct}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-fg-muted">
                  <span>Ponto de equilíbrio</span>
                  <span>{atendimentos} estimados</span>
                </div>
              </>
            ) : (
              // O protótipo desenhava "—" e uma barra vazia. Um traço não
              // explica que o preço praticado não paga nem a comissão do corte.
              <p className="text-[13px] text-fg-muted">
                A {formatBRL(config.precoPraticadoCents)}, cada atendimento deixa{' '}
                {formatBRL(result.contribuicaoMarginalCents)} depois da comissão e do custo variável —
                nenhum volume paga os custos fixos. Suba o preço ou reveja a comissão.
              </p>
            )}
          </section>

          <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5">
            <h3 className="text-sm font-semibold text-fg">Simulação</h3>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-[13px] text-fg-muted">Com preço de R$</span>
              <Input
                aria-label="Preço praticado na simulação"
                inputMode="decimal"
                className="w-24"
                value={precoPraticado}
                onChange={(event) => setPrecoPraticado(event.target.value)}
              />
              <span className="text-[13px] text-fg-muted">
                e {atendimentos} atendimentos → lucro líquido estimado de
              </span>
              <span
                className={cn(
                  'text-[15px] font-bold tabular-nums',
                  result.lucroLiquidoCents >= 0 ? 'text-success' : 'text-danger',
                )}
              >
                {formatBRL(result.lucroLiquidoCents)}/mês
              </span>
            </div>
          </section>
        </div>
      </div>

      {/* O protótipo não salvava nada, então também não tinha este botão. Sem
          ele a calculadora voltaria a ser um rascunho que some ao trocar de aba. */}
      <div className="flex justify-end">
        <Button loading={save.isPending} onClick={() => void submit()}>
          Salvar calculadora
        </Button>
      </div>
    </div>
  );
}

function SliderRow({
  label,
  display,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  display: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label className="text-[13px] font-medium text-fg" htmlFor={`slider-${label}`}>
          {label}
        </label>
        <span className="text-sm font-bold tabular-nums text-gold">{display}</span>
      </div>
      <input
        id={`slider-${label}`}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-11 w-full cursor-pointer accent-gold"
      />
    </div>
  );
}

function CalculatorSkeleton() {
  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
      <Skeleton className="h-[520px] rounded-xl" />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-[104px] rounded-xl" />
        <Skeleton className="h-[132px] rounded-xl" />
        <Skeleton className="h-[104px] rounded-xl" />
      </div>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
