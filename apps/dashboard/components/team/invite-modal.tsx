'use client';

import { useState } from 'react';
import { Button, Checkbox, Field, Input, Modal, useFieldIds, useToast } from '@barbervp/ui';
import { WEEKDAY_LABELS } from '@barbervp/types';
import type { ServiceListItem } from '@barbervp/types';
import { useCreateStaffInviteMutation } from '../../lib/api/team';

export function InviteModal({
  open,
  onClose,
  services,
}: {
  open: boolean;
  onClose: () => void;
  services: ServiceListItem[];
}) {
  const { toast } = useToast();
  const create = useCreateStaffInviteMutation();
  const servicesFieldIds = useFieldIds();
  const daysFieldIds = useFieldIds();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [workDays, setWorkDays] = useState<number[]>([1, 2, 3, 4, 5]);

  const toggleService = (id: string) => {
    setServiceIds((current) => (current.includes(id) ? current.filter((s) => s !== id) : [...current, id]));
  };
  const toggleDay = (day: number) => {
    setWorkDays((current) => (current.includes(day) ? current.filter((d) => d !== day) : [...current, day]));
  };

  const canSubmit = name.trim() && email.trim() && serviceIds.length > 0 && workDays.length > 0;

  const submit = async () => {
    if (!canSubmit) return;
    try {
      await create.mutateAsync({ name: name.trim(), email: email.trim(), phone: phone.trim() || null, serviceIds, workDays });
      toast({ message: `Convite enviado para ${email}.`, tone: 'success' });
      setName('');
      setEmail('');
      setPhone('');
      setServiceIds([]);
      setWorkDays([1, 2, 3, 4, 5]);
      onClose();
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Não foi possível enviar o convite.', tone: 'danger' });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Convidar barbeiro"
      footer={
        <Button fullWidth loading={create.isPending} disabled={!canSubmit} onClick={() => void submit()}>
          Enviar convite
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Input label="Nome" value={name} onChange={(event) => setName(event.target.value)} required />
        <Input
          label="E-mail"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          hint="É para onde vai o link de criação de senha."
          required
        />
        <Input label="WhatsApp (opcional)" value={phone} onChange={(event) => setPhone(event.target.value)} />

        <Field label="Serviços que vai atender" ids={servicesFieldIds}>
          <div className="flex flex-col gap-1 rounded-xl border border-border p-2">
            {services.map((service) => (
              <label key={service.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-surface-2">
                <Checkbox checked={serviceIds.includes(service.id)} onChange={() => toggleService(service.id)} />
                <span className="text-sm text-fg">{service.name}</span>
              </label>
            ))}
          </div>
        </Field>

        <Field label="Dias de trabalho" ids={daysFieldIds}>
          <div className="flex flex-wrap gap-2">
            {WEEKDAY_LABELS.map((label, weekday) => (
              <button
                key={weekday}
                type="button"
                onClick={() => toggleDay(weekday)}
                className={`h-9 rounded-full border px-3 text-[13px] font-semibold transition-colors ${
                  workDays.includes(weekday) ? 'border-gold bg-gold text-bg' : 'border-border text-fg-muted'
                }`}
              >
                {label.slice(0, 3)}
              </button>
            ))}
          </div>
        </Field>
      </div>
    </Modal>
  );
}
