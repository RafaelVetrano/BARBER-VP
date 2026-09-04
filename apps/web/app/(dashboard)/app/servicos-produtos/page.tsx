'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Badge,
  BoxIcon,
  Button,
  EmptyState,
  LockIcon,
  PlusIcon,
  ResponsiveTable,
  ScissorsIcon,
  Skeleton,
  Switch,
  useEstablishmentAuth,
  useToast,
  type MenuItem,
  type TableColumn,
} from '@barbervp/ui';
import { formatBRL, formatDuration } from '@barbervp/types';
import type { ProductListItem, ServiceListItem } from '@barbervp/types';
import { DashboardChrome } from '@/components/dashboard/dashboard-chrome';
import { FeatureLocked } from '@/components/dashboard/feature-locked';
import { BlockError, Panel } from '@/components/dashboard/blocks';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { ServiceModal } from '@/components/dashboard/catalog/service-modal';
import { ProductModal } from '@/components/dashboard/catalog/product-modal';
import { RestockModal } from '@/components/dashboard/catalog/restock-modal';
import { PriceCalculator } from '@/components/dashboard/catalog/price-calculator';
import { useBarbersQuery } from '@/lib/dashboard/api/team';
import { useDashboardShellQuery } from '@/lib/dashboard/api/dashboard';
import {
  useDeleteProductMutation,
  useDeleteServiceMutation,
  useProductsQuery,
  useServicesQuery,
  useSetProductActiveMutation,
  useSetServiceActiveMutation,
} from '@/lib/dashboard/api/catalog';

type CatalogTab = 'servicos' | 'produtos' | 'calculadora';

const TABS: CatalogTab[] = ['servicos', 'produtos', 'calculadora'];

/** Os três bullets do paywall da calculadora (protótipo l.1845–1847). */
const CALC_BULLETS = [
  'Calcule o preço mínimo por serviço',
  'Simule lucro e ponto de equilíbrio',
  'Baseado em custos fixos e variáveis reais',
];

const pct = (bps: number) => `${(bps / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;

/**
 * Aba **Serviços & Produtos** (`Dashboard.dc.html` l.1723–2022).
 *
 * Três sub-abas, como no desenho — a terceira (Calculadora de preço) é do
 * plano Avançado e mostra cadeado no rótulo, nunca some do menu: quem não tem
 * o recurso precisa saber que ele existe para decidir comprar.
 *
 * A sub-aba vem da URL (`?tab=`), e não só do estado local, porque o sino da
 * home aponta para cá quando um produto encosta no estoque mínimo — e o
 * destino desse alerta é a lista de PRODUTOS, não a de serviços.
 */
function ServicosProdutosContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { activeMembership } = useEstablishmentAuth();

  const requested = searchParams.get('tab') as CatalogTab | null;
  const [tab, setTab] = useState<CatalogTab>(
    requested && TABS.includes(requested) ? requested : 'servicos',
  );

  // O `DashboardFuncionario.dc.html` não tem esta aba, e `/services` responde
  // 403 ao `BARBER`. O nav já não oferece o link; esta guarda é para quem
  // chega pela URL — sem ela a tela abriria com três blocos de erro genérico e
  // um botão "Novo serviço" que só sabe devolver 403.
  const isBarberRole = activeMembership?.role === 'BARBER';

  const shellQuery = useDashboardShellQuery();
  const hasCalculator = shellQuery.data?.features.calculadoraPreco ?? false;

  const servicesQuery = useServicesQuery({ perPage: 100 }, { enabled: !isBarberRole });
  const productsQuery = useProductsQuery({ perPage: 100 }, { enabled: !isBarberRole });
  const barbersQuery = useBarbersQuery();
  const setServiceActive = useSetServiceActiveMutation();
  const setProductActive = useSetProductActiveMutation();
  const deleteService = useDeleteServiceMutation();
  const deleteProduct = useDeleteProductMutation();

  const [serviceModal, setServiceModal] = useState<{ open: boolean; service: ServiceListItem | null }>({
    open: false,
    service: null,
  });
  const [productModal, setProductModal] = useState<{ open: boolean; product: ProductListItem | null }>({
    open: false,
    product: null,
  });
  const [restock, setRestock] = useState<ProductListItem | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<
    { kind: 'service'; row: ServiceListItem } | { kind: 'product'; row: ProductListItem } | null
  >(null);

  const goToTab = (next: CatalogTab) => {
    setTab(next);
    // `replace`, não `push`: trocar de sub-aba não é um passo de navegação que
    // o "voltar" do celular deva desfazer três vezes antes de sair da tela.
    router.replace(`/app/servicos-produtos?tab=${next}`, { scroll: false });
  };

  const removeConfirmed = async () => {
    if (!confirmDelete) return;
    try {
      if (confirmDelete.kind === 'service') {
        await deleteService.mutateAsync(confirmDelete.row.id);
        toast({ message: `${confirmDelete.row.name} excluído.`, tone: 'success' });
      } else {
        await deleteProduct.mutateAsync(confirmDelete.row.id);
        toast({ message: `${confirmDelete.row.name} excluído.`, tone: 'success' });
      }
      setConfirmDelete(null);
    } catch (error) {
      toast({
        message: error instanceof Error ? error.message : 'Não foi possível excluir.',
        tone: 'danger',
      });
    }
  };

  const serviceColumns: TableColumn<ServiceListItem>[] = [
    {
      key: 'name',
      header: 'Nome',
      mobile: 'title',
      render: (row) => (
        <span className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="size-2.5 shrink-0 rounded-full"
            style={{ background: row.color ?? 'var(--bvp-gold, #D4A84C)' }}
          />
          <span className="whitespace-nowrap font-medium">{row.name}</span>
        </span>
      ),
    },
    {
      key: 'duration',
      header: 'Duração',
      mobile: 'subtitle',
      render: (row) => <span className="text-fg-muted">{formatDuration(row.durationMin)}</span>,
    },
    {
      key: 'price',
      header: 'Preço',
      align: 'right',
      mobile: 'meta',
      render: (row) => <span className="tabular-nums">{formatBRL(row.priceCents)}</span>,
    },
    {
      key: 'commission',
      header: 'Comissão padrão',
      align: 'right',
      render: (row) => (
        <span className="tabular-nums">
          {pct(row.effectiveCommissionBps)}
          {row.commissionBps != null && (
            <span className="ml-1.5 text-xs text-fg-muted">(própria)</span>
          )}
        </span>
      ),
    },
    {
      key: 'active',
      header: 'Ativo',
      align: 'right',
      mobile: 'meta',
      // Toggle, e não selo: no desenho o "Ativo" é um interruptor que tira o
      // serviço do site com um clique — o passo mais frequente da tela.
      render: (row) => (
        <span className="flex justify-end">
          <Switch
            label={<span className="sr-only">{`${row.name} disponível para agendamento`}</span>}
            checked={row.active}
            disabled={setServiceActive.isPending}
            onChange={() => setServiceActive.mutate({ id: row.id, active: !row.active })}
          />
        </span>
      ),
    },
  ];

  const productColumns: TableColumn<ProductListItem>[] = [
    {
      key: 'name',
      header: 'Nome',
      mobile: 'title',
      render: (row) => <span className="whitespace-nowrap font-medium">{row.name}</span>,
    },
    {
      key: 'stock',
      header: 'Estoque',
      align: 'right',
      mobile: 'subtitle',
      render: (row) => (
        <span className="flex items-center justify-end gap-2 whitespace-nowrap">
          <span className="tabular-nums">{row.stock} un</span>
          {row.lowStock && <Badge tone="danger">Repor</Badge>}
        </span>
      ),
    },
    {
      key: 'estoqueMin',
      header: 'Estoque mínimo',
      align: 'right',
      render: (row) => <span className="tabular-nums text-fg-muted">{row.estoqueMin} un</span>,
    },
    {
      key: 'cost',
      header: 'Custo',
      align: 'right',
      render: (row) => (
        <span className="tabular-nums">{row.costCents != null ? formatBRL(row.costCents) : '—'}</span>
      ),
    },
    {
      key: 'price',
      header: 'Preço de venda',
      align: 'right',
      mobile: 'meta',
      render: (row) => <span className="tabular-nums">{formatBRL(row.priceCents)}</span>,
    },
    {
      key: 'margin',
      header: 'Margem',
      align: 'right',
      mobile: 'meta',
      render: (row) =>
        row.marginBps == null ? (
          <span className="text-fg-muted">—</span>
        ) : (
          // Margem negativa (vendendo abaixo do custo) sai em vermelho: o
          // protótipo pintava a coluna inteira de verde, o que faria um
          // prejuízo passar por lucro.
          <span
            className={`tabular-nums font-semibold ${row.marginBps >= 0 ? 'text-success' : 'text-danger'}`}
          >
            {pct(row.marginBps)}
          </span>
        ),
    },
  ];

  const serviceActions = (row: ServiceListItem): MenuItem[] => [
    { label: 'Editar', onSelect: () => setServiceModal({ open: true, service: row }) },
    {
      label: row.active ? 'Desativar' : 'Reativar',
      onSelect: () => setServiceActive.mutate({ id: row.id, active: !row.active }),
    },
    { label: 'Excluir', destructive: true, onSelect: () => setConfirmDelete({ kind: 'service', row }) },
  ];

  const productActions = (row: ProductListItem): MenuItem[] => [
    { label: 'Editar', onSelect: () => setProductModal({ open: true, product: row }) },
    { label: 'Repor estoque', onSelect: () => setRestock(row) },
    {
      label: row.active ? 'Desativar' : 'Reativar',
      onSelect: () => setProductActive.mutate({ id: row.id, active: !row.active }),
    },
    { label: 'Excluir', destructive: true, onSelect: () => setConfirmDelete({ kind: 'product', row }) },
  ];

  if (isBarberRole) {
    return (
      <DashboardChrome activeKey="servicos-produtos">
        <EmptyState
          illustration={<LockIcon size={40} />}
          message="O catálogo da barbearia é administrado pelo dono ou gerente."
          description="Sua agenda, suas comandas e suas comissões continuam no menu."
        />
      </DashboardChrome>
    );
  }

  return (
    <DashboardChrome activeKey="servicos-produtos">
      <div className="flex flex-col gap-5">
        <h1 className="font-display text-xl font-bold text-fg">Serviços &amp; Produtos</h1>

        {/* Pílulas do desenho (l.1725). Feito à mão, e não com `<Tabs>`, para
            o cadeado caber no rótulo da terceira e ela continuar CLICÁVEL —
            uma aba `disabled` esconderia o motivo. */}
        <div
          role="tablist"
          aria-label="Catálogo"
          className="-mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:w-fit md:overflow-visible md:rounded-[10px] md:border md:border-border md:bg-surface-2 md:px-1 md:py-1"
        >
          {TABS.map((key) => (
            <button
              key={key}
              role="tab"
              type="button"
              aria-selected={tab === key}
              onClick={() => goToTab(key)}
              className={`flex h-11 shrink-0 items-center gap-1.5 rounded-lg px-4 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold md:h-9 ${
                tab === key ? 'bg-surface-3 text-fg' : 'text-fg-muted hover:text-fg'
              }`}
            >
              {key === 'servicos' && 'Serviços'}
              {key === 'produtos' && 'Produtos'}
              {key === 'calculadora' && (
                <>
                  Calculadora de preço
                  {!hasCalculator && <LockIcon size={14} aria-label="Recurso do plano Avançado" />}
                </>
              )}
            </button>
          ))}
        </div>

        {tab === 'servicos' && (
          <div className="flex flex-col gap-4">
            <div className="flex justify-end">
              <Button
                size="sm"
                iconLeft={<PlusIcon size={16} />}
                onClick={() => setServiceModal({ open: true, service: null })}
              >
                Novo serviço
              </Button>
            </div>

            {servicesQuery.isPending ? (
              <TableSkeleton />
            ) : servicesQuery.isError ? (
              <BlockError label="os serviços" onRetry={() => void servicesQuery.refetch()} />
            ) : (
              <Panel>
                <ResponsiveTable
                  columns={serviceColumns}
                  rows={servicesQuery.data.data}
                  getRowKey={(row) => row.id}
                  caption="Serviços do catálogo"
                  actions={serviceActions}
                  getActionsLabel={(row) => `Ações de ${row.name}`}
                  empty={
                    <EmptyState
                      illustration={<ScissorsIcon size={40} />}
                      message="Nenhum serviço cadastrado. Sem serviço, o site de agendamento não tem o que oferecer."
                      action={
                        <Button onClick={() => setServiceModal({ open: true, service: null })}>
                          Cadastrar o primeiro serviço
                        </Button>
                      }
                    />
                  }
                />
              </Panel>
            )}
          </div>
        )}

        {tab === 'produtos' && (
          <div className="flex flex-col gap-4">
            <div className="flex justify-end">
              {/* O desenho não desenha este botão na sub-aba de produtos — mas
                  também não desenha nenhum outro caminho para cadastrar um, e
                  uma barbearia nova ficaria com a lista permanentemente vazia. */}
              <Button
                size="sm"
                iconLeft={<PlusIcon size={16} />}
                onClick={() => setProductModal({ open: true, product: null })}
              >
                Novo produto
              </Button>
            </div>

            {productsQuery.isPending ? (
              <TableSkeleton />
            ) : productsQuery.isError ? (
              <BlockError label="os produtos" onRetry={() => void productsQuery.refetch()} />
            ) : (
              <Panel>
                <ResponsiveTable
                  columns={productColumns}
                  rows={productsQuery.data.data}
                  getRowKey={(row) => row.id}
                  caption="Produtos do estoque"
                  actions={productActions}
                  getActionsLabel={(row) => `Ações de ${row.name}`}
                  empty={
                    <EmptyState
                      illustration={<BoxIcon size={40} />}
                      message="Nenhum produto cadastrado. Cadastre o que a barbearia revende para vender pela comanda e controlar o estoque."
                      action={
                        <Button onClick={() => setProductModal({ open: true, product: null })}>
                          Cadastrar o primeiro produto
                        </Button>
                      }
                    />
                  }
                />
              </Panel>
            )}
          </div>
        )}

        {tab === 'calculadora' &&
          (shellQuery.isPending ? (
            <Skeleton className="h-[520px] rounded-xl" />
          ) : hasCalculator ? (
            <PriceCalculator />
          ) : (
            <FeatureLocked
              title="Disponível no plano Avançado"
              description="Descubra o preço mínimo que cobre custo, comissão e a margem que você quer."
              benefits={CALC_BULLETS}
              minPlanLabel="Avançado"
            />
          ))}
      </div>

      <ServiceModal
        open={serviceModal.open}
        onClose={() => setServiceModal({ open: false, service: null })}
        service={serviceModal.service}
        barbers={barbersQuery.data ?? []}
        defaultCommissionBps={servicesQuery.data?.defaultCommissionBps ?? 0}
      />
      <ProductModal
        open={productModal.open}
        onClose={() => setProductModal({ open: false, product: null })}
        product={productModal.product}
      />
      <RestockModal open={restock !== null} onClose={() => setRestock(null)} product={restock} />

      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title={confirmDelete?.kind === 'product' ? 'Excluir produto' : 'Excluir serviço'}
        description={
          confirmDelete?.kind === 'product'
            ? `${confirmDelete.row.name} sai do catálogo e do balcão. As comandas já fechadas continuam mostrando a venda.`
            : `${confirmDelete?.row.name ?? ''} sai do catálogo, do site de agendamento e da agenda. O histórico de atendimentos continua intacto. Para tirar do site sem excluir, use "Desativar".`
        }
        confirmLabel="Excluir"
        tone="danger"
        busy={deleteService.isPending || deleteProduct.isPending}
        onConfirm={() => void removeConfirmed()}
      />
    </DashboardChrome>
  );
}

/** Esqueleto na altura da tabela — carregar não pode empurrar o layout. */
function TableSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-11 rounded-xl" />
      {Array.from({ length: 6 }, (_, index) => (
        <Skeleton key={index} className="h-14 rounded-xl" />
      ))}
    </div>
  );
}

/**
 * `useSearchParams()` (a sub-aba inicial vem de `?tab=`) obriga a um limite de
 * Suspense — mesmo padrão já usado em Configurações e Comissões.
 */
export default function ServicosProdutosPage() {
  return (
    <Suspense fallback={null}>
      <ServicosProdutosContent />
    </Suspense>
  );
}
