'use client';

import { useEffect, useState } from 'react';
import { Button, Checkbox, Field, Input, Modal, useFieldIds, useToast } from '@barbervp/ui';
import type { BarberListItem, ServiceListItem } from '@barbervp/types';
import { useUpdateBarberMutation } from '@/lib/dashboard/api/team';

export function BarberModal({
  open,
  onClose,
  barber,
  services,
}: {
  open: boolean;
  onClose: () => void;
  barber: BarberListItem | null;
  services: ServiceListItem[];
}) {
  const { toast } = useToast();
  const update = useUpdateBarberMutation();
  const servicesFieldIds = useFieldIds();

  const [name, setName] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [serviceIds, setServiceIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open || !barber) return;
    setName(barber.name);
    setSpecialty(barber.specialty ?? '');
    setPhone(barber.phone ?? '');
    setEmail(barber.email ?? '');
    setServiceIds(barber.serviceIds);
  }, [open, barber]);

  const toggleService = (id: string) => {
    setServiceIds((current) => (current.includes(id) ? current.filter((s) => s !== id) : [...current, id]));
  };

  const submit = async () => {
    if (!barber || !name.trim()) return;
    try {
      await update.mutateAsync({
        id: barber.id,
        dto: {
          name: name.trim(),
          specialty: specialty.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          serviceIds,
        },
      });
      toast({ message: 'Barbeiro atualizado.', tone: 'success' });
      onClose();
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Não foi possível salvar.', tone: 'danger' });
    }
  };

  if (!barber) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={barber.name}
      footer={
        <Button fullWidth loading={update.isPending} onClick={() => void submit()}>
          Salvar
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Input label="Nome" value={name} onChange={(event) => setName(event.target.value)} required />
        <Input label="Especialidade (opcional)" value={specialty} onChange={(event) => setSpecialty(event.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Telefone" value={phone} onChange={(event) => setPhone(event.target.value)} />
          <Input label="E-mail" value={email} onChange={(event) => setEmail(event.target.value)} />
        </div>

        <Field label="Serviços que atende" ids={servicesFieldIds}>
          <div className="flex flex-col gap-1 rounded-xl border border-border p-2">
            {services.map((service) => (
              <label key={service.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-surface-2">
                <Checkbox checked={serviceIds.includes(service.id)} onChange={() => toggleService(service.id)} />
                <span className="text-sm text-fg">{service.name}</span>
              </label>
            ))}
          </div>
        </Field>
      </div>
    </Modal>
  );
}
