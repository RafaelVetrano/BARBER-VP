'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ErrorCode,
  formatDuration,
  NO_PREFERENCE_BARBER,
  type AppointmentSummary,
  type PublicBarbershop,
} from '@barbervp/types';
import {
  ApiError,
  ArrowLeftIcon,
  Button,
  IconButton,
  Modal,
  OtpInput,
  useClientAuth,
  useToast,
} from '@barbervp/ui';
import { bookingApi } from '@/lib/booking/booking-api';
import { formatPrice } from '@/lib/booking/format';
import { StepServices } from './step-services';
import { StepBarber } from './step-barber';
import { StepDateTime } from './step-datetime';
import { StepConfirm } from './step-confirm';
import { WizardSuccess } from './wizard-success';
import { useBookingWizard, type WizardStep } from './use-booking-wizard';

const STEP_TITLES: Record<WizardStep, string> = {
  1: 'Serviços',
  2: 'Barbeiro',
  3: 'Data e horário',
  4: 'Confirmação',
};

export interface BookingWizardProps {
  shop: PublicBarbershop;
  open: boolean;
  onClose: () => void;
  /** Serviço marcado de saída pelo botão "Agendar" de um card. */
  initialServiceId?: string | null;
  onRequestLogin: () => void;
  onRequestRegister: () => void;
}

/**
 * Wizard de agendamento — 4 passos, um por vez.
 *
 * **Um passo por vez, com entrada animada, em vez do track de 400%.** O
 * protótipo mantém as quatro colunas montadas lado a lado e desliza um
 * `translateX`; isso deixa três telas de campos e botões vivos fora de vista,
 * alcançáveis por Tab e lidos por leitor de tela. Aqui só o passo corrente é
 * montado, e ele entra pelo lado do movimento (`bvp-in-right` ao avançar,
 * `bvp-in-left` ao voltar). O efeito visual é o mesmo; o comportamento com
 * teclado é o correto.
 *
 * A responsividade vem do `Modal` de `packages/ui`: bottom-sheet abaixo de
 * 768px, modal centrado de 480px acima — o mesmo corte do protótipo, resolvido
 * em CSS.
 */
export function BookingWizard({
  shop,
  open,
  onClose,
  initialServiceId,
  onRequestLogin,
  onRequestRegister,
}: BookingWizardProps) {
  const wizard = useBookingWizard(shop, open);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { api } = useClientAuth();

  const [confirmingExit, setConfirmingExit] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [booked, setBooked] = useState<AppointmentSummary | null>(null);
  /** Desafio aberto quando o backend pede verificação do visitante. */
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [challengeMask, setChallengeMask] = useState('');
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState<string | null>(null);

  // O serviço pré-marcado é registrado antes de o wizard abrir.
  if (open && initialServiceId) {
    wizard.preselectService(initialServiceId);
  }

  /**
   * Toast do combo — "Combo aplicado, sai mais barato 😉" do protótipo.
   *
   * Sem ele, o cliente marca dois serviços e vê o total mudar para um número
   * MENOR que a soma, sem explicação. Dispara só na transição para aplicado,
   * por isso a referência guarda o estado anterior.
   */
  const comboWasApplied = useRef(false);
  const comboApplied = wizard.quote?.comboApplied ?? false;
  const comboName = wizard.quote?.comboServiceName ?? null;

  useEffect(() => {
    if (comboApplied && !comboWasApplied.current) {
      toast({
        message: `${comboName ?? 'Combo'} aplicado — sai mais barato 😉`,
        tone: 'success',
      });
    }
    comboWasApplied.current = comboApplied;
  }, [comboApplied, comboName, toast]);

  /** Grade e cotação envelhecem no instante em que alguém reserva. */
  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['booking', 'availability'] });
  }, [queryClient]);

  const finish = useCallback(
    (appointment: AppointmentSummary) => {
      wizard.persistGuest();
      setBooked(appointment);
      setChallengeId(null);
      setOtp('');
      invalidate();
    },
    [wizard, invalidate],
  );

  const createMutation = useMutation({
    mutationFn: () =>
      bookingApi.create(api, shop.slug, {
        serviceIds: wizard.state.serviceIds,
        barberId:
          wizard.state.barberId === NO_PREFERENCE_BARBER ? null : wizard.state.barberId,
        startsAt: wizard.state.startsAt!,
        notes: wizard.state.notes.trim() || undefined,
        guestName: wizard.client ? undefined : wizard.state.guestName.trim(),
        guestPhone: wizard.client ? undefined : wizard.state.guestPhone,
      }),
    onSuccess: (result) => {
      if (result.kind === 'confirmed') {
        finish(result.appointment);
        return;
      }
      setChallengeId(result.challengeId);
      setChallengeMask(result.destinationMasked);
      setOtp('');
      setOtpError(null);
    },
    onError: (error: unknown) => handleBookingError(error),
  });

  const confirmMutation = useMutation({
    mutationFn: (code: string) =>
      bookingApi.confirm(api, shop.slug, { challengeId: challengeId!, code }),
    onSuccess: (result) => {
      if (result.kind === 'confirmed') {
        finish(result.appointment);
      }
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError && error.status === 400) {
        setOtpError(error.message);
        setOtp('');
        return;
      }
      handleBookingError(error);
    },
  });

  /**
   * 409 no agendamento significa que alguém chegou primeiro. A tela volta para
   * a grade JÁ ATUALIZADA — mandar o cliente de volta a uma lista que ainda
   * mostra o horário tomado é convidá-lo a bater na mesma parede.
   */
  function handleBookingError(error: unknown) {
    if (error instanceof ApiError && error.code === ErrorCode.DOUBLE_BOOKING) {
      wizard.patch({ startsAt: null });
      wizard.goTo(3);
      setChallengeId(null);
      invalidate();
      void wizard.refetchAvailability();
      toast({ message: error.message, tone: 'danger', duration: 5_000 });
      return;
    }

    toast({
      message: error instanceof ApiError ? error.message : 'Não foi possível agendar. Tente de novo.',
      tone: 'danger',
    });
  }

  const submitting = createMutation.isPending || confirmMutation.isPending;

  const handleContinue = () => {
    if (wizard.state.step < 4) {
      wizard.next();
      return;
    }
    setShowErrors(true);
    if (!wizard.canContinue) return;
    createMutation.mutate();
  };

  const requestExit = () => {
    if (booked || !wizard.hasProgress) {
      close();
      return;
    }
    setConfirmingExit(true);
  };

  const close = () => {
    setConfirmingExit(false);
    setShowErrors(false);
    setBooked(null);
    setChallengeId(null);
    setOtp('');
    onClose();
  };

  const restart = () => {
    setBooked(null);
    setShowErrors(false);
    wizard.reset();
  };

  // ── Rodapé fixo: resumo + CTA (o botão de avançar do protótipo) ──────────

  const footer = booked ? null : challengeId ? (
    <Button
      fullWidth
      size="lg"
      loading={confirmMutation.isPending}
      disabled={otp.length < 6}
      onClick={() => confirmMutation.mutate(otp)}
    >
      Confirmar agendamento
    </Button>
  ) : (
    <div className="flex flex-col gap-2">
      <p className="truncate text-[13px] text-fg-muted">
        {wizard.quote
          ? `${wizard.quote.services.map((service) => service.name).join(' + ')} · ${formatDuration(wizard.quote.totalDurationMin)}`
          : 'Nenhum serviço selecionado'}
      </p>
      <div className="flex items-center justify-between gap-3">
        <span className="text-base font-bold text-gold">
          {formatPrice(wizard.quote?.totalPriceCents ?? 0)}
        </span>
        <Button
          size="lg"
          className="min-w-[55%] flex-1"
          disabled={!wizard.canContinue && wizard.state.step < 4}
          loading={submitting}
          onClick={handleContinue}
        >
          {wizard.state.step === 4 ? 'Confirmar agendamento' : 'Continuar'}
        </Button>
      </div>
    </div>
  );

  const enterAnimation =
    wizard.state.direction === 'forward' ? 'animate-bvp-in-right' : 'animate-bvp-in-left';

  return (
    <Modal
      open={open}
      onClose={requestExit}
      title={booked ? undefined : challengeId ? 'Verificação' : STEP_TITLES[wizard.state.step]}
      aria-label={booked ? 'Agendamento confirmado' : 'Agendar horário'}
      // Na tela de sucesso o cabeçalho inteiro sai: sem título e sem ✕, o
      // `Modal` não o renderiza, e o único ✕ passa a ser o do `SuccessScreen`.
      hideCloseButton={Boolean(booked)}
      // Um clique no fundo no meio do agendamento apagaria tudo o que foi escolhido.
      dismissOnOverlayClick={false}
      headerAction={
        !booked && !challengeId && wizard.state.step > 1 ? (
          <IconButton aria-label="Voltar" onClick={wizard.back}>
            <ArrowLeftIcon size={18} />
          </IconButton>
        ) : undefined
      }
      footer={footer ?? undefined}
    >
      {booked ? (
        <WizardSuccess
          shop={shop}
          appointment={booked}
          onRestart={restart}
          onClose={close}
        />
      ) : challengeId ? (
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          {/*
            Texto deliberadamente genérico. O backend não conta QUAL regra
            disparou (`REGISTERED_PHONE`, `TOO_MANY_OPEN`, `IP_BURST`), e a tela
            não pode inventar: dizer "esse número já tem conta" transformaria o
            agendamento num oráculo de quem é cadastrado na plataforma.
          */}
          <p className="text-sm leading-relaxed text-fg-muted">
            Só para confirmar que o WhatsApp é seu: enviamos um código para{' '}
            <span className="font-semibold text-fg">{challengeMask}</span>.
          </p>
          <OtpInput
            value={otp}
            onChange={(value) => {
              setOtp(value);
              setOtpError(null);
            }}
            error={otpError ?? undefined}
            autoFocus
          />
          <button
            type="button"
            onClick={() => {
              setChallengeId(null);
              setOtp('');
            }}
            className="rounded text-[13px] text-gold hover:text-gold-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            Usar outro número
          </button>
        </div>
      ) : (
        <>
          <Stepper step={wizard.state.step} />

          <div key={wizard.state.step} className={`mt-4 ${enterAnimation}`}>
            {wizard.state.step === 1 && (
              <StepServices services={shop.services} wizard={wizard} />
            )}
            {wizard.state.step === 2 && <StepBarber barbers={shop.barbers} wizard={wizard} />}
            {wizard.state.step === 3 && <StepDateTime wizard={wizard} />}
            {wizard.state.step === 4 && (
              <StepConfirm
                shop={shop}
                wizard={wizard}
                onEdit={wizard.goTo}
                onRequestLogin={onRequestLogin}
                onRequestRegister={onRequestRegister}
                showErrors={showErrors}
              />
            )}
          </div>
        </>
      )}

      {confirmingExit && (
        <div className="fixed inset-0 z-10 grid place-items-center bg-black/50 p-5">
          <div className="flex w-full max-w-[300px] flex-col gap-4 rounded-2xl border border-border bg-surface-3 p-5">
            <p className="text-sm leading-relaxed text-fg">
              Sair do agendamento? Suas escolhas serão perdidas.
            </p>
            <div className="flex flex-col gap-2">
              <Button fullWidth onClick={() => setConfirmingExit(false)}>
                Continuar agendando
              </Button>
              <Button variant="outline" fullWidth onClick={close}>
                Sair
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** As 4 barrinhas + "Etapa X de 4 · Título" do protótipo. */
function Stepper({ step }: { step: WizardStep }) {
  return (
    <div>
      <div className="flex gap-1" aria-hidden="true">
        {[1, 2, 3, 4].map((index) => (
          <span
            key={index}
            className={[
              'h-1 flex-1 rounded-full',
              index < step ? 'bg-gold' : index === step ? 'bg-gold/50' : 'bg-border',
            ].join(' ')}
          />
        ))}
      </div>
      <p className="mt-2 text-xs text-fg-muted" aria-live="polite">
        Etapa {step} de 4 · {STEP_TITLES[step]}
      </p>
    </div>
  );
}
