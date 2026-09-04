'use client';

import { useEffect, useState } from 'react';
import { Button, Input, Modal, Switch, Textarea, maskPhoneInput, useToast } from '@barbervp/ui';
import type { ClientListItem } from '@barbervp/types';
import { useCreateClientMutation } from '@/lib/dashboard/api/clients';
import { clientsErrorMessage } from './clients-shared';

export interface NewClientModalProps {
  open: boolean;
  onClose: () => void;
  /** Chamado com o cliente já criado — a aba usa para abrir o perfil dele. */
  onCreated?: (client: ClientListItem) => void;
}

/**
 * Modal "Novo cliente" (`Dashboard.dc.html` l.3080).
 *
 * Campos na ordem exata do protótipo: Nome*, WhatsApp*, E-mail, Data de
 * nascimento, Observações e o toggle "Aceita receber mensagens" — que grava
 * `Client.notifyWhatsapp`, o MESMO campo que a área do cliente respeita.
 */
export function NewClientModal({ open, onClose, onCreated }: NewClientModalProps) {
  const { toast } = useToast();
  const create = useCreateClientMutation();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [notes, setNotes] = useState('');
  const [acceptsMessages, setAcceptsMessages] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName('');
    setPhone('');
    setEmail('');
    setBirthDate('');
    setNotes('');
    setAcceptsMessages(true);
    setError(null);
  }, [open]);

  const digits = phone.replace(/\D/g, '');
  const canSubmit = name.trim().length >= 2 && digits.length >= 10;

  const submit = async () => {
    if (!canSubmit) {
      setError('Informe o nome e um WhatsApp com DDD.');
      return;
    }
    setError(null);
    try {
      const created = await create.mutateAsync({
        name: name.trim(),
        phone: digits,
        email: email.trim() || null,
        birthDate: birthDate || null,
        notes: notes.trim() || null,
        acceptsMessages,
      });
      toast({ message: `${created.name} cadastrado.`, tone: 'success' });
      onCreated?.(created);
      onClose();
    } catch (cause) {
      setError(clientsErrorMessage(cause));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Novo cliente"
      footer={
        <div className="flex justify-end gap-2.5">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={create.isPending} onClick={() => void submit()}>
            Salvar cliente
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Input
          label="Nome"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="off"
        />
        <Input
          label="WhatsApp"
          required
          inputMode="tel"
          placeholder="(00) 00000-0000"
          value={phone}
          onChange={(event) => setPhone(maskPhoneInput(event.target.value))}
          autoComplete="off"
        />
        <Input
          label="E-mail"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="off"
        />
        <Input
          label="Data de nascimento"
          type="date"
          value={birthDate}
          onChange={(event) => setBirthDate(event.target.value)}
        />
        <Textarea
          label="Observações"
          rows={3}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Preferências, alergias, como gosta do corte…"
        />
        <Switch
          label="Aceita receber mensagens"
          description="Lembretes e campanhas por WhatsApp."
          checked={acceptsMessages}
          onChange={(event) => setAcceptsMessages(event.target.checked)}
        />
        {error && (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
