'use client';

import { useEffect, useState, type ReactNode } from 'react';
import {
  Badge,
  Button,
  EmptyState,
  Input,
  Modal,
  SearchIcon,
  Select,
  Skeleton,
  Switch,
  cn,
  initialsOf,
  useEstablishmentAuth,
  useToast,
} from '@barbervp/ui';
import { formatBRL } from '@barbervp/types';
import type { OrderDetail, PaymentMethod, PosCatalogResponse } from '@barbervp/types';
import {
  useAddOrderItemMutation,
  useApplyDiscountMutation,
  useAssignOrderMutation,
  useCloseOrderMutation,
  useOpenOrderMutation,
  useOrderQuery,
  usePosCatalogQuery,
  useRedeemLoyaltyMutation,
  useRemoveOrderItemMutation,
  useUpdateOrderItemMutation,
} from '@/lib/dashboard/api/pos';
import { ClientPicker } from './client-picker';
import { SPLIT_METHODS, centsToInput, inputToCents, methodLabel, posErrorMessage } from './pos-shared';

/** As 5 pastilhas de `PAYMENT_METHODS` (l.4528) — "Dividir" é a quinta. */
type PaymentChoice = PaymentMethod | 'SPLIT';

export interface ComandaModalProps {
  open: boolean;
  /** `null` = "+ Nova comanda": o modal começa no seletor de cliente (l.3126). */
  orderId: string | null;
  onClose: () => void;
  /** Uma comanda nasceu dentro do modal — a lista atrás precisa saber. */
  onOrderOpened: (orderId: string) => void;
}

/**
 * A comanda (`modalComandaOpen`, l.3123) — os dois passos do protótipo num
 * diálogo só, como lá:
 *
 * 1. sem cliente escolhido → painel de 480px com a busca de cliente;
 * 2. com cliente → painel largo, catálogo | itens | resumo.
 *
 * As três colunas só existem a partir de `lg`; abaixo disso o diálogo é o
 * bottom-sheet nativo do `Modal` e as seções empilham, com o total no rodapé
 * fixo — o "subtotal SEMPRE visível" do critério de aceite.
 */
export function ComandaModal({ open, orderId, onClose, onOrderOpened }: ComandaModalProps) {
  const catalogQuery = usePosCatalogQuery({ enabled: open });
  const orderQuery = useOrderQuery(open ? orderId : null);

  if (!orderId) {
    return (
      <NewComandaStep
        open={open}
        nextNumber={catalogQuery.data?.nextNumber ?? null}
        onClose={onClose}
        onOpened={onOrderOpened}
      />
    );
  }

  return (
    <ComandaWorkspace
      open={open}
      onClose={onClose}
      order={orderQuery.data}
      loading={orderQuery.isLoading}
      error={orderQuery.isError ? orderQuery.error : null}
      onRetry={() => void orderQuery.refetch()}
      catalog={catalogQuery.data}
      catalogLoading={catalogQuery.isLoading}
      catalogError={catalogQuery.isError}
      onCatalogRetry={() => void catalogQuery.refetch()}
    />
  );
}

// ── Passo 1 — "Nova comanda #N" (l.3126) ───────────────────────────────────

function NewComandaStep({
  open,
  nextNumber,
  onClose,
  onOpened,
}: {
  open: boolean;
  nextNumber: number | null;
  onClose: () => void;
  onOpened: (orderId: string) => void;
}) {
  const { toast } = useToast();
  const openOrder = useOpenOrderMutation();
  const [walkIn, setWalkIn] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    if (open) return;
    setWalkIn(false);
    setName('');
    setPhone('');
  }, [open]);

  const create = async (dto: Parameters<typeof openOrder.mutateAsync>[0]) => {
    try {
      const order = await openOrder.mutateAsync(dto);
      onOpened(order.id);
    } catch (error) {
      toast({ message: posErrorMessage(error, 'Não foi possível abrir a comanda.'), tone: 'danger' });
    }
  };

  const walkInReady = name.trim().length >= 2 && phone.trim().length >= 8;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <span className="flex items-baseline gap-2">
          Nova comanda
          {nextNumber !== null && (
            <span className="text-[13px] font-medium text-fg-muted tabular-nums">#{nextNumber}</span>
          )}
        </span>
      }
    >
      <div className="flex min-h-0 flex-col gap-3">
        {walkIn ? (
          <>
            <p className="text-[13px] text-fg-muted">Quem chegou sem cadastro — só nome e WhatsApp.</p>
            <Input label="Nome do cliente" value={name} onChange={(event) => setName(event.target.value)} />
            <Input
              label="WhatsApp"
              placeholder="(11) 9 9999-9999"
              inputMode="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
            <div className="flex flex-col gap-2 pt-1">
              <Button
                fullWidth
                loading={openOrder.isPending}
                disabled={!walkInReady}
                onClick={() => void create({ walkIn: { name: name.trim(), phone: phone.trim() } })}
              >
                Abrir comanda
              </Button>
              <Button fullWidth variant="ghost" onClick={() => setWalkIn(false)}>
                Voltar para a busca
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-[13px] text-fg-muted">Selecione o cliente para abrir a comanda</p>
            <ClientPicker autoFocus onPick={(client) => void create({ clientId: client.id })} />
            {/* Walk-in não está no protótipo, mas é requisito do produto desde a
                fase 07: quem entra sem cadastro não pode travar a fila. */}
            <Button fullWidth variant="outline" onClick={() => setWalkIn(true)}>
              Abrir sem cadastro (avulso)
            </Button>
          </>
        )}
      </div>
    </Modal>
  );
}

// ── Passo 2 — a comanda (l.3159) ───────────────────────────────────────────

interface WorkspaceProps {
  open: boolean;
  onClose: () => void;
  order: OrderDetail | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  catalog: PosCatalogResponse | undefined;
  catalogLoading: boolean;
  catalogError: boolean;
  onCatalogRetry: () => void;
}

function ComandaWorkspace({
  open,
  onClose,
  order,
  loading,
  error,
  onRetry,
  catalog,
  catalogLoading,
  catalogError,
  onCatalogRetry,
}: WorkspaceProps) {
  const wide = 'md:w-[880px] md:max-w-[94vw] lg:h-[680px] lg:max-h-[90dvh]';

  if (loading || !order) {
    return (
      <Modal open={open} onClose={onClose} title="Comanda" className={wide}>
        {error ? (
          <EmptyState
            message="Não foi possível carregar a comanda."
            description={posErrorMessage(error, 'Tente de novo em instantes.')}
            action={
              <Button variant="outline" onClick={onRetry}>
                Tentar de novo
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-10 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
          </div>
        )}
      </Modal>
    );
  }

  return (
    <ComandaBody
      key={order.id}
      open={open}
      onClose={onClose}
      order={order}
      catalog={catalog}
      catalogLoading={catalogLoading}
      catalogError={catalogError}
      onCatalogRetry={onCatalogRetry}
      panelClassName={wide}
    />
  );
}

/**
 * `key={order.id}` no chamador: desconto, split e a busca do catálogo são
 * estado local, e sem a chave trocar de comanda carregaria os valores da
 * anterior.
 */
function ComandaBody({
  open,
  onClose,
  order,
  catalog,
  catalogLoading,
  catalogError,
  onCatalogRetry,
  panelClassName,
}: {
  open: boolean;
  onClose: () => void;
  order: OrderDetail;
  catalog: PosCatalogResponse | undefined;
  catalogLoading: boolean;
  catalogError: boolean;
  onCatalogRetry: () => void;
  panelClassName: string;
}) {
  const { toast } = useToast();
  const { activeMembership } = useEstablishmentAuth();
  const canAssignBarber = activeMembership?.role !== 'BARBER';

  const isOpen = order.status === 'OPEN';

  const [pickerOpen, setPickerOpen] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [payment, setPayment] = useState<PaymentChoice>('PIX');
  const [split, setSplit] = useState<Record<string, string>>({});

  const assign = useAssignOrderMutation(order.id);
  const addItem = useAddOrderItemMutation(order.id);
  const updateItem = useUpdateOrderItemMutation(order.id);
  const removeItem = useRemoveOrderItemMutation(order.id);
  const closeOrder = useCloseOrderMutation(order.id);

  // ── Pagamento ───────────────────────────────────────────────────────────
  const splitting = payment === 'SPLIT';
  const splitCents = SPLIT_METHODS.reduce((sum, method) => sum + inputToCents(split[method] ?? ''), 0);
  const allocated = splitting ? splitCents : order.totalCents;
  const remaining = order.totalCents - allocated;

  const payments = splitting
    ? SPLIT_METHODS.map((method) => ({ method, amountCents: inputToCents(split[method] ?? '') })).filter(
        (entry) => entry.amountCents > 0,
      )
    : [{ method: payment as PaymentMethod, amountCents: order.totalCents }];

  const canClose = isOpen && order.items.length > 0 && order.totalCents > 0 && remaining === 0;

  const finish = async () => {
    try {
      await closeOrder.mutateAsync({ payments });
      toast({ message: `Comanda #${order.number} fechada.`, tone: 'success' });
      onClose();
    } catch (error) {
      // O fechamento é a transação única da fase 07: estoque, comissão, quota
      // de assinatura. Quando ela recusa, o motivo dela é a única informação
      // útil na tela — nunca um "algo deu errado".
      toast({ message: posErrorMessage(error, 'Não foi possível fechar a comanda.'), tone: 'danger' });
    }
  };

  const run = async (action: () => Promise<unknown>, fallback: string) => {
    try {
      await action();
    } catch (error) {
      toast({ message: posErrorMessage(error, fallback), tone: 'danger' });
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      className={panelClassName}
      bodyClassName="p-0"
      title={
        <span className="flex items-baseline gap-2">
          Comanda #{order.number}
          {!isOpen && <Badge tone="neutral">Fechada</Badge>}
        </span>
      }
      footer={
        <div className="flex flex-col gap-3">
          {/* Desktop mostra os totais na coluna da direita; no sheet ela rola
              para fora da tela, então o total mora aqui. */}
          <div className="flex items-baseline justify-between lg:hidden">
            <span className="text-[13px] text-fg-muted">Total</span>
            <span className="font-display text-lg font-bold text-gold tabular-nums">
              {formatBRL(order.totalCents)}
            </span>
          </div>
          {isOpen ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              {/* "Salvar e deixar aberta" (l.3315): tudo já está gravado a cada
                  clique, então o botão só sai do caminho — não há rascunho. */}
              <Button variant="outline" onClick={onClose}>
                Salvar e deixar aberta
              </Button>
              <Button loading={closeOrder.isPending} disabled={!canClose} onClick={() => void finish()}>
                Fechar comanda
              </Button>
            </div>
          ) : (
            <Button fullWidth variant="outline" onClick={onClose}>
              Voltar
            </Button>
          )}
        </div>
      }
    >
    <div className="flex min-h-0 flex-col lg:h-full">
      {/* ── Cabeçalho: cliente · barbeiro · trocar (l.3163) ───────────────
          No protótipo o bloco fica na barra de título; aqui ele é uma faixa
          de largura total logo abaixo dela, por dois motivos: o painel do
          "trocar" precisa EMPURRAR o conteúdo (um flutuante seria recortado
          pelo `overflow-hidden` do diálogo, e viraria sheet-dentro-de-sheet
          no celular), e a linha inteira cabe sem quebrar. */}
      <div className="shrink-0 border-b border-border px-4 py-3">
        <ComandaHeader
          order={order}
          isOpen={isOpen}
          pickerOpen={pickerOpen}
          onTogglePicker={() => setPickerOpen((value) => !value)}
        />
        {pickerOpen && isOpen && (
          <div className="mt-3 flex flex-col gap-3 rounded-xl border border-border bg-surface-2 p-3 lg:max-w-md">
            <ClientPicker
              compact
              autoFocus
              onPick={(client) => {
                setPickerOpen(false);
                void run(() => assign.mutateAsync({ clientId: client.id }), 'Não foi possível trocar o cliente.');
              }}
            />
            {canAssignBarber && (
              <Select
                label="Barbeiro"
                value={order.barberId ?? ''}
                onChange={(event) =>
                  void run(
                    () => assign.mutateAsync({ barberId: event.target.value || null }),
                    'Não foi possível trocar o barbeiro.',
                  )
                }
                options={[
                  { value: '', label: 'Sem barbeiro definido' },
                  ...(catalog?.barbers ?? []).map((barber) => ({ value: barber.id, label: barber.name })),
                ]}
              />
            )}
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-col lg:min-h-0 lg:flex-1 lg:flex-row">
        {/* Coluna 1 — catálogo (l.3195) */}
        <section className="flex min-h-0 flex-col gap-3 border-b border-border p-4 lg:w-[300px] lg:shrink-0 lg:border-b-0 lg:border-r">
          <Input
            aria-label="Buscar serviço ou produto"
            placeholder="Buscar serviço ou produto…"
            addonLeft={<SearchIcon size={14} />}
            value={catalogSearch}
            onChange={(event) => setCatalogSearch(event.target.value)}
          />
          <CatalogColumn
            catalog={catalog}
            loading={catalogLoading}
            error={catalogError}
            onRetry={onCatalogRetry}
            search={catalogSearch}
            disabled={!isOpen || addItem.isPending}
            onAddService={(serviceId) =>
              void run(
                () => addItem.mutateAsync({ kind: 'SERVICE', serviceId, barberId: order.barberId }),
                'Não foi possível adicionar o serviço.',
              )
            }
            onAddProduct={(productId) =>
              void run(
                () => addItem.mutateAsync({ kind: 'PRODUCT', productId, barberId: order.barberId }),
                'Não foi possível adicionar o produto.',
              )
            }
          />
        </section>

        {/* Coluna 2 — itens (l.3229) */}
        <section className="flex min-h-0 flex-col gap-2 border-b border-border p-4 lg:min-w-0 lg:flex-1 lg:border-b-0">
          <p className="flex shrink-0 items-baseline gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
            Itens <span className="font-normal tabular-nums">({order.items.length})</span>
          </p>

          <div className="flex min-h-0 flex-1 flex-col gap-2 lg:overflow-y-auto">
            {order.items.length === 0 ? (
              <EmptyState
                message="Nenhum item adicionado"
                description="Clique em um serviço ou produto ao lado."
              />
            ) : (
              order.items.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  editable={isOpen}
                  busy={updateItem.isPending || removeItem.isPending}
                  onQuantity={(quantity) =>
                    void run(
                      () => updateItem.mutateAsync({ itemId: item.id, dto: { quantity } }),
                      'Não foi possível mudar a quantidade.',
                    )
                  }
                  onRemove={() =>
                    void run(() => removeItem.mutateAsync(item.id), 'Não foi possível remover o item.')
                  }
                />
              ))
            )}
          </div>
        </section>

        {/* Coluna 3 — resumo, desconto, fidelidade e pagamento (l.3266) */}
        <section className="flex shrink-0 flex-col gap-4 p-4 lg:w-[280px] lg:overflow-y-auto lg:border-l lg:border-border">
          <SummaryColumn order={order} editable={isOpen} />

          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">Pagamento</p>
            {isOpen ? (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {[...SPLIT_METHODS, 'SPLIT' as const].map((choice) => {
                    const active = payment === choice;
                    return (
                      <button
                        key={choice}
                        type="button"
                        aria-pressed={active}
                        onClick={() => {
                          setPayment(choice);
                          if (choice !== 'SPLIT') setSplit({});
                        }}
                        className={cn(
                          'min-h-11 rounded-lg border px-3.5 text-xs font-semibold transition-colors lg:min-h-[34px]',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold',
                          active
                            ? 'border-gold bg-gold/15 text-gold'
                            : 'border-border text-fg hover:bg-surface-2',
                        )}
                      >
                        {choice === 'SPLIT' ? 'Dividir' : methodLabel(choice)}
                      </button>
                    );
                  })}
                </div>

                {splitting && (
                  <div className="flex flex-col gap-1.5 pt-1">
                    {SPLIT_METHODS.map((method) => (
                      <div key={method} className="flex items-center gap-2">
                        <label htmlFor={`split-${method}`} className="flex-1 text-[13px] font-medium text-fg">
                          {methodLabel(method)}
                        </label>
                        <input
                          id={`split-${method}`}
                          inputMode="decimal"
                          placeholder="0,00"
                          value={split[method] ?? ''}
                          onChange={(event) =>
                            setSplit((current) => ({ ...current, [method]: event.target.value }))
                          }
                          className="h-11 w-24 rounded-control border border-border bg-surface-2 px-2 text-right text-[13px] font-medium text-fg outline-none focus:border-gold lg:h-8"
                        />
                      </div>
                    ))}
                    <p
                      className={cn(
                        'text-xs font-semibold tabular-nums',
                        remaining === 0 ? 'text-success' : 'text-danger',
                      )}
                    >
                      {remaining === 0
                        ? 'Pagamento fecha com o total'
                        : remaining > 0
                          ? `Falta alocar ${formatBRL(remaining)}`
                          : `Excedeu em ${formatBRL(-remaining)}`}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <p className="text-[13px] text-fg-muted">
                Pago em {order.payments.map((entry) => methodLabel(entry.method)).join(' + ') || '—'}
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
    </Modal>
  );
}

// ── Blocos ─────────────────────────────────────────────────────────────────

function ComandaHeader({
  order,
  isOpen,
  pickerOpen,
  onTogglePicker,
}: {
  order: OrderDetail;
  isOpen: boolean;
  pickerOpen: boolean;
  onTogglePicker: () => void;
}) {
  const name = order.clientName ?? 'Cliente avulso';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        aria-hidden
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gold/15 text-[10px] font-semibold text-gold"
      >
        {initialsOf(name)}
      </span>
      <span className="text-[13px] font-medium text-fg">{name}</span>
      <span className="text-[13px] text-fg-muted">· {order.barberName ?? 'Sem barbeiro'}</span>
      {isOpen && (
        <button
          type="button"
          aria-expanded={pickerOpen}
          onClick={onTogglePicker}
          className="-my-2 flex min-h-11 items-center px-2 text-xs font-semibold text-gold underline-offset-4 hover:underline lg:my-0 lg:min-h-0 lg:px-0"
        >
          {pickerOpen ? 'fechar' : 'trocar'}
        </button>
      )}
    </div>
  );
}

function CatalogColumn({
  catalog,
  loading,
  error,
  onRetry,
  search,
  disabled,
  onAddService,
  onAddProduct,
}: {
  catalog: PosCatalogResponse | undefined;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  search: string;
  disabled: boolean;
  onAddService: (id: string) => void;
  onAddProduct: (id: string) => void;
}) {
  const term = search.trim().toLowerCase();
  const services = (catalog?.services ?? []).filter((row) => row.name.toLowerCase().includes(term));
  const products = (catalog?.products ?? []).filter((row) => row.name.toLowerCase().includes(term));

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-10 rounded-lg" />
        <Skeleton className="h-10 rounded-lg" />
        <Skeleton className="h-10 rounded-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        message="Catálogo indisponível."
        action={
          <Button variant="outline" size="sm" onClick={onRetry}>
            Tentar de novo
          </Button>
        }
      />
    );
  }

  if (services.length === 0 && products.length === 0) {
    return (
      <EmptyState
        message={term ? 'Nada encontrado.' : 'Sem serviços ou produtos ativos.'}
        description={term ? undefined : 'Cadastre em Serviços & Produtos para vender pelo balcão.'}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 lg:overflow-y-auto">
      {services.length > 0 && (
        <CatalogGroup label="Serviços">
          {services.map((service) => (
            <CatalogRow
              key={service.id}
              name={service.name}
              priceCents={service.priceCents}
              disabled={disabled}
              onClick={() => onAddService(service.id)}
            />
          ))}
        </CatalogGroup>
      )}
      {products.length > 0 && (
        <CatalogGroup label="Produtos">
          {products.map((product) => (
            <CatalogRow
              key={product.id}
              name={product.name}
              priceCents={product.priceCents}
              // Estoque zerado não some da lista: o balconista precisa ver que
              // o produto existe e acabou, não achar que nunca foi cadastrado.
              note={product.stock <= 0 ? 'Sem estoque' : undefined}
              disabled={disabled || product.stock <= 0}
              onClick={() => onAddProduct(product.id)}
            />
          ))}
        </CatalogGroup>
      )}
    </div>
  );
}

function CatalogGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">{label}</p>
      {children}
    </div>
  );
}

function CatalogRow({
  name,
  priceCents,
  note,
  disabled,
  onClick,
}: {
  name: string;
  priceCents: number;
  note?: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex min-h-11 items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-left transition-colors',
        'hover:border-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border',
      )}
    >
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium text-fg">{name}</span>
        {note && <span className="block text-[11px] text-fg-muted">{note}</span>}
      </span>
      <span className="shrink-0 text-[13px] font-semibold text-gold tabular-nums">{formatBRL(priceCents)}</span>
    </button>
  );
}

function ItemRow({
  item,
  editable,
  busy,
  onQuantity,
  onRemove,
}: {
  item: OrderDetail['items'][number];
  editable: boolean;
  busy: boolean;
  onQuantity: (quantity: number) => void;
  onRemove: () => void;
}) {
  const covered = item.coveredBySubscription;
  return (
    <div className="flex shrink-0 flex-col gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-fg">{item.description}</p>
          <p className="text-xs text-fg-muted">
            {covered ? (
              <span className="text-gold">Incluído na assinatura</span>
            ) : (
              `${formatBRL(item.unitPriceCents)} un.`
            )}
            {item.barberName ? ` · ${item.barberName}` : ''}
          </p>
        </div>
        {editable && (
          <button
            type="button"
            aria-label={`Remover ${item.description}`}
            disabled={busy}
            onClick={onRemove}
            className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-fg-muted transition-colors hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:opacity-50 lg:-m-1 lg:h-8 lg:w-8"
          >
            <TrashIcon />
          </button>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        {editable && !covered ? (
          <div className="flex items-center gap-1.5">
            <StepButton
              label={`Diminuir ${item.description}`}
              disabled={busy || item.quantity <= 1}
              onClick={() => onQuantity(item.quantity - 1)}
            >
              −
            </StepButton>
            <span className="w-5 text-center text-[13px] font-semibold text-fg tabular-nums">
              {item.quantity}
            </span>
            <StepButton
              label={`Aumentar ${item.description}`}
              disabled={busy}
              onClick={() => onQuantity(item.quantity + 1)}
            >
              +
            </StepButton>
          </div>
        ) : (
          <span className="text-[13px] text-fg-muted tabular-nums">{item.quantity}×</span>
        )}
        <span className="text-[13px] font-semibold text-fg tabular-nums">{formatBRL(item.totalCents)}</span>
      </div>
    </div>
  );
}

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-11 w-11 items-center justify-center rounded-md border border-border text-base font-semibold text-fg transition-colors lg:h-[26px] lg:w-[26px] lg:text-sm',
        'hover:border-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold',
        'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border',
      )}
    >
      {children}
    </button>
  );
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Subtotal · desconto · fidelidade · total (l.3267–3294). */
function SummaryColumn({ order, editable }: { order: OrderDetail; editable: boolean }) {
  const { toast } = useToast();
  const applyDiscount = useApplyDiscountMutation(order.id);
  const redeemLoyalty = useRedeemLoyaltyMutation(order.id);

  // O protótipo tem o alternador `R$ | %` colado no campo — um único controle,
  // não um `Select` de três opções: "nenhum" é o campo vazio.
  const [mode, setMode] = useState<'FIXED' | 'PERCENT'>(order.discountType ?? 'FIXED');
  const [value, setValue] = useState(() => {
    if (order.discountType === 'PERCENT') return String(order.discountValue / 100);
    if (order.discountType === 'FIXED') return centsToInput(order.discountValue);
    return '';
  });

  const commit = (nextMode: 'FIXED' | 'PERCENT', raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      if (!order.discountType) return;
      void applyDiscount
        .mutateAsync({ discountType: null, discountValue: 0 })
        .catch((error: unknown) =>
          toast({ message: posErrorMessage(error, 'Não foi possível tirar o desconto.'), tone: 'danger' }),
        );
      return;
    }
    const parsed = Number(trimmed.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < 0) return;
    // As duas unidades do contrato são centésimos: 10% → 1000 basis points,
    // R$ 10,00 → 1000 centavos. Mesma conta, significados diferentes.
    const discountValue = Math.round(parsed * 100);
    void applyDiscount
      .mutateAsync({ discountType: nextMode, discountValue })
      .catch((error: unknown) =>
        toast({ message: posErrorMessage(error, 'Não foi possível aplicar o desconto.'), tone: 'danger' }),
      );
  };

  const loyaltyAffordable = order.loyaltyBalance >= order.loyaltyPointsRequired;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex justify-between text-[13px] text-fg-muted">
        <span>Subtotal</span>
        <span className="text-fg tabular-nums">{formatBRL(order.subtotalCents)}</span>
      </div>

      {editable ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] text-fg-muted">Desconto</span>
          <div className="flex gap-1.5">
            <div className="flex shrink-0 gap-0.5 rounded-lg border border-border bg-surface-2 p-0.5">
              {(['FIXED', 'PERCENT'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={mode === option}
                  onClick={() => {
                    setMode(option);
                    commit(option, value);
                  }}
                  className={cn(
                    'min-h-11 min-w-11 rounded-md px-2.5 text-xs font-semibold transition-colors lg:min-h-[28px] lg:min-w-0',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold',
                    mode === option ? 'bg-gold text-bg' : 'text-fg-muted hover:text-fg',
                  )}
                >
                  {option === 'FIXED' ? 'R$' : '%'}
                </button>
              ))}
            </div>
            <input
              aria-label={mode === 'FIXED' ? 'Desconto em reais' : 'Desconto em porcentagem'}
              inputMode="decimal"
              placeholder="0"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onBlur={() => commit(mode, value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
              className="h-11 min-w-0 flex-1 rounded-control border border-border bg-surface-2 px-2.5 text-[13px] font-medium text-fg outline-none focus:border-gold lg:h-8"
            />
          </div>
          {order.discountCents > 0 && (
            <span className="text-xs text-fg-muted tabular-nums">− {formatBRL(order.discountCents)}</span>
          )}
        </div>
      ) : (
        order.discountCents > 0 && (
          <div className="flex justify-between text-[13px] text-fg-muted">
            <span>Desconto</span>
            <span className="tabular-nums">− {formatBRL(order.discountCents)}</span>
          </div>
        )
      )}

      {/* Card de fidelidade (l.3283) — só existe quando a barbearia TEM
          programa e a comanda é de cliente cadastrado. Walk-in não pontua. */}
      {order.loyaltyEnabled && (
        <div
          className={cn(
            'flex flex-col gap-1 rounded-xl border p-3',
            order.useLoyalty ? 'border-gold bg-gold/10' : 'border-border bg-surface-2',
          )}
        >
          <Switch
            label="Resgatar pontos"
            checked={order.useLoyalty}
            disabled={!editable || (!order.useLoyalty && !loyaltyAffordable)}
            onChange={(event) =>
              void redeemLoyalty
                .mutateAsync({ useLoyalty: event.target.checked })
                .catch((error: unknown) =>
                  toast({
                    message: posErrorMessage(error, 'Não foi possível mudar o resgate.'),
                    tone: 'danger',
                  }),
                )
            }
          />
          <span className="text-xs text-fg-muted tabular-nums">
            − {formatBRL(order.loyaltyRewardCents)} · usa {order.loyaltyPointsRequired} pts
          </span>
          <span className="text-[11px] text-fg-subtle tabular-nums">
            Saldo do cliente: {order.loyaltyBalance} pts
          </span>
          {!loyaltyAffordable && !order.useLoyalty && (
            <span className="text-[11px] text-fg-subtle">Saldo insuficiente para este resgate.</span>
          )}
        </div>
      )}

      {order.loyaltyDiscountCents > 0 && (
        <div className="flex justify-between text-[13px] text-fg-muted">
          <span>Fidelidade</span>
          <span className="tabular-nums">− {formatBRL(order.loyaltyDiscountCents)}</span>
        </div>
      )}

      <div className="h-px bg-border" />

      <div className="flex items-baseline justify-between font-display text-lg font-bold text-gold">
        <span>Total</span>
        <span className="tabular-nums">{formatBRL(order.totalCents)}</span>
      </div>
    </div>
  );
}
