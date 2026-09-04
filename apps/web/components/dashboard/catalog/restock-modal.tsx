'use client';

import { useEffect, useState } from 'react';
import { Button, Input, Modal, useToast } from '@barbervp/ui';
import type { ProductListItem } from '@barbervp/types';
import { useRestockProductMutation } from '@/lib/dashboard/api/catalog';

/**
 * "Repor estoque" do kebab de produto (`Dashboard.dc.html` l.1818).
 *
 * O protótipo repunha para `estoqueMin + 10` sem perguntar nada — um número
 * que ninguém escolheu, e que numa nota fiscal de 24 unidades deixa o estoque
 * errado. Aqui a quantidade é de quem está guardando a mercadoria, e a prévia
 * mostra em que saldo o produto termina.
 */
export function RestockModal({
  open,
  onClose,
  product,
}: {
  open: boolean;
  onClose: () => void;
  product: ProductListItem | null;
}) {
  const { toast } = useToast();
  const restock = useRestockProductMutation();
  const [quantity, setQuantity] = useState('');

  useEffect(() => {
    if (!open) return;
    // Sugestão: o que falta para sair do alerta com uma folga de um mínimo
    // inteiro. É um ponto de partida editável, não uma decisão tomada.
    const suggested = product ? Math.max(1, product.estoqueMin * 2 - product.stock) : 1;
    setQuantity(String(suggested));
  }, [open, product]);

  const parsed = Number(quantity);
  const invalid = !Number.isInteger(parsed) || parsed < 1;

  const submit = async () => {
    if (!product || invalid) return;
    try {
      await restock.mutateAsync({ id: product.id, dto: { quantity: parsed } });
      toast({ message: `Estoque de ${product.name} reposto.`, tone: 'success' });
      onClose();
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Não foi possível repor.', tone: 'danger' });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Repor estoque"
      footer={
        <div className="flex w-full justify-end gap-2.5">
          <Button variant="outline" onClick={onClose} disabled={restock.isPending}>
            Cancelar
          </Button>
          <Button loading={restock.isPending} disabled={invalid} onClick={() => void submit()}>
            Repor
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-fg-muted">
          <span className="font-medium text-fg">{product?.name}</span> — estoque atual de{' '}
          <span className="tabular-nums text-fg">{product?.stock ?? 0}</span> un., mínimo de{' '}
          <span className="tabular-nums text-fg">{product?.estoqueMin ?? 0}</span> un.
        </p>
        <Input
          label="Unidades a acrescentar"
          type="number"
          min={1}
          inputMode="numeric"
          value={quantity}
          error={invalid ? 'Informe um número inteiro maior que zero.' : undefined}
          hint={
            invalid ? undefined : `O estoque passa a ${(product?.stock ?? 0) + parsed} un.`
          }
          onChange={(event) => setQuantity(event.target.value)}
        />
      </div>
    </Modal>
  );
}
