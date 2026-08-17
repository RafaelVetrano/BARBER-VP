'use client';

import { useEffect, useState } from 'react';
import { Avatar, Button, Card, Input, Modal, Select, useToast } from '@barbervp/ui';
import { formatPhone } from '@barbervp/types';
import type { ClientListItem } from '@barbervp/types';
import { useClientsQuery } from '../../lib/api/clients';
import { useOpenOrderMutation } from '../../lib/api/pos';

export interface OpenOrderModalProps {
  open: boolean;
  onClose: () => void;
  onOpened: (orderId: string) => void;
  barbers: Array<{ id: string; name: string }>;
}

type ClientMode = 'cadastrado' | 'walkin';

/** Abrir comanda — cliente cadastrado ou walk-in avulso. Mesmo padrão do "Novo agendamento" (fase 06). */
export function OpenOrderModal({ open, onClose, onOpened, barbers }: OpenOrderModalProps) {
  const { toast } = useToast();
  const [mode, setMode] = useState<ClientMode>('cadastrado');
  const [clientSearch, setClientSearch] = useState('');
  const [clientId, setClientId] = useState<string | null>(null);
  const [walkInName, setWalkInName] = useState('');
  const [walkInPhone, setWalkInPhone] = useState('');
  const [barberId, setBarberId] = useState('');

  useEffect(() => {
    if (!open) return;
    setMode('cadastrado');
    setClientSearch('');
    setClientId(null);
    setWalkInName('');
    setWalkInPhone('');
    setBarberId('');
  }, [open]);

  const clientsQuery = useClientsQuery({ search: clientSearch, perPage: 8 });
  const openOrder = useOpenOrderMutation();

  const chosenClient = clientsQuery.data?.data.find((row: ClientListItem) => row.clientId === clientId);
  const canSubmit = mode === 'cadastrado' ? Boolean(clientId) : walkInName.trim() && walkInPhone.trim();

  const submit = async () => {
    if (!canSubmit) return;
    try {
      const order = await openOrder.mutateAsync({
        clientId: mode === 'cadastrado' ? clientId : undefined,
        walkIn: mode === 'walkin' ? { name: walkInName.trim(), phone: walkInPhone.trim() } : undefined,
        barberId: barberId || undefined,
      });
      onOpened(order.id);
      onClose();
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Não foi possível abrir a comanda.', tone: 'danger' });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nova comanda"
      footer={
        <Button fullWidth loading={openOrder.isPending} disabled={!canSubmit} onClick={() => void submit()}>
          Abrir comanda
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {barbers.length > 0 && (
          <Select
            label="Barbeiro (opcional)"
            value={barberId}
            onChange={(event) => setBarberId(event.target.value)}
            options={[{ value: '', label: 'Sem barbeiro definido' }, ...barbers.map((b) => ({ value: b.id, label: b.name }))]}
          />
        )}

        <div className="flex gap-2 rounded-xl border border-border bg-surface-2 p-1">
          <button
            type="button"
            onClick={() => setMode('cadastrado')}
            className={`h-9 flex-1 rounded-lg text-[13px] font-semibold transition-colors ${mode === 'cadastrado' ? 'bg-gold text-bg' : 'text-fg-muted'}`}
          >
            Cliente cadastrado
          </button>
          <button
            type="button"
            onClick={() => setMode('walkin')}
            className={`h-9 flex-1 rounded-lg text-[13px] font-semibold transition-colors ${mode === 'walkin' ? 'bg-gold text-bg' : 'text-fg-muted'}`}
          >
            Walk-in (avulso)
          </button>
        </div>

        {mode === 'cadastrado' ? (
          <div className="flex flex-col gap-2">
            <Input
              label="Buscar cliente"
              placeholder="Nome ou telefone"
              value={clientSearch}
              onChange={(event) => {
                setClientSearch(event.target.value);
                setClientId(null);
              }}
            />
            {chosenClient ? (
              <Card tone="raised" className="flex-row items-center gap-3">
                <Avatar name={chosenClient.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-fg">{chosenClient.name}</p>
                  <p className="text-xs text-fg-muted">{formatPhone(chosenClient.phone)}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setClientId(null)}>
                  Trocar
                </Button>
              </Card>
            ) : (
              clientSearch.trim().length > 0 && (
                <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-xl border border-border p-1.5">
                  {(clientsQuery.data?.data ?? []).map((row) => (
                    <li key={row.clientId}>
                      <button
                        type="button"
                        onClick={() => {
                          setClientId(row.clientId);
                          setClientSearch(row.name);
                        }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-surface-2"
                      >
                        <Avatar name={row.name} size="sm" />
                        <span className="min-w-0 flex-1 truncate text-sm text-fg">{row.name}</span>
                        <span className="shrink-0 text-xs text-fg-muted">{formatPhone(row.phone)}</span>
                      </button>
                    </li>
                  ))}
                  {clientsQuery.data?.data.length === 0 && (
                    <p className="px-2.5 py-2 text-[13px] text-fg-muted">Ninguém encontrado.</p>
                  )}
                </ul>
              )
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <Input label="Nome do cliente" value={walkInName} onChange={(event) => setWalkInName(event.target.value)} />
            <Input
              label="WhatsApp"
              placeholder="(11) 9 9999-9999"
              value={walkInPhone}
              onChange={(event) => setWalkInPhone(event.target.value)}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
