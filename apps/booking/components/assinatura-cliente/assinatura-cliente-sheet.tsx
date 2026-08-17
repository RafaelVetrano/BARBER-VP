'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ClientPlanDetail, SubscribePaymentMethod } from '@barbervp/types';
import {
  Button,
  IconButton,
  Input,
  Modal,
  Radio,
  SuccessScreen,
  ArrowLeftIcon,
  authErrorMessage,
  useClientAuth,
  useToast,
} from '@barbervp/ui';
import { clientAccountApi } from '../../lib/client-account-api';
import { formatPrice } from '../../lib/format';

export interface AssinaturaClienteSheetProps {
  open: boolean;
  onClose: () => void;
  slug: string;
  planId: string | null;
  /** Sem sessão, "Continuar" pede login/cadastro em vez de seguir. */
  onRequestAuth: (planId: string) => void;
  onSubscribed?: () => void;
  onScheduleNow: () => void;
  onViewSubscription: () => void;
}

type Screen = 'detalhe' | 'pagamento' | 'sucesso';

/**
 * `AssinaturaCliente` — sheet reaproveitável (mesmo padrão do `ClienteAuth`):
 * detalhe do plano → pagamento (cartão OU Pix, ambos simulados) → sucesso.
 *
 * Abre a partir de dois lugares — o card "Assinar" da página pública e a aba
 * "Assinatura" da `MinhaConta` sem assinatura — por isso não navega nem
 * conhece rota: só `open`/`onClose` e o `planId` escolhido por quem a abriu.
 */
export function AssinaturaClienteSheet({
  open,
  onClose,
  slug,
  planId,
  onRequestAuth,
  onSubscribed,
  onScheduleNow,
  onViewSubscription,
}: AssinaturaClienteSheetProps) {
  const { api, client } = useClientAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [screen, setScreen] = useState<Screen>('detalhe');
  const [paymentMethod, setPaymentMethod] = useState<SubscribePaymentMethod>('CREDIT_CARD');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [cardName, setCardName] = useState('');
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  useEffect(() => {
    if (open) {
      setScreen('detalhe');
      setPaymentMethod('CREDIT_CARD');
      setCardNumber('');
      setCardExpiry('');
      setCardCvv('');
      setCardName('');
      setShowExitConfirm(false);
    }
  }, [open, planId]);

  const plansQuery = useQuery({
    queryKey: ['minha-conta', 'subscription-plans', slug],
    queryFn: () => clientAccountApi.plans(api, slug),
    enabled: open && Boolean(planId),
  });

  const plan = plansQuery.data?.find((item) => item.id === planId) ?? null;

  const subscribeMutation = useMutation({
    mutationFn: () =>
      clientAccountApi.subscribe(api, slug, {
        planId: planId!,
        paymentMethod,
        card:
          paymentMethod === 'CREDIT_CARD'
            ? { number: cardNumber, expiry: cardExpiry, cvv: cardCvv, holderName: cardName }
            : undefined,
      }),
    onSuccess: () => {
      setScreen('sucesso');
      void queryClient.invalidateQueries({ queryKey: ['minha-conta', 'subscription', slug] });
      onSubscribed?.();
    },
    onError: (error) => {
      toast({ message: authErrorMessage(error, 'Não foi possível confirmar a assinatura.'), tone: 'danger' });
    },
  });

  const requestClose = () => {
    if (screen === 'pagamento') {
      setShowExitConfirm(true);
      return;
    }
    onClose();
  };

  if (!planId) return null;

  const cardFilled = cardNumber.trim() && cardExpiry.trim() && cardCvv.trim() && cardName.trim();
  const confirmDisabled = paymentMethod === 'CREDIT_CARD' ? !cardFilled : false;

  return (
    <>
      <Modal
        open={open}
        onClose={requestClose}
        title={screen === 'sucesso' ? undefined : screen === 'pagamento' ? 'Pagamento' : (plan?.name ?? 'Plano')}
        hideCloseButton={screen === 'sucesso'}
        headerAction={
          screen === 'pagamento' ? (
            <IconButton aria-label="Voltar" onClick={() => setScreen('detalhe')}>
              <ArrowLeftIcon size={18} />
            </IconButton>
          ) : undefined
        }
        footer={
          screen === 'pagamento' && plan ? (
            <div className="flex flex-col gap-2.5">
              <span className="text-[13px] text-fg-muted">
                {formatPrice(plan.priceCents)}/mês · primeira cobrança hoje, renova todo dia{' '}
                {plan.billingDay}
              </span>
              <Button
                fullWidth
                size="lg"
                disabled={confirmDisabled}
                loading={subscribeMutation.isPending}
                onClick={() => subscribeMutation.mutate()}
              >
                Confirmar assinatura
              </Button>
            </div>
          ) : undefined
        }
      >
        {screen === 'detalhe' && (
          <PlanDetail
            plan={plan}
            loading={plansQuery.isPending}
            onContinue={() => {
              if (!client) {
                onRequestAuth(planId);
                return;
              }
              setScreen('pagamento');
            }}
          />
        )}

        {screen === 'pagamento' && (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <PaymentMethodOption
                label="Cartão de crédito"
                selected={paymentMethod === 'CREDIT_CARD'}
                onSelect={() => setPaymentMethod('CREDIT_CARD')}
              />
              <PaymentMethodOption
                label="Pix"
                selected={paymentMethod === 'PIX'}
                onSelect={() => setPaymentMethod('PIX')}
              />
            </div>

            {paymentMethod === 'CREDIT_CARD' ? (
              <div className="flex flex-col gap-3">
                <Input
                  label="Número do cartão"
                  value={cardNumber}
                  onChange={(event) => setCardNumber(event.target.value)}
                  placeholder="0000 0000 0000 0000"
                  inputMode="numeric"
                />
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Validade"
                    value={cardExpiry}
                    onChange={(event) => setCardExpiry(event.target.value)}
                    placeholder="MM/AA"
                  />
                  <Input
                    label="CVV"
                    value={cardCvv}
                    onChange={(event) => setCardCvv(event.target.value)}
                    placeholder="123"
                    inputMode="numeric"
                  />
                </div>
                <Input
                  label="Nome no cartão"
                  value={cardName}
                  onChange={(event) => setCardName(event.target.value)}
                  placeholder="Como está no cartão"
                />
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3.5">
                <p className="text-center text-[13px] text-fg-muted">
                  A cobrança será enviada via Pix todo ciclo, no dia {plan?.billingDay ?? 5}
                </p>
                <div className="grid size-44 place-items-center rounded-xl border border-dashed border-border bg-surface-3">
                  <span className="font-mono text-xs text-fg-muted">QR CODE</span>
                </div>
              </div>
            )}
          </div>
        )}

        {screen === 'sucesso' && plan && (
          <SuccessScreen
            title="Assinatura ativa! 🎉"
            subtitle={`Bem-vindo ao ${plan.name}`}
            onClose={onClose}
            summary={plan.items.map((item) => ({
              label: item.serviceName,
              emphasis: false,
            }))}
            note={`Próxima cobrança: dia ${plan.billingDay}`}
            actions={
              <>
                <Button
                  fullWidth
                  size="lg"
                  onClick={() => {
                    onClose();
                    onScheduleNow();
                  }}
                >
                  Agendar agora
                </Button>
                <Button
                  fullWidth
                  variant="outline"
                  onClick={() => {
                    onClose();
                    onViewSubscription();
                  }}
                >
                  Ver minha assinatura
                </Button>
              </>
            }
          />
        )}
      </Modal>

      <Modal
        open={showExitConfirm}
        onClose={() => setShowExitConfirm(false)}
        title="Sair da assinatura?"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-fg-muted">
            Os dados de pagamento preenchidos serão perdidos.
          </p>
          <div className="flex flex-col gap-2">
            <Button onClick={() => setShowExitConfirm(false)}>Continuar</Button>
            <Button
              variant="outline"
              onClick={() => {
                setShowExitConfirm(false);
                onClose();
              }}
            >
              Sair
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function PaymentMethodOption({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      className={[
        'flex h-14 cursor-pointer items-center gap-3 rounded-xl border px-4',
        selected ? 'border-gold bg-gold/10' : 'border-border',
      ].join(' ')}
    >
      <Radio checked={selected} onChange={onSelect} name="payment-method" />
      <span className="text-sm font-semibold text-fg">{label}</span>
    </label>
  );
}

function PlanDetail({
  plan,
  loading,
  onContinue,
}: {
  plan: ClientPlanDetail | null;
  loading: boolean;
  onContinue: () => void;
}) {
  if (loading || !plan) {
    return <div className="h-40 animate-bvp-shimmer rounded-xl bg-surface-3" />;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <span className="font-display text-[22px] font-bold text-fg">{plan.name}</span>
        {plan.isPopular && (
          <span className="w-fit rounded-full bg-gold/15 px-2.5 py-0.5 text-xs text-gold">
            Mais popular
          </span>
        )}
        <span className="flex items-baseline gap-1.5">
          <span className="font-display text-[32px] font-bold text-gold">{formatPrice(plan.priceCents)}</span>
          <span className="text-sm text-fg-muted">/mês</span>
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold uppercase tracking-wide text-fg-muted">
          Serviços incluídos
        </span>
        {plan.items.map((item) => (
          <div key={item.serviceId} className="flex h-10 items-center border-b border-border">
            <span className="text-sm text-fg">
              {item.quota}× {item.serviceName}
            </span>
          </div>
        ))}
      </div>

      {plan.savingsCents > 0 && (
        <div className="flex flex-col gap-1 rounded-xl bg-surface-3 p-3.5">
          <span className="text-sm font-semibold text-success">
            Economize {formatPrice(plan.savingsCents)}/mês
          </span>
          <span className="text-[13px] text-fg-muted">Cobrança todo dia {plan.billingDay}</span>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <span className="text-[15px] font-semibold text-fg">Como funciona</span>
        {[
          'Os usos renovam a cada ciclo mensal',
          'Agende normalmente — o serviço coberto sai por R$ 0',
          'Cancele quando quiser, sem multa',
        ].map((line) => (
          <div key={line} className="flex items-start gap-2.5">
            <span className="mt-1 size-1 shrink-0 rounded-full bg-gold" />
            <span className="text-sm leading-relaxed text-fg-muted">{line}</span>
          </div>
        ))}
      </div>

      <Button size="lg" onClick={onContinue}>
        Continuar
      </Button>
    </div>
  );
}
