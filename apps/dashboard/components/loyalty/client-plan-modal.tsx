'use client';

import { useEffect, useState } from 'react';
import { Button, Input, Modal, Select, useToast } from '@barbervp/ui';
import { parseBRLToCents } from '@barbervp/types';
import type { ClientPlanAdminItem, ServiceListItem } from '@barbervp/types';
import { useSaveClientPlanMutation } from '../../lib/api/loyalty';

export interface ClientPlanModalProps {
  open: boolean;
  onClose: () => void;
  plan: ClientPlanAdminItem | null;
  services: ServiceListItem[];
}

interface ItemRow {
  serviceId: string;
  quota: string;
}

export function ClientPlanModal({ open, onClose, plan, services }: ClientPlanModalProps) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [priceInput, setPriceInput] = useState('');
  const [billingDay, setBillingDay] = useState('5');
  const [items, setItems] = useState<ItemRow[]>([{ serviceId: services[0]?.id ?? '', quota: '4' }]);
  const save = useSaveClientPlanMutation();

  useEffect(() => {
    if (!open) return;
    setName(plan?.name ?? '');
    setPriceInput(plan ? (plan.priceCents / 100).toFixed(2) : '');
    setBillingDay(plan ? String(plan.billingDay) : '5');
    setItems(
      plan && plan.items.length > 0
        ? plan.items.map((item) => ({ serviceId: item.serviceId, quota: String(item.quota) }))
        : [{ serviceId: services[0]?.id ?? '', quota: '4' }],
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, plan]);

  const canSubmit = name.trim().length > 1 && priceInput.trim() && items.every((item) => item.serviceId && item.quota);

  const submit = async () => {
    if (!canSubmit) return;
    try {
      await save.mutateAsync({
        id: plan?.id,
        dto: {
          name: name.trim(),
          priceCents: parseBRLToCents(priceInput),
          billingDay: Number(billingDay) || 5,
          items: items.map((item) => ({ serviceId: item.serviceId, quota: Number(item.quota) || 1 })),
        },
      });
      toast({ message: 'Plano salvo.', tone: 'success' });
      onClose();
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Não foi possível salvar.', tone: 'danger' });
    }
  };

  const updateItem = (index: number, patch: Partial<ItemRow>) => {
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={plan ? 'Editar plano' : 'Novo plano de assinatura'}
      footer={
        <Button fullWidth loading={save.isPending} disabled={!canSubmit} onClick={() => void submit()}>
          Salvar plano
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Input label="Nome do plano" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Preço mensal" placeholder="0,00" inputMode="decimal" value={priceInput} onChange={(e) => setPriceInput(e.target.value)} />
          <Input label="Dia da cobrança" type="number" min={1} max={28} value={billingDay} onChange={(e) => setBillingDay(e.target.value)} />
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-[13px] font-semibold text-fg-muted">Serviços inclusos por mês</p>
          {items.map((item, index) => (
            <div key={index} className="flex items-end gap-2">
              <Select
                label="Serviço"
                value={item.serviceId}
                onChange={(e) => updateItem(index, { serviceId: e.target.value })}
                options={services.map((s) => ({ value: s.id, label: s.name }))}
              />
              <Input label="Qtd/mês" type="number" min={1} value={item.quota} onChange={(e) => updateItem(index, { quota: e.target.value })} />
              {items.length > 1 && (
                <Button variant="ghost" size="sm" onClick={() => setItems((current) => current.filter((_, i) => i !== index))}>
                  Remover
                </Button>
              )}
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setItems((current) => [...current, { serviceId: services[0]?.id ?? '', quota: '4' }])}
          >
            + Adicionar serviço
          </Button>
        </div>
      </div>
    </Modal>
  );
}
