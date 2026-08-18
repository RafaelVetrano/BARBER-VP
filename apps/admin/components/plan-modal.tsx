'use client';

import { useEffect, useState } from 'react';
import { Button, Checkbox, Input, Modal, Select, useToast } from '@barbervp/ui';
import { FEATURE_KEYS, type AdminPlanItem, type FeatureKey } from '@barbervp/types';
import { useSaveAdminPlanMutation } from '../lib/api/plans';

const FEATURE_LABELS: Record<FeatureKey, string> = {
  contasPagarReceber: 'Contas a pagar/receber',
  vales: 'Vales',
  comissoes: 'Comissões automáticas',
  fidelidadePontos: 'Fidelidade (pontos)',
  fidelidadeSorteios: 'Sorteio automático',
  whatsappCompleto: 'WhatsApp completo',
  relatoriosAvancados: 'Relatórios avançados',
  fidelidadeAssinaturas: 'Assinaturas de clientes',
  multiUnidades: 'Múltiplas unidades',
  calculadoraPreco: 'Calculadora de preço',
};

export function PlanModal({ open, onClose, plan }: { open: boolean; onClose: () => void; plan: AdminPlanItem | null }) {
  const { toast } = useToast();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [priceInput, setPriceInput] = useState('');
  const [tier, setTier] = useState('0');
  const [maxBarbers, setMaxBarbers] = useState('');
  const [unlimited, setUnlimited] = useState(false);
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const save = useSaveAdminPlanMutation();

  useEffect(() => {
    if (!open) return;
    setCode(plan?.code ?? '');
    setName(plan?.name ?? '');
    setPriceInput(plan ? (plan.priceCents / 100).toFixed(2) : '');
    setTier(plan ? String(plan.tier) : '0');
    setMaxBarbers(plan?.maxBarbers ? String(plan.maxBarbers) : '');
    setUnlimited(plan ? plan.maxBarbers === null : false);
    setFeatures(plan?.features ?? {});
  }, [open, plan]);

  const canSubmit = code.trim().length > 1 && name.trim().length > 1 && priceInput.trim().length > 0;

  const submit = async () => {
    if (!canSubmit) return;
    try {
      await save.mutateAsync({
        id: plan?.id,
        dto: {
          code: code.trim(),
          name: name.trim(),
          priceCents: Math.round(Number(priceInput.replace(',', '.')) * 100),
          tier: Number(tier),
          maxBarbers: unlimited ? null : Number(maxBarbers) || null,
          features,
        },
      });
      toast({ message: 'Plano salvo.', tone: 'success' });
      onClose();
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Não foi possível salvar.', tone: 'danger' });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={plan ? 'Editar plano' : 'Novo plano'}
      footer={
        <Button fullWidth loading={save.isPending} disabled={!canSubmit} onClick={() => void submit()}>
          Salvar plano
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Código" placeholder="ex.: essencial" value={code} onChange={(e) => setCode(e.target.value)} disabled={!!plan} />
          <Input label="Nome" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Preço mensal (R$)" inputMode="decimal" value={priceInput} onChange={(e) => setPriceInput(e.target.value)} />
          <Select
            label="Tier"
            value={tier}
            onChange={(e) => setTier(e.target.value)}
            options={[
              { value: '0', label: 'Essencial (0)' },
              { value: '1', label: 'Profissional (1)' },
              { value: '2', label: 'Avançado (2)' },
            ]}
          />
        </div>
        <div className="flex items-end gap-3">
          <Input label="Máximo de barbeiros" type="number" min={1} value={maxBarbers} disabled={unlimited} onChange={(e) => setMaxBarbers(e.target.value)} />
          <label className="mb-2.5 flex items-center gap-2">
            <Checkbox checked={unlimited} onChange={(e) => setUnlimited(e.target.checked)} />
            <span className="text-sm text-fg">Ilimitado</span>
          </label>
        </div>

        <div className="flex flex-col gap-1.5 rounded-xl border border-border p-2">
          <p className="px-1 text-[13px] font-semibold text-fg-muted">Features do plano</p>
          {FEATURE_KEYS.map((key) => (
            <label key={key} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-surface-2">
              <Checkbox
                checked={features[key] === true}
                onChange={(e) => setFeatures((current) => ({ ...current, [key]: e.target.checked }))}
              />
              <span className="text-sm text-fg">{FEATURE_LABELS[key]}</span>
            </label>
          ))}
        </div>
      </div>
    </Modal>
  );
}
