'use client';

import { useEffect, useState } from 'react';
import { Button, Input, Modal, Select, cn, useToast } from '@barbervp/ui';
import { BANK_ACCOUNT_METHODS, BANK_ACCOUNT_TYPES } from '@barbervp/types';
import type { PaymentMethod } from '@barbervp/types';
import { useSaveBankAccountMutation } from '@/lib/dashboard/api/finance';
import { financeErrorMessage, inputToCents, methodLabel } from './finance-shared';

export interface BankAccountModalProps {
  open: boolean;
  onClose: () => void;
}

/** `modalNovaContaBancaria` (`Dashboard.dc.html` l.4109). */
export function BankAccountModal({ open, onClose }: BankAccountModalProps) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [type, setType] = useState<string>(BANK_ACCOUNT_TYPES[0]);
  const [balanceInput, setBalanceInput] = useState('');
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const save = useSaveBankAccountMutation();

  useEffect(() => {
    if (!open) return;
    setName('');
    setType(BANK_ACCOUNT_TYPES[0]);
    setBalanceInput('');
    setMethods([]);
  }, [open]);

  const canSubmit = name.trim().length > 1;

  function toggleMethod(method: PaymentMethod) {
    setMethods((current) =>
      current.includes(method) ? current.filter((item) => item !== method) : [...current, method],
    );
  }

  async function submit() {
    if (!canSubmit) return;
    try {
      await save.mutateAsync({
        dto: {
          name: name.trim(),
          type,
          acceptedMethods: methods,
          balanceCents: inputToCents(balanceInput),
        },
      });
      toast({ message: 'Conta bancária criada.', tone: 'success' });
      onClose();
    } catch (error) {
      toast({
        message: financeErrorMessage(error, 'Não foi possível salvar a conta.'),
        tone: 'danger',
      });
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nova conta bancária"
      footer={
        <div className="flex justify-end gap-2.5">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={save.isPending} disabled={!canSubmit} onClick={() => void submit()}>
            Salvar
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Input
          label="Nome da conta"
          placeholder="ex.: conta corrente da barbearia"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select
            label="Tipo"
            value={type}
            onChange={(event) => setType(event.target.value)}
            options={BANK_ACCOUNT_TYPES.map((item) => ({ value: item, label: item }))}
          />
          <Input
            label="Saldo inicial"
            placeholder="0,00"
            inputMode="decimal"
            addonLeft={<span className="text-sm font-medium text-fg-muted">R$</span>}
            value={balanceInput}
            onChange={(event) => setBalanceInput(event.target.value)}
          />
        </div>

        <fieldset>
          <legend className="mb-1.5 text-[13px] font-medium text-fg-muted">
            Formas de pagamento que caem nesta conta
          </legend>
          <div className="flex flex-wrap gap-2">
            {BANK_ACCOUNT_METHODS.map((method) => {
              const selected = methods.includes(method);
              return (
                <button
                  key={method}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleMethod(method)}
                  className={cn(
                    'min-h-11 rounded-full border px-3.5 text-xs font-medium transition-colors md:min-h-0 md:py-1.5',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold',
                    selected
                      ? 'border-gold/40 bg-gold/15 text-gold'
                      : 'border-border bg-surface-2 text-fg-muted hover:text-fg',
                  )}
                >
                  {methodLabel(method)}
                </button>
              );
            })}
          </div>
        </fieldset>
      </div>
    </Modal>
  );
}
