'use client';

import { useEffect, useState } from 'react';
import { Button, Checkbox, Input, Modal, Select, useToast } from '@barbervp/ui';
import type { CommissionRuleItem, CommissionTierDto } from '@barbervp/types';
import { useSaveCommissionRuleMutation } from '@/lib/dashboard/api/commissions';

export interface RuleModalProps {
  open: boolean;
  onClose: () => void;
  rule: CommissionRuleItem | null;
  barbers: Array<{ id: string; name: string }>;
}

const DEFAULT_TIERS: CommissionTierDto[] = [
  { upToCents: 500_000, percentBps: 4_000 },
  { upToCents: 800_000, percentBps: 4_500 },
  { upToCents: null, percentBps: 5_000 },
];

export function RuleModal({ open, onClose, rule, barbers }: RuleModalProps) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [type, setType] = useState<'FIXED' | 'TIERED'>('FIXED');
  const [percent, setPercent] = useState('40');
  const [tiers, setTiers] = useState<CommissionTierDto[]>(DEFAULT_TIERS);
  const [barberIds, setBarberIds] = useState<string[]>([]);
  const save = useSaveCommissionRuleMutation();

  useEffect(() => {
    if (!open) return;
    setName(rule?.name ?? '');
    setType(rule?.type ?? 'FIXED');
    setPercent(rule?.percentBps ? String(rule.percentBps / 100) : '40');
    setTiers(rule?.tiers && rule.tiers.length > 0 ? rule.tiers : DEFAULT_TIERS);
    setBarberIds(rule?.barberIds ?? []);
  }, [open, rule]);

  const canSubmit = name.trim().length > 1;

  const submit = async () => {
    if (!canSubmit) return;
    try {
      await save.mutateAsync({
        id: rule?.id,
        dto: {
          name: name.trim(),
          type,
          percentBps: type === 'FIXED' ? Math.round((Number(percent.replace(',', '.')) || 0) * 100) : undefined,
          tiers: type === 'TIERED' ? tiers : undefined,
          barberIds,
        },
      });
      toast({ message: 'Regra salva.', tone: 'success' });
      onClose();
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Não foi possível salvar.', tone: 'danger' });
    }
  };

  const toggleBarber = (id: string) => {
    setBarberIds((current) => (current.includes(id) ? current.filter((b) => b !== id) : [...current, id]));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={rule ? 'Editar regra de comissão' : 'Nova regra de comissão'}
      footer={
        <Button fullWidth loading={save.isPending} disabled={!canSubmit} onClick={() => void submit()}>
          Salvar regra
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Input label="Nome da regra" value={name} onChange={(e) => setName(e.target.value)} />

        <Select
          label="Tipo"
          value={type}
          onChange={(e) => setType(e.target.value as 'FIXED' | 'TIERED')}
          options={[
            { value: 'FIXED', label: 'Percentual único' },
            { value: 'TIERED', label: 'Faixas por faturamento' },
          ]}
        />

        {type === 'FIXED' ? (
          <Input label="Percentual (%)" inputMode="decimal" value={percent} onChange={(e) => setPercent(e.target.value)} />
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-[13px] font-semibold text-fg-muted">Faixas por faturamento acumulado no mês</p>
            {tiers.map((tier, index) => (
              <div key={index} className="flex items-center gap-2">
                <span className="text-xs text-fg-muted">
                  {index === 0 ? 'Até' : tier.upToCents === null ? 'Acima de' : 'Até'}
                </span>
                <input
                  className="h-9 w-24 rounded-control border border-border bg-surface-2 px-2 text-sm text-fg outline-none disabled:opacity-40"
                  disabled={tier.upToCents === null}
                  value={tier.upToCents !== null ? (tier.upToCents / 100).toString() : ''}
                  onChange={(e) =>
                    setTiers((current) =>
                      current.map((t, i) => (i === index ? { ...t, upToCents: Number(e.target.value) * 100 || 0 } : t)),
                    )
                  }
                />
                <span className="text-xs text-fg-muted">→</span>
                <input
                  className="h-9 w-16 rounded-control border border-border bg-surface-2 px-2 text-sm text-fg outline-none"
                  value={(tier.percentBps / 100).toString()}
                  onChange={(e) =>
                    setTiers((current) =>
                      current.map((t, i) => (i === index ? { ...t, percentBps: Number(e.target.value) * 100 || 0 } : t)),
                    )
                  }
                />
                <span className="text-xs text-fg-muted">%</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-1.5 rounded-xl border border-border p-2">
          <p className="px-1 text-[13px] font-semibold text-fg-muted">Barbeiros nesta regra</p>
          {barbers.map((barber) => (
            <label key={barber.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-surface-2">
              <Checkbox checked={barberIds.includes(barber.id)} onChange={() => toggleBarber(barber.id)} />
              <span className="text-sm text-fg">{barber.name}</span>
            </label>
          ))}
        </div>
      </div>
    </Modal>
  );
}
