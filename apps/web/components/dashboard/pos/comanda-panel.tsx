'use client';

import { useState } from 'react';
import { Badge, Button, CloseIcon, IconButton, Select, Switch, useToast } from '@barbervp/ui';
import { formatBRL } from '@barbervp/types';
import type { OrderDetail } from '@barbervp/types';
import {
  useApplyDiscountMutation,
  useRedeemLoyaltyMutation,
  useRemoveOrderItemMutation,
  useUpdateOrderItemMutation,
} from '@/lib/dashboard/api/pos';

/**
 * Cabeçalho + itens + desconto + fidelidade — a parte que ROLA. Fica dentro
 * da área rolável do `Modal` (mobile) ou de um contêiner próprio (desktop) —
 * nunca dentro do rodapé fixo, que é `ComandaFooter`.
 */
export function ComandaContent({ order }: { order: OrderDetail }) {
  const { toast } = useToast();
  const [discountType, setDiscountType] = useState<'' | 'PERCENT' | 'FIXED'>(order.discountType ?? '');
  const [discountInput, setDiscountInput] = useState(
    order.discountType === 'PERCENT'
      ? String(order.discountValue / 100)
      : order.discountType === 'FIXED'
        ? (order.discountValue / 100).toFixed(2)
        : '',
  );

  const updateItem = useUpdateOrderItemMutation(order.id);
  const removeItem = useRemoveOrderItemMutation(order.id);
  const applyDiscount = useApplyDiscountMutation(order.id);
  const redeemLoyalty = useRedeemLoyaltyMutation(order.id);

  const isOpen = order.status === 'OPEN';

  const submitDiscount = async () => {
    try {
      if (!discountType) {
        await applyDiscount.mutateAsync({ discountType: null, discountValue: 0 });
        return;
      }
      const value = Number(discountInput.replace(',', '.')) || 0;
      await applyDiscount.mutateAsync({ discountType, discountValue: Math.round(value * 100) });
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Não foi possível aplicar o desconto.', tone: 'danger' });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-display text-base font-bold text-fg">Comanda #{order.number}</p>
          <p className="text-xs text-fg-muted">
            {order.clientName ?? 'Cliente avulso'}
            {order.barberName ? ` · ${order.barberName}` : ''}
          </p>
        </div>
        <Badge tone={isOpen ? 'warning' : 'success'}>{isOpen ? 'Aberta' : 'Fechada'}</Badge>
      </div>

      {order.items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-fg-muted">
          Adicione serviços ou produtos do catálogo.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-fg">{item.description}</p>
                <p className="text-xs text-fg-muted">
                  {item.coveredBySubscription ? (
                    <span className="text-gold">Incluído na assinatura</span>
                  ) : (
                    `${formatBRL(item.unitPriceCents)} × ${item.quantity}`
                  )}
                  {item.barberName ? ` · ${item.barberName}` : ''}
                </p>
              </div>
              {isOpen && !item.coveredBySubscription && (
                <div className="flex items-center gap-1">
                  <IconButton
                    aria-label="Diminuir"
                    variant="outline"
                    size="sm"
                    disabled={item.quantity <= 1}
                    onClick={() => updateItem.mutate({ itemId: item.id, dto: { quantity: item.quantity - 1 } })}
                  >
                    −
                  </IconButton>
                  <span className="w-5 text-center text-sm text-fg">{item.quantity}</span>
                  <IconButton
                    aria-label="Aumentar"
                    variant="outline"
                    size="sm"
                    onClick={() => updateItem.mutate({ itemId: item.id, dto: { quantity: item.quantity + 1 } })}
                  >
                    +
                  </IconButton>
                </div>
              )}
              <p className="w-20 shrink-0 text-right text-sm font-semibold text-fg">{formatBRL(item.totalCents)}</p>
              {isOpen && (
                <IconButton aria-label="Remover" variant="ghost" size="sm" onClick={() => removeItem.mutate(item.id)}>
                  <CloseIcon size={14} />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
      )}

      {isOpen && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <div className="flex items-end gap-2">
            <Select
              label="Desconto"
              value={discountType}
              onChange={(event) => setDiscountType(event.target.value as typeof discountType)}
              options={[
                { value: '', label: 'Nenhum' },
                { value: 'PERCENT', label: 'Percentual (%)' },
                { value: 'FIXED', label: 'Valor fixo (R$)' },
              ]}
            />
            {discountType && (
              <input
                className="h-10 w-24 rounded-control border border-border bg-surface-2 px-3 text-sm text-fg outline-none"
                placeholder={discountType === 'PERCENT' ? '10' : '10,00'}
                value={discountInput}
                onChange={(event) => setDiscountInput(event.target.value)}
              />
            )}
            <Button variant="outline" size="sm" onClick={() => void submitDiscount()}>
              Aplicar
            </Button>
          </div>

          {order.loyaltyBalance > 0 && (
            <label className="flex items-center justify-between rounded-xl border border-border bg-surface-2 px-3 py-2.5">
              <span className="text-sm text-fg">
                Usar pontos de fidelidade <span className="text-fg-muted">({order.loyaltyBalance} pts)</span>
              </span>
              <Switch
                checked={order.useLoyalty}
                onChange={(event) => redeemLoyalty.mutate({ useLoyalty: event.target.checked })}
              />
            </label>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Totais + "Fechar comanda" — SEMPRE fora da área que rola (rodapé fixo do
 * `Modal` no mobile, bloco `shrink-0` próprio no desktop). É o "subtotal
 * sempre visível" do critério de aceite.
 */
export function ComandaFooter({ order, onRequestClose }: { order: OrderDetail; onRequestClose: () => void }) {
  const isOpen = order.status === 'OPEN';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1 text-sm">
        <div className="flex justify-between text-fg-muted">
          <span>Subtotal</span>
          <span>{formatBRL(order.subtotalCents)}</span>
        </div>
        {order.discountCents > 0 && (
          <div className="flex justify-between text-fg-muted">
            <span>Desconto</span>
            <span>−{formatBRL(order.discountCents)}</span>
          </div>
        )}
        {order.loyaltyDiscountCents > 0 && (
          <div className="flex justify-between text-fg-muted">
            <span>Fidelidade</span>
            <span>−{formatBRL(order.loyaltyDiscountCents)}</span>
          </div>
        )}
        <div className="flex justify-between text-base font-bold text-fg">
          <span>Total</span>
          <span>{formatBRL(order.totalCents)}</span>
        </div>
      </div>

      {isOpen ? (
        <Button fullWidth disabled={order.items.length === 0} onClick={onRequestClose}>
          Fechar comanda
        </Button>
      ) : (
        <div className="rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-xs text-fg-muted">
          Pago em {order.payments.map((payment) => paymentLabel(payment.method)).join(' + ')}
        </div>
      )}
    </div>
  );
}

function paymentLabel(method: string): string {
  return { PIX: 'Pix', CASH: 'Dinheiro', DEBIT: 'Débito', CREDIT: 'Crédito', SUBSCRIPTION: 'Assinatura', LOYALTY: 'Fidelidade' }[method] ?? method;
}
