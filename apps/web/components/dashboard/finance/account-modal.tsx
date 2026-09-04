'use client';

import { useEffect, useState } from 'react';
import { Button, Input, Modal, Select, Switch, useToast } from '@barbervp/ui';
import {
  ACCOUNT_PAYABLE_CATEGORIES,
  ACCOUNT_RECEIVABLE_CATEGORIES,
  ACCOUNT_RECURRENCE_LABEL,
  ACCOUNT_RECURRENCE_OCCURRENCES,
  ACCOUNT_RECURRENCE_ORDER,
  formatBRL,
} from '@barbervp/types';
import type { AccountRecurrence, BankAccountItem } from '@barbervp/types';
import { useCreatePayableMutation, useCreateReceivableMutation } from '@/lib/dashboard/api/finance';
import { financeErrorMessage, inputToCents, todayInput } from './finance-shared';

export interface AccountModalProps {
  open: boolean;
  onClose: () => void;
  kind: 'payable' | 'receivable';
  bankAccounts: BankAccountItem[];
}

/**
 * `modalNovaContaPagar` (l.3914) e `modalNovaContaReceber` (l.3990) — o mesmo
 * formulário com dois rótulos trocados, como no protótipo.
 *
 * Os dois toggles são excludentes na prática: um parcelamento JÁ é uma série
 * com data marcada de fim, e ligar recorrência em cima disso não teria sentido
 * — ligar um desliga o outro, e o rodapé diz em uma linha o que vai ser gravado.
 */
export function AccountModal({ open, onClose, kind, bankAccounts }: AccountModalProps) {
  const { toast } = useToast();
  const payable = kind === 'payable';
  const categories = payable ? ACCOUNT_PAYABLE_CATEGORIES : ACCOUNT_RECEIVABLE_CATEGORIES;

  const [description, setDescription] = useState('');
  const [party, setParty] = useState('');
  const [category, setCategory] = useState<string>(categories[0]);
  const [amountInput, setAmountInput] = useState('');
  const [recurring, setRecurring] = useState(false);
  const [recurrence, setRecurrence] = useState<AccountRecurrence>('MONTHLY');
  const [splitting, setSplitting] = useState(false);
  const [installments, setInstallments] = useState('2');
  const [dueDate, setDueDate] = useState(todayInput());
  const [bankAccountId, setBankAccountId] = useState('');

  const createPayable = useCreatePayableMutation();
  const createReceivable = useCreateReceivableMutation();
  const pending = createPayable.isPending || createReceivable.isPending;

  useEffect(() => {
    if (!open) return;
    setDescription('');
    setParty('');
    setCategory(categories[0]);
    setAmountInput('');
    setRecurring(false);
    setRecurrence('MONTHLY');
    setSplitting(false);
    setInstallments('2');
    setDueDate(todayInput());
    // Sem conta pré-selecionada de propósito: atribuir a conta errada em
    // silêncio é pior que não atribuir nenhuma, e qual delas é a certa depende
    // de como a barbearia paga aquela despesa.
    setBankAccountId('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kind]);

  const amountCents = inputToCents(amountInput);
  const installmentCount = Math.max(2, Number(installments) || 2);
  // A descrição do "a receber" é o próprio cliente no protótipo — lá o modal
  // não tem campo de descrição, o primeiro campo é "Cliente".
  const descriptionValue = payable ? description : party;
  const canSubmit = descriptionValue.trim().length > 1 && amountCents > 0 && dueDate !== '';

  async function submit() {
    if (!canSubmit) return;
    try {
      const shared = {
        description: descriptionValue.trim(),
        amountCents,
        dueDate,
        installments: splitting ? installmentCount : 1,
        recurrence: !splitting && recurring ? recurrence : null,
        bankAccountId: bankAccountId || null,
      };
      if (payable) {
        await createPayable.mutateAsync({
          ...shared,
          category: category as never,
          supplier: party.trim() || null,
        });
      } else {
        await createReceivable.mutateAsync({
          ...shared,
          category: category as never,
          customer: party.trim() || null,
        });
      }
      toast({
        message: payable ? 'Conta a pagar criada.' : 'Conta a receber criada.',
        tone: 'success',
      });
      onClose();
    } catch (error) {
      toast({
        message: financeErrorMessage(error, 'Não foi possível criar a conta.'),
        tone: 'danger',
      });
    }
  }

  const plan = splitting
    ? `Serão criadas ${installmentCount} parcelas mensais de ${formatBRL(amountCents)}.`
    : recurring
      ? `Serão criadas ${ACCOUNT_RECURRENCE_OCCURRENCES} ocorrências ${ACCOUNT_RECURRENCE_LABEL[
          recurrence
        ].toLowerCase()}s de ${formatBRL(amountCents)}.`
      : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={payable ? 'Nova conta a pagar' : 'Nova conta a receber'}
      footer={
        <div className="flex justify-end gap-2.5">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={pending} disabled={!canSubmit} onClick={() => void submit()}>
            Salvar
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3.5">
        {payable ? (
          <Input
            label="Descrição"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        ) : (
          <Input label="Cliente" value={party} onChange={(event) => setParty(event.target.value)} />
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select
            label="Categoria"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            options={categories.map((item) => ({ value: item, label: item }))}
          />
          <Input
            label="Valor"
            placeholder="0,00"
            inputMode="decimal"
            addonLeft={<span className="text-sm font-medium text-fg-muted">R$</span>}
            hint={splitting ? 'De cada parcela' : undefined}
            value={amountInput}
            onChange={(event) => setAmountInput(event.target.value)}
          />
        </div>

        {payable && (
          <Input
            label="Fornecedor (opcional)"
            value={party}
            onChange={(event) => setParty(event.target.value)}
          />
        )}

        <Switch
          label="Recorrente?"
          checked={recurring}
          onChange={(event) => {
            setRecurring(event.target.checked);
            if (event.target.checked) setSplitting(false);
          }}
        />
        {recurring && (
          <Select
            label="Frequência"
            value={recurrence}
            onChange={(event) => setRecurrence(event.target.value as AccountRecurrence)}
            options={ACCOUNT_RECURRENCE_ORDER.map((item) => ({
              value: item,
              label: ACCOUNT_RECURRENCE_LABEL[item],
            }))}
          />
        )}

        <Switch
          label="Parcelado?"
          checked={splitting}
          onChange={(event) => {
            setSplitting(event.target.checked);
            if (event.target.checked) setRecurring(false);
          }}
        />
        {splitting && (
          <Input
            label="Nº de parcelas"
            type="number"
            min={2}
            max={60}
            value={installments}
            onChange={(event) => setInstallments(event.target.value)}
          />
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            label="1º vencimento"
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
          <Select
            label={payable ? 'Conta de saída' : 'Conta de entrada'}
            value={bankAccountId}
            onChange={(event) => setBankAccountId(event.target.value)}
            options={[
              { value: '', label: 'Sem conta vinculada' },
              ...bankAccounts.map((item) => ({ value: item.id, label: item.name })),
            ]}
          />
        </div>

        {plan && amountCents > 0 && (
          <p className="rounded-control border border-gold/35 bg-gold/10 px-3.5 py-3 text-xs text-gold">
            {plan}
          </p>
        )}
      </div>
    </Modal>
  );
}
