'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Input, Modal, Radio, Switch, useToast } from '@barbervp/ui';
import type { CommissionBarberSummary, CommissionRuleItem, CommissionTierDto } from '@barbervp/types';
import { inputToCents } from '@/components/dashboard/finance/finance-shared';
import { useSaveCommissionRuleMutation } from '@/lib/dashboard/api/commissions';

export interface RuleModalProps {
  open: boolean;
  onClose: () => void;
  /** Linha da tabela em que o chip "Regra aplicada ✎" foi clicado. */
  barber: CommissionBarberSummary | null;
  /** Todas as regras da barbearia — para saber com quem esta é compartilhada. */
  rules: CommissionRuleItem[];
  /** Nomes por id, para avisar quem mais é afetado pela edição. */
  barberNames: Map<string, string>;
}

/** Linha do editor de faixas. `upToCents: null` é a última, sempre aberta. */
interface TierRow {
  upTo: string;
  percent: string;
}

/**
 * `modalRegrasOpen` (`Dashboard.dc.html` l.4154) — os dois modos do protótipo:
 * **Percentual fixo** (l.4167) e **Faixas progressivas** (l.4184).
 *
 * O protótipo trata a regra como se fosse do barbeiro ("Regras de comissão ·
 * Fulano"), mas no modelo ela é uma entidade compartilhada: a mesma "Comissão
 * padrão" pode reger a equipe inteira. Em vez de silenciosamente duplicar a
 * regra por barbeiro (o que faria a barbearia acumular dezenas de regras
 * iguais), o modal edita a regra REAL e avisa, na cara, quem mais muda junto.
 * Barbeiro sem regra ganha uma nova, nomeada com o próprio nome.
 */
export function RuleModal({ open, onClose, barber, rules, barberNames }: RuleModalProps) {
  const { toast } = useToast();
  const save = useSaveCommissionRuleMutation();

  const rule = useMemo(
    () => (barber?.ruleId ? (rules.find((item) => item.id === barber.ruleId) ?? null) : null),
    [barber?.ruleId, rules],
  );

  const [type, setType] = useState<'FIXED' | 'TIERED'>('FIXED');
  const [pctServicos, setPctServicos] = useState('');
  const [pctProdutos, setPctProdutos] = useState('');
  const [tiers, setTiers] = useState<TierRow[]>([]);
  const [deductVales, setDeductVales] = useState(true);

  useEffect(() => {
    if (!open || !barber) return;
    setType(rule?.type ?? 'FIXED');
    setPctServicos(bpsToInput(rule?.percentBps ?? null));
    setPctProdutos(bpsToInput(rule?.percentProdutosBps ?? 0));
    setDeductVales(rule?.deductVales ?? true);
    setTiers(
      rule?.tiers && rule.tiers.length > 0
        ? rule.tiers.map((tier) => ({
            upTo: tier.upToCents === null ? '' : centsToInput(tier.upToCents),
            percent: bpsToInput(tier.percentBps),
          }))
        : // Uma faixa fechada e a aberta: o mínimo que já é uma progressão
          // válida, e o mesmo desenho de três linhas do protótipo quando o
          // dono clicar em "+ Adicionar faixa".
          [
            { upTo: '', percent: '' },
            { upTo: '', percent: '' },
          ],
    );
  }, [open, barber, rule]);

  /** Quem MAIS é regido por esta regra — o aviso do parágrafo da classe. */
  const shared = (rule?.barberIds ?? [])
    .filter((id) => id !== barber?.barberId)
    .map((id) => barberNames.get(id) ?? 'outro barbeiro');

  const boundedTiers = tiers.slice(0, -1);
  const openTier = tiers.at(-1);

  const problem = validate(type, pctServicos, pctProdutos, tiers);

  const submit = async () => {
    if (!barber || problem) return;
    try {
      await save.mutateAsync({
        id: rule?.id,
        dto: {
          name: rule?.name ?? `Comissão de ${barber.barberName}`,
          type,
          percentBps: type === 'FIXED' ? inputToBps(pctServicos) : undefined,
          tiers:
            type === 'TIERED'
              ? tiers.map<CommissionTierDto>((row, index) => ({
                  upToCents: index === tiers.length - 1 ? null : inputToCents(row.upTo),
                  percentBps: inputToBps(row.percent),
                }))
              : undefined,
          percentProdutosBps: inputToBps(pctProdutos),
          deductVales,
          // Preserva o vínculo dos outros barbeiros: `barberIds` SUBSTITUI a
          // lista no servidor, então omitir os colegas os desligaria da regra.
          barberIds: [...new Set([...(rule?.barberIds ?? []), barber.barberId])],
        },
      });
      toast({ message: 'Regra salva.', tone: 'success' });
      onClose();
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Não foi possível salvar.', tone: 'danger' });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={barber ? `Regras de comissão · ${barber.barberName}` : 'Regras de comissão'}
      footer={
        <div className="flex justify-end gap-2.5">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={save.isPending} disabled={problem !== null} onClick={() => void submit()}>
            Salvar
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {shared.length > 0 && (
          <p className="rounded-control border border-gold/35 bg-gold/10 px-3.5 py-2.5 text-[13px] text-gold">
            Esta regra também vale para {formatList(shared)}. Salvar muda a comissão de{' '}
            {shared.length === 1 ? 'os dois' : 'todos eles'}.
          </p>
        )}

        {/* ── Percentual fixo (l.4162) ─────────────────────────────────── */}
        <div className="flex flex-col gap-2.5">
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5">
            <Radio name="bvp-rule-type" checked={type === 'FIXED'} onChange={() => setType('FIXED')} />
            <span className="text-sm font-medium text-fg">Percentual fixo</span>
          </label>

          {type === 'FIXED' && (
            <div className="flex flex-col gap-3 pl-7 sm:flex-row">
              <Input
                label="% serviços"
                inputMode="decimal"
                value={pctServicos}
                onChange={(event) => setPctServicos(event.target.value)}
                className="flex-1"
              />
              <Input
                label="% produtos"
                inputMode="decimal"
                value={pctProdutos}
                onChange={(event) => setPctProdutos(event.target.value)}
                className="flex-1"
              />
            </div>
          )}

          {/* ── Faixas progressivas (l.4179) ───────────────────────────── */}
          <label className="mt-1 flex min-h-11 cursor-pointer items-center gap-2.5">
            <Radio name="bvp-rule-type" checked={type === 'TIERED'} onChange={() => setType('TIERED')} />
            <span className="text-sm font-medium text-fg">Faixas progressivas</span>
          </label>

          {type === 'TIERED' && (
            <div className="flex flex-col gap-2 pl-7">
              <p className="text-xs text-fg-muted">
                A faixa é escolhida pelo faturamento de SERVIÇOS acumulado no mês.
              </p>

              {boundedTiers.map((row, index) => (
                <div key={index} className="flex flex-wrap items-center gap-2">
                  <span className="whitespace-nowrap text-[13px] text-fg-muted">Até R$</span>
                  <input
                    inputMode="decimal"
                    aria-label={`Teto da faixa ${index + 1}`}
                    value={row.upTo}
                    onChange={(event) => updateTier(setTiers, index, { upTo: event.target.value })}
                    className="h-11 w-24 rounded-control border border-border bg-surface-2 px-2.5 text-sm text-fg outline-none focus-visible:border-gold md:h-9"
                  />
                  <span aria-hidden="true" className="text-[13px] text-fg-muted">
                    →
                  </span>
                  <input
                    inputMode="decimal"
                    aria-label={`Percentual da faixa ${index + 1}`}
                    value={row.percent}
                    onChange={(event) => updateTier(setTiers, index, { percent: event.target.value })}
                    className="h-11 w-16 rounded-control border border-border bg-surface-2 px-2.5 text-sm text-fg outline-none focus-visible:border-gold md:h-9"
                  />
                  <span className="text-[13px] text-fg-muted">%</span>
                  {/* A faixa aberta nunca sai, e uma regra precisa de pelo
                      menos uma fechada para ser uma progressão. */}
                  {boundedTiers.length > 1 && (
                    <button
                      type="button"
                      aria-label={`Remover a faixa ${index + 1}`}
                      onClick={() => setTiers((current) => current.filter((_, i) => i !== index))}
                      className="ml-auto flex size-11 items-center justify-center rounded-lg text-fg-muted transition-colors hover:text-danger md:size-6"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}

              {openTier && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="whitespace-nowrap text-[13px] text-fg-muted">Acima disso</span>
                  <span aria-hidden="true" className="text-[13px] text-fg-muted">
                    →
                  </span>
                  <input
                    inputMode="decimal"
                    aria-label="Percentual acima da última faixa"
                    value={openTier.percent}
                    onChange={(event) => updateTier(setTiers, tiers.length - 1, { percent: event.target.value })}
                    className="h-11 w-16 rounded-control border border-border bg-surface-2 px-2.5 text-sm text-fg outline-none focus-visible:border-gold md:h-9"
                  />
                  <span className="text-[13px] text-fg-muted">%</span>
                </div>
              )}

              <button
                type="button"
                onClick={() =>
                  setTiers((current) => [...current.slice(0, -1), { upTo: '', percent: '' }, ...current.slice(-1)])
                }
                className="mt-1 self-start rounded-lg py-2 text-[13px] font-semibold text-gold hover:underline"
              >
                + Adicionar faixa
              </button>

              <div className="mt-1">
                <Input
                  label="% produtos (todas as faixas)"
                  inputMode="decimal"
                  value={pctProdutos}
                  onChange={(event) => setPctProdutos(event.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Descontar vales (l.4212) ─────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3.5">
          <span className="text-[13px] font-medium text-fg">Descontar vales automaticamente</span>
          <Switch
            checked={deductVales}
            onChange={(event) => setDeductVales(event.target.checked)}
            aria-label="Descontar vales automaticamente"
          />
        </div>

        {problem && <p className="text-[13px] text-danger">{problem}</p>}
      </div>
    </Modal>
  );
}

function updateTier(
  setTiers: (updater: (current: TierRow[]) => TierRow[]) => void,
  index: number,
  patch: Partial<TierRow>,
): void {
  setTiers((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
}

/** `4000` → `40`; `4250` → `42,5`. */
function bpsToInput(bps: number | null): string {
  if (bps === null) return '';
  const percent = bps / 100;
  return Number.isInteger(percent) ? String(percent) : String(percent).replace('.', ',');
}

function inputToBps(input: string): number {
  const value = Number(input.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

function centsToInput(cents: number): string {
  const value = cents / 100;
  return Number.isInteger(value) ? String(value) : String(value).replace('.', ',');
}

/** Uma frase só, e a primeira que o dono precisa corrigir. */
function validate(
  type: 'FIXED' | 'TIERED',
  pctServicos: string,
  pctProdutos: string,
  tiers: TierRow[],
): string | null {
  const produtos = inputToBps(pctProdutos);
  if (pctProdutos.trim() !== '' && (produtos < 0 || produtos > 10_000)) {
    return 'O percentual de produtos precisa ficar entre 0 e 100.';
  }

  if (type === 'FIXED') {
    const servicos = inputToBps(pctServicos);
    if (pctServicos.trim() === '') return 'Informe o percentual sobre serviços.';
    if (servicos <= 0 || servicos > 10_000) return 'O percentual de serviços precisa ficar entre 0 e 100.';
    return null;
  }

  if (tiers.length < 2) return 'Uma regra por faixas precisa de pelo menos duas faixas.';

  let previous = 0;
  for (const [index, row] of tiers.entries()) {
    const percent = inputToBps(row.percent);
    if (row.percent.trim() === '' || percent <= 0 || percent > 10_000) {
      return 'Toda faixa precisa de um percentual entre 0 e 100.';
    }
    if (index === tiers.length - 1) break;

    const upTo = inputToCents(row.upTo);
    if (upTo <= 0) return 'Toda faixa fechada precisa de um teto em reais.';
    // Tetos fora de ordem deixariam uma faixa inalcançável — a de baixo
    // captura sempre primeiro, e a de cima nunca seria aplicada.
    if (upTo <= previous) return 'Os tetos das faixas precisam estar em ordem crescente.';
    previous = upTo;
  }

  return null;
}

/** `Carlos e Diego`, `Carlos, Diego e Enzo`. */
function formatList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} e ${names.at(-1)}`;
}
