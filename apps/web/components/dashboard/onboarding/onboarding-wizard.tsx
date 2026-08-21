'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ONBOARDING_STEPS,
  SKIPPABLE_STEPS,
  normalizeMobilePhone,
  normalizePhone,
  type OnboardingState,
} from '@barbervp/types';
import {
  Skeleton,
  authErrorMessage,
  onboardingApi,
  useEstablishmentAuth,
  useToast,
} from '@barbervp/ui';
import { WizardChrome } from './wizard-chrome';
import { WizardWelcome } from './wizard-welcome';
import { WizardDone } from './wizard-done';
import { StepProfile } from './step-profile';
import { StepLocation } from './step-location';
import { StepIdentity } from './step-identity';
import { StepServices } from './step-services';
import { StepTeam } from './step-team';
import { StepBusinessHours, hasValidHours } from './step-business-hours';

/** `0` = boas-vindas · `1..6` = passos · `'done'` = conclusão. */
type WizardStep = number | 'done';

const STEP_COPY: Record<number, { title: string; subtitle: string }> = {
  1: {
    title: 'Dados da sua barbearia',
    subtitle: 'Preenchemos parte com o que você já informou. Confira e complete.',
  },
  2: {
    title: 'Onde fica sua barbearia',
    subtitle: 'Digite o CEP e buscamos o endereço para você. Confira o número e o complemento.',
  },
  3: {
    title: 'Identidade & link público',
    subtitle: 'Capriche — é a primeira coisa que o cliente vê. Você pode trocar depois.',
  },
  4: {
    title: 'Seus primeiros serviços',
    subtitle: 'Sugerimos alguns comuns. Edite preço, duração, remova ou adicione os seus.',
  },
  5: {
    title: 'Quem atende na sua barbearia',
    subtitle: 'O dono já entra como profissional; adicione outros barbeiros se tiver equipe.',
  },
  6: {
    title: 'Horário de funcionamento',
    subtitle: 'Defina os dias e janelas de atendimento. Ajuste fino depois no painel.',
  },
};

/**
 * Wizard "Configurar Barbearia" — os 6 passos reais do protótipo.
 *
 * Cada passo salva no seu endpoint antes de avançar, e o estado devolvido pela
 * API vira o estado da tela. É o que torna o wizard retomável de verdade: quem
 * fecha o navegador no passo 4 e volta amanhã (de outro aparelho, inclusive)
 * continua exatamente dali, porque o progresso mora em `TenantSettings`, não
 * numa `useState` que morre com a aba.
 */
export function OnboardingWizard() {
  const router = useRouter();
  const { client, refresh } = useEstablishmentAuth();
  const { toast } = useToast();

  const [state, setState] = useState<OnboardingState | null>(null);
  const [step, setStep] = useState<WizardStep>(0);
  const [saving, setSaving] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void onboardingApi
      .getState(client)
      .then((loaded) => {
        if (cancelled) return;
        setState(loaded);
        // Retoma no passo seguinte ao último concluído; concluído abre no fim.
        setStep(loaded.completed ? 'done' : loaded.step === 0 ? 0 : Math.min(loaded.step + 1, ONBOARDING_STEPS));
      })
      .catch((error) => {
        if (!cancelled) setLoadError(authErrorMessage(error, 'Não foi possível carregar o wizard.'));
      });

    return () => {
      cancelled = true;
    };
  }, [client]);

  const patch = useCallback((partial: Partial<OnboardingState>) => {
    setState((current) => (current ? { ...current, ...partial } : current));
  }, []);

  /** Envia o passo corrente e avança. `skip` pula o salvamento. */
  const advance = async (skip = false) => {
    if (!state || typeof step !== 'number') return;

    if (skip) {
      setStep(step === ONBOARDING_STEPS ? 'done' : step + 1);
      window.scrollTo({ top: 0 });
      return;
    }

    setSaving(true);
    try {
      let next: OnboardingState;

      switch (step) {
        case 1:
          next = await onboardingApi.saveProfile(client, state.profile);
          break;
        case 2:
          next = await onboardingApi.saveLocation(client, state.location);
          break;
        case 3:
          next = await onboardingApi.saveIdentity(client, state.identity);
          break;
        case 4:
          next = await onboardingApi.saveServices(client, state.services);
          break;
        case 5:
          next = await onboardingApi.saveTeam(
            client,
            // O dono não vai no payload: o servidor preserva o `Barber` dele.
            state.barbers
              .filter((barber) => !barber.isOwner)
              .map((barber) => ({ id: barber.id, name: barber.name, phone: barber.phone })),
          );
          break;
        case 6:
          next = await onboardingApi.saveBusinessHours(client, state.businessHours);
          next = await onboardingApi.complete(client);
          // O `onboardingDone` do membership mudou: o guard de rota precisa
          // saber, senão manda o dono de volta para cá no próximo acesso.
          await refresh();
          break;
        default:
          return;
      }

      setState(next);
      setStep(step === ONBOARDING_STEPS ? 'done' : step + 1);
      window.scrollTo({ top: 0 });
    } catch (error) {
      toast({ message: authErrorMessage(error, 'Não foi possível salvar este passo.'), tone: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  if (loadError) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6 text-center">
        <p role="alert" className="max-w-sm text-sm text-danger">
          {loadError}
        </p>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-10" aria-busy="true">
        <span className="sr-only">Carregando a configuração da sua barbearia…</span>
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (step === 0) {
    return <WizardWelcome ownerFirstName={state.ownerFirstName} onStart={() => setStep(1)} />;
  }

  if (step === 'done') {
    return (
      <WizardDone
        ownerFirstName={state.ownerFirstName}
        publicUrl={state.publicUrl}
        barbersCount={state.barbers.length}
      />
    );
  }

  const copy = STEP_COPY[step]!;
  const publicUrlBase = state.publicUrl.replace(/\/agendar\/.*$/, '');

  return (
    <WizardChrome
      step={step}
      totalSteps={ONBOARDING_STEPS}
      title={copy.title}
      subtitle={copy.subtitle}
      saving={saving}
      nextLabel={step === ONBOARDING_STEPS ? 'Abrir meu painel →' : 'Continuar'}
      nextDisabled={!canProceed(step, state, slugAvailable)}
      onNext={() => void advance()}
      onBack={step > 1 ? () => setStep(step - 1) : undefined}
      onSkip={SKIPPABLE_STEPS.includes(step) ? () => void advance(true) : undefined}
      onExit={() => router.push('/app')}
    >
      {step === 1 && (
        <StepProfile value={state.profile} onChange={(profile) => patch({ profile })} />
      )}
      {step === 2 && (
        <StepLocation value={state.location} onChange={(location) => patch({ location })} />
      )}
      {step === 3 && (
        <StepIdentity
          value={state.identity}
          publicUrlBase={publicUrlBase}
          onChange={(identity) => patch({ identity })}
          onAvailabilityChange={setSlugAvailable}
        />
      )}
      {step === 4 && (
        <StepServices value={state.services} onChange={(services) => patch({ services })} />
      )}
      {step === 5 && <StepTeam value={state.barbers} onChange={(barbers) => patch({ barbers })} />}
      {step === 6 && (
        <StepBusinessHours
          value={state.businessHours}
          onChange={(businessHours) => patch({ businessHours })}
        />
      )}
    </WizardChrome>
  );
}

/**
 * Habilitação do botão "Continuar" — a `canProceed` do protótipo, com as mesmas
 * exigências por passo. É espelho da validação do servidor, não substituto
 * dela: quem recusa de verdade é a API.
 */
function canProceed(step: number, state: OnboardingState, slugAvailable: boolean): boolean {
  switch (step) {
    case 1:
      return (
        state.profile.name.trim().length >= 2 && normalizePhone(state.profile.phone ?? '') !== null
      );
    case 2:
      return Boolean(
        state.location.street?.trim() &&
          state.location.number?.trim() &&
          state.location.city?.trim() &&
          state.location.state?.trim(),
      );
    case 3:
      return state.identity.slug.trim().length >= 3 && slugAvailable;
    case 4:
      return (
        state.services.length > 0 && state.services.every((service) => service.name.trim().length >= 2)
      );
    case 5:
      return state.barbers.every(
        (barber) =>
          barber.name.trim().length >= 2 &&
          (!barber.phone || normalizePhone(barber.phone) !== null || normalizeMobilePhone(barber.phone) !== null),
      );
    case 6:
      return hasValidHours(state.businessHours);
    default:
      return true;
  }
}
