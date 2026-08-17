'use client';

import { useEffect, useState } from 'react';
import {
  Button,
  centsToInput,
  Checkbox,
  Field,
  Input,
  inputToCents,
  Modal,
  Textarea,
  useFieldIds,
  useToast,
} from '@barbervp/ui';
import type { BarberListItem, ServiceListItem } from '@barbervp/types';
import { useSaveServiceMutation } from '../../lib/api/catalog';

export function ServiceModal({
  open,
  onClose,
  service,
  barbers,
}: {
  open: boolean;
  onClose: () => void;
  service: ServiceListItem | null;
  barbers: BarberListItem[];
}) {
  const { toast } = useToast();
  const save = useSaveServiceMutation();
  const barberFieldIds = useFieldIds();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [durationMin, setDurationMin] = useState('30');
  const [priceInput, setPriceInput] = useState('0,00');
  const [category, setCategory] = useState('');
  const [barberIds, setBarberIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setName(service?.name ?? '');
    setDescription(service?.description ?? '');
    setDurationMin(String(service?.durationMin ?? 30));
    setPriceInput(centsToInput(service?.priceCents ?? 0));
    setCategory(service?.category ?? '');
    setBarberIds(service?.barberIds ?? barbers.map((barber) => barber.id));
  }, [open, service, barbers]);

  const toggleBarber = (id: string) => {
    setBarberIds((current) => (current.includes(id) ? current.filter((b) => b !== id) : [...current, id]));
  };

  const submit = async () => {
    if (!name.trim() || Number(durationMin) < 5) return;
    try {
      await save.mutateAsync({
        id: service?.id,
        dto: {
          name: name.trim(),
          description: description.trim() || null,
          durationMin: Number(durationMin),
          priceCents: inputToCents(priceInput),
          category: category.trim() || null,
          barberIds,
        },
      });
      toast({ message: service ? 'Serviço atualizado.' : 'Serviço criado.', tone: 'success' });
      onClose();
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Não foi possível salvar.', tone: 'danger' });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={service ? 'Editar serviço' : 'Novo serviço'}
      footer={
        <Button fullWidth loading={save.isPending} onClick={() => void submit()}>
          Salvar
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Input label="Nome" value={name} onChange={(event) => setName(event.target.value)} required />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Duração (min)"
            type="number"
            min={5}
            value={durationMin}
            onChange={(event) => setDurationMin(event.target.value)}
          />
          <Input
            label="Preço (R$)"
            value={priceInput}
            onChange={(event) => setPriceInput(event.target.value)}
          />
        </div>
        <Input label="Categoria (opcional)" value={category} onChange={(event) => setCategory(event.target.value)} />
        <Textarea
          label="Descrição (opcional)"
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />

        <Field label="Quem atende" ids={barberFieldIds}>
          <div className="flex flex-col gap-1 rounded-xl border border-border p-2">
            {barbers.map((barber) => (
              <label key={barber.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-surface-2">
                <Checkbox checked={barberIds.includes(barber.id)} onChange={() => toggleBarber(barber.id)} />
                <span className="text-sm text-fg">{barber.name}</span>
              </label>
            ))}
            {barbers.length === 0 && <p className="px-2 py-2 text-[13px] text-fg-muted">Cadastre um barbeiro primeiro.</p>}
          </div>
        </Field>
      </div>
    </Modal>
  );
}
