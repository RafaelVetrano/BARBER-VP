'use client';

import { useState } from 'react';
import { ArrowLeftIcon, Button, Card, EmptyState, Input, Modal, Skeleton, Tabs, useToast } from '@barbervp/ui';
import { formatBRL, formatDuration } from '@barbervp/types';
import { useAddOrderItemMutation, useOrderQuery, usePosCatalogQuery } from '../../lib/api/pos';
import { ComandaContent, ComandaFooter } from './comanda-panel';
import { CloseOrderModal } from './close-order-modal';

export interface PosWorkspaceProps {
  orderId: string;
  onBack: () => void;
}

/**
 * Catálogo + comanda em duas colunas (`lg:`). No mobile o catálogo ocupa a
 * tela inteira e a comanda vira bottom-sheet — uma barra fixa embaixo mostra
 * o subtotal sempre visível, e abrir a folha reusa o MESMO `ComandaPanel`
 * dentro de um `Modal` (que já é bottom-sheet nativo abaixo de 768px).
 */
export function PosWorkspace({ orderId, onBack }: PosWorkspaceProps) {
  const { toast } = useToast();
  const orderQuery = useOrderQuery(orderId);
  const catalogQuery = usePosCatalogQuery();
  const addItem = useAddOrderItemMutation(orderId);

  const [tab, setTab] = useState<'servicos' | 'produtos'>('servicos');
  const [search, setSearch] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [closeModalOpen, setCloseModalOpen] = useState(false);

  const order = orderQuery.data;
  const catalog = catalogQuery.data;
  const isOpen = order?.status === 'OPEN';

  const services = (catalog?.services ?? []).filter((service) =>
    service.name.toLowerCase().includes(search.toLowerCase()),
  );
  const products = (catalog?.products ?? []).filter((product) =>
    product.name.toLowerCase().includes(search.toLowerCase()),
  );

  const addService = async (serviceId: string) => {
    try {
      await addItem.mutateAsync({ kind: 'SERVICE', serviceId, barberId: order?.barberId ?? undefined });
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Não foi possível adicionar.', tone: 'danger' });
    }
  };
  const addProduct = async (productId: string) => {
    try {
      await addItem.mutateAsync({ kind: 'PRODUCT', productId, barberId: order?.barberId ?? undefined });
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Não foi possível adicionar.', tone: 'danger' });
    }
  };

  if (orderQuery.isLoading || !order) {
    return <Skeleton className="h-96 w-full rounded-2xl" />;
  }

  return (
    <div className="flex flex-col gap-4 pb-20 lg:pb-0">
      <button
        type="button"
        onClick={onBack}
        className="flex w-fit items-center gap-1.5 text-sm font-semibold text-fg-muted hover:text-fg"
      >
        <ArrowLeftIcon size={16} /> Comandas
      </button>

      <div className="grid gap-5 lg:grid-cols-[1fr_380px] lg:items-start">
        {/* Catálogo — coluna esquerda ≥ lg, tela cheia no mobile. */}
        <div className="flex flex-col gap-3">
          <Input
            placeholder="Buscar serviço ou produto"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Tabs
            label="Catálogo"
            variant="segmented"
            value={tab}
            onChange={(value) => setTab(value as 'servicos' | 'produtos')}
            items={[
              { value: 'servicos', label: 'Serviços' },
              { value: 'produtos', label: 'Produtos' },
            ]}
          />

          {catalogQuery.isLoading ? (
            <Skeleton className="h-64 w-full rounded-2xl" />
          ) : (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {tab === 'servicos'
                ? services.map((service) => (
                    <button
                      key={service.id}
                      type="button"
                      disabled={!isOpen || addItem.isPending}
                      onClick={() => void addService(service.id)}
                      className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-3 text-left transition-colors hover:border-gold disabled:opacity-50"
                    >
                      <span className="text-sm font-semibold text-fg">{service.name}</span>
                      <span className="text-xs text-fg-muted">{formatDuration(service.durationMin)}</span>
                      <span className="text-sm font-semibold text-gold">{formatBRL(service.priceCents)}</span>
                    </button>
                  ))
                : products.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      disabled={!isOpen || addItem.isPending || product.stock <= 0}
                      onClick={() => void addProduct(product.id)}
                      className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-3 text-left transition-colors hover:border-gold disabled:opacity-50"
                    >
                      <span className="text-sm font-semibold text-fg">{product.name}</span>
                      <span className="text-xs text-fg-muted">{product.stock} em estoque</span>
                      <span className="text-sm font-semibold text-gold">{formatBRL(product.priceCents)}</span>
                    </button>
                  ))}
              {(tab === 'servicos' ? services : products).length === 0 && (
                <div className="col-span-full">
                  <EmptyState message="Nada encontrado." />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Comanda — coluna fixa ≥ lg, com rodapé (totais + Fechar) SEMPRE fora da rolagem. */}
        <Card className="hidden lg:flex lg:max-h-[calc(100vh-6rem)] lg:flex-col lg:sticky lg:top-4">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ComandaContent order={order} />
          </div>
          <div className="shrink-0 border-t border-border pt-3">
            <ComandaFooter order={order} onRequestClose={() => setCloseModalOpen(true)} />
          </div>
        </Card>
      </div>

      {/* Barra fixa mobile — subtotal sempre visível, abre a comanda como bottom-sheet. */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t border-border bg-surface px-4 py-3 shadow-sheet lg:hidden">
        <div>
          <p className="text-xs text-fg-muted">Comanda #{order.number}</p>
          <p className="text-base font-bold text-fg">{formatBRL(order.totalCents)}</p>
        </div>
        <Button onClick={() => setSheetOpen(true)}>Ver comanda</Button>
      </div>

      <Modal
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={`Comanda #${order.number}`}
        footer={<ComandaFooter order={order} onRequestClose={() => setCloseModalOpen(true)} />}
      >
        <ComandaContent order={order} />
      </Modal>

      <CloseOrderModal
        open={closeModalOpen}
        onClose={() => setCloseModalOpen(false)}
        order={order}
        onClosed={() => {
          setCloseModalOpen(false);
          setSheetOpen(false);
          onBack();
        }}
      />
    </div>
  );
}
