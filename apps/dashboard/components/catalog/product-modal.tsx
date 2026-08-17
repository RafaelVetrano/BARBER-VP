'use client';

import { useEffect, useState } from 'react';
import { Button, centsToInput, Input, inputToCents, Modal, Textarea, useToast } from '@barbervp/ui';
import type { ProductListItem } from '@barbervp/types';
import { useSaveProductMutation } from '../../lib/api/catalog';

export function ProductModal({
  open,
  onClose,
  product,
}: {
  open: boolean;
  onClose: () => void;
  product: ProductListItem | null;
}) {
  const { toast } = useToast();
  const save = useSaveProductMutation();

  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [priceInput, setPriceInput] = useState('0,00');
  const [costInput, setCostInput] = useState('0,00');
  const [stock, setStock] = useState('0');
  const [estoqueMin, setEstoqueMin] = useState('0');

  useEffect(() => {
    if (!open) return;
    setName(product?.name ?? '');
    setSku(product?.sku ?? '');
    setDescription(product?.description ?? '');
    setCategory(product?.category ?? '');
    setPriceInput(centsToInput(product?.priceCents ?? 0));
    setCostInput(centsToInput(product?.costCents ?? 0));
    setStock(String(product?.stock ?? 0));
    setEstoqueMin(String(product?.estoqueMin ?? 0));
  }, [open, product]);

  const submit = async () => {
    if (!name.trim()) return;
    try {
      await save.mutateAsync({
        id: product?.id,
        dto: {
          name: name.trim(),
          sku: sku.trim() || null,
          description: description.trim() || null,
          category: category.trim() || null,
          priceCents: inputToCents(priceInput),
          costCents: inputToCents(costInput),
          stock: Number(stock),
          estoqueMin: Number(estoqueMin),
        },
      });
      toast({ message: product ? 'Produto atualizado.' : 'Produto criado.', tone: 'success' });
      onClose();
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Não foi possível salvar.', tone: 'danger' });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={product ? 'Editar produto' : 'Novo produto'}
      footer={
        <Button fullWidth loading={save.isPending} onClick={() => void submit()}>
          Salvar
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Input label="Nome" value={name} onChange={(event) => setName(event.target.value)} required />
        <div className="grid grid-cols-2 gap-3">
          <Input label="SKU (opcional)" value={sku} onChange={(event) => setSku(event.target.value)} />
          <Input label="Categoria (opcional)" value={category} onChange={(event) => setCategory(event.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Preço de venda (R$)" value={priceInput} onChange={(event) => setPriceInput(event.target.value)} />
          <Input label="Custo (R$, opcional)" value={costInput} onChange={(event) => setCostInput(event.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Estoque atual" type="number" min={0} value={stock} onChange={(event) => setStock(event.target.value)} />
          <Input
            label="Estoque mínimo"
            type="number"
            min={0}
            hint="Dispara o alerta de estoque baixo"
            value={estoqueMin}
            onChange={(event) => setEstoqueMin(event.target.value)}
          />
        </div>
        <Textarea
          label="Descrição (opcional)"
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
    </Modal>
  );
}
