'use client';

import { useEffect, useRef, useState } from 'react';
import {
  slugify,
  type OnboardingIdentity,
  type OnboardingLocation,
  type OnboardingProfile,
} from '@barbervp/types';
import {
  AlertCircleIcon,
  Avatar,
  CheckCircleIcon,
  SpinnerIcon,
  authErrorMessage,
  onboardingApi,
  useEstablishmentAuth,
  useToast,
} from '@barbervp/ui';
import { ImageSlot } from '@/components/dashboard/my-page/image-slot';

export interface StepIdentityProps {
  value: OnboardingIdentity;
  /** Passos 1 e 2 — alimentam a prévia de como a barbearia vai aparecer. */
  profile: OnboardingProfile;
  location: OnboardingLocation;
  /** Base do link público (`GET /onboarding` → `publicBaseUrl`). */
  publicBaseUrl: string;
  onChange: (next: OnboardingIdentity) => void;
  onAvailabilityChange: (available: boolean) => void;
}

const SLUG_CHECK_DEBOUNCE_MS = 500;

/**
 * Passo 3 — identidade e link público (pulável).
 *
 * **Upload de verdade desde o agente 30.** Eram dois campos "URL do logo" /
 * "URL da foto de capa" com o aviso "o upload direto chega na fase de
 * integrações" — um aviso que mentia desde o agente 25, quando o
 * `StorageAdapter` e `POST /my-page/images/:slot` passaram a existir e a
 * escrever na MESMA `TenantSettings` que este passo grava. Faltava só o
 * consumidor. O `ImageSlot` aqui é o mesmo componente da aba Minha Página,
 * reusado; a rota de upload é a mesma; não nasceu nada novo dos dois lados.
 *
 * A prévia abaixo dos slots existe porque "capriche — é a primeira coisa que o
 * cliente vê" é um pedido que ninguém consegue atender sem ver o resultado.
 * Ela monta capa + logo + nome + endereço com o `OnboardingState` que a API já
 * devolveu — não é um segundo renderizador da página pública, é o cartão de
 * identificação dela.
 */
export function StepIdentity({
  value,
  profile,
  location,
  publicBaseUrl,
  onChange,
  onAvailabilityChange,
}: StepIdentityProps) {
  const { client } = useEstablishmentAuth();
  const { toast } = useToast();

  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [reserved, setReserved] = useState(false);
  const [uploading, setUploading] = useState<'logo' | 'cover' | null>(null);
  const [uploadError, setUploadError] = useState<{ slot: 'logo' | 'cover'; message: string } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);

  const patch = (partial: Partial<OnboardingIdentity>) => onChange({ ...value, ...partial });

  /**
   * Sugestão de link a partir do nome da barbearia, na PRIMEIRA visita ao
   * passo. Quem chega aqui já tem um slug (o registro deriva um do nome), mas
   * ele pode ter ficado para trás se o dono renomeou a barbearia no passo 1 —
   * e é o nome do passo 1 que o dono acabou de escrever, então é dele que a
   * sugestão sai. Roda uma vez: depois disso o campo é do dono.
   */
  const suggested = useRef(false);
  useEffect(() => {
    if (suggested.current) return;
    suggested.current = true;

    const fromName = slugify(profile.name ?? '');
    if (!fromName || fromName === value.slug) return;

    let cancelled = false;
    void onboardingApi
      .checkSlug(client, fromName)
      .then((result) => {
        if (cancelled || !result.available) return;
        patch({ slug: result.slug });
      })
      .catch(() => {
        /* Sem rede, o slug atual continua valendo — ele já é válido. */
      });

    return () => {
      cancelled = true;
    };
    // Só na montagem: é uma sugestão inicial, não um espelho do passo 1.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const slug = value.slug.trim();
    if (slug.length < 3) {
      setAvailable(false);
      setReserved(false);
      onAvailabilityChange(false);
      return;
    }

    let cancelled = false;
    setChecking(true);
    const timer = setTimeout(() => {
      void onboardingApi
        .checkSlug(client, slug)
        .then((result) => {
          if (cancelled) return;
          setAvailable(result.available);
          setSuggestion(result.suggestion ?? null);
          setReserved(Boolean(result.reserved));
          onAvailabilityChange(result.available);
        })
        .catch(() => {
          // Rede fora não pode travar o passo: o servidor valida no submit.
          if (!cancelled) {
            setAvailable(null);
            setReserved(false);
            onAvailabilityChange(true);
          }
        })
        .finally(() => {
          if (!cancelled) setChecking(false);
        });
    }, SLUG_CHECK_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      setChecking(false);
    };
  }, [value.slug, client, onAvailabilityChange]);

  const upload = async (slot: 'logo' | 'cover', file: File) => {
    setUploading(slot);
    setUploadError(null);
    try {
      const images = await onboardingApi.uploadImage(client, slot, file);
      patch({ logoUrl: images.logoUrl, coverUrl: images.coverUrl });
    } catch (caught) {
      // No próprio slot, e não em toast: o erro é DAQUELE quadro (formato,
      // tamanho), e um aviso que some em 3s deixa o dono sem saber o que
      // corrigir na hora de escolher outro arquivo.
      setUploadError({ slot, message: authErrorMessage(caught, 'Não foi possível enviar a imagem.') });
    } finally {
      setUploading(null);
    }
  };

  const remove = async (slot: 'logo' | 'cover') => {
    setUploading(slot);
    setUploadError(null);
    try {
      const images = await onboardingApi.removeImage(client, slot);
      patch({ logoUrl: images.logoUrl, coverUrl: images.coverUrl });
    } catch (caught) {
      setUploadError({ slot, message: authErrorMessage(caught, 'Não foi possível remover a imagem.') });
    } finally {
      setUploading(null);
    }
  };

  const publicUrl = `${publicBaseUrl}/${value.slug}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      toast({ message: 'Copie o link manualmente: ele está logo acima.' });
    }
  };

  const addressLine = [
    [location.street, location.number].filter(Boolean).join(', '),
    location.neighborhood,
    location.city && location.state ? `${location.city}/${location.state}` : location.city,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex flex-col gap-6">
      {/* ── Fotos ───────────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-[15px] font-bold text-fg">Logo e foto de capa</h2>
          <p className="text-[13px] text-fg-muted">
            Arraste um arquivo do computador ou clique para escolher. Aceitamos JPG, PNG e WebP de
            até 5 MB.
          </p>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex flex-col gap-2">
            <ImageSlot
              url={value.logoUrl}
              placeholder="Arraste ou clique"
              label="Enviar logo"
              shape="circle"
              className="size-[104px]"
              busy={uploading === 'logo'}
              error={uploadError?.slot === 'logo' ? uploadError.message : null}
              onSelect={(file) => void upload('logo', file)}
              onRemove={value.logoUrl ? () => void remove('logo') : undefined}
            />
            <span className="text-xs text-fg-muted">
              Logo — imagem quadrada, a partir de 400 por 400 pontos.
            </span>
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <ImageSlot
              url={value.coverUrl}
              placeholder="Arraste ou clique"
              label="Enviar foto de capa"
              shape="rounded"
              className="h-[104px] w-full"
              busy={uploading === 'cover'}
              error={uploadError?.slot === 'cover' ? uploadError.message : null}
              onSelect={(file) => void upload('cover', file)}
              onRemove={value.coverUrl ? () => void remove('cover') : undefined}
            />
            <span className="text-xs text-fg-muted">
              Capa — foto deitada, a partir de 1200 por 400 pontos. É a faixa larga do topo da sua
              página.
            </span>
          </div>
        </div>
      </section>

      {/* ── Prévia ──────────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-2">
        <h2 className="font-display text-[15px] font-bold text-fg">
          Como sua barbearia vai aparecer
        </h2>
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          <div className="relative h-24 bg-surface-2 sm:h-28">
            {value.coverUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={value.coverUrl} alt="" className="size-full object-cover" />
            ) : (
              <div className="size-full bg-gradient-to-br from-surface-3 to-bg" />
            )}
            <div className="absolute -bottom-7 left-4">
              <div className="rounded-full border-[3px] border-surface">
                <Avatar name={profile.name || 'Barbearia'} src={value.logoUrl} size="lg" />
              </div>
            </div>
          </div>
          <div className="px-4 pb-4 pt-9">
            <p className="font-display text-base font-bold text-fg">
              {profile.name || 'Nome da sua barbearia'}
            </p>
            <p className="mt-1 text-[13px] text-fg-muted">
              {addressLine || 'Endereço do passo anterior'}
            </p>
          </div>
        </div>
      </section>

      {/* ── Link público ────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-1.5">
        <label htmlFor="bvp-slug" className="text-[13px] text-fg-muted">
          Endereço da sua página
        </label>
        <div className="flex flex-col sm:flex-row">
          <span className="flex items-center rounded-t-control border border-border-strong bg-surface-3 px-3 py-2.5 text-sm text-fg-subtle sm:rounded-l-control sm:rounded-tr-none sm:border-r-0 sm:py-0">
            {publicBaseUrl}/
          </span>
          <input
            id="bvp-slug"
            value={value.slug}
            onChange={(event) => patch({ slug: slugify(event.target.value) })}
            // `flex-1` SÓ a partir de `sm`: abaixo disso o contêiner é
            // `flex-col`, e crescer no eixo principal significaria esticar/
            // encolher a ALTURA — o `h-12` virava 19px. É o mesmo cuidado que a
            // aba Minha Página documenta no campo gêmeo dela.
            className="h-12 w-full min-w-0 rounded-b-control border border-border-strong bg-surface-2 px-3.5 font-sans text-sm text-fg outline-none transition-colors focus:border-gold focus:ring-2 focus:ring-gold/30 sm:w-auto sm:flex-1 sm:rounded-l-none sm:rounded-r-control"
            aria-describedby="bvp-slug-status"
          />
        </div>

        <p id="bvp-slug-status" className="min-h-4 text-xs" aria-live="polite">
          {checking ? (
            <span className="flex items-center gap-1.5 text-fg-subtle">
              <SpinnerIcon size={13} /> Verificando disponibilidade…
            </span>
          ) : available === true ? (
            <span className="flex items-center gap-1.5 text-success">
              <CheckCircleIcon size={14} /> Link disponível
            </span>
          ) : available === false ? (
            <span className="flex flex-wrap items-center gap-1.5 text-danger">
              <AlertCircleIcon size={14} />
              {value.slug.trim().length < 3
                ? 'Use ao menos 3 caracteres.'
                : reserved
                  ? 'Este nome é reservado pelo sistema. Escolha outro.'
                  : 'Este nome já é de outra barbearia.'}
              {suggestion && (
                <button
                  type="button"
                  onClick={() => patch({ slug: suggestion })}
                  className="font-semibold text-gold underline underline-offset-2 hover:text-gold-hover"
                >
                  Usar {suggestion}
                </button>
              )}
            </span>
          ) : (
            <span className="text-fg-subtle">
              Este é o endereço que seus clientes vão abrir para agendar.
            </span>
          )}
        </p>

        <button
          type="button"
          onClick={() => void copyLink()}
          // 44px de alvo no dedo — é um controle, não um rótulo.
          className="mt-1 flex min-h-11 w-full items-center gap-2.5 rounded-control border border-border bg-surface px-3.5 text-left transition-colors hover:border-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg">
            {publicUrl}
          </span>
          <span className="shrink-0 text-xs font-semibold text-gold">
            {copied ? 'Copiado ✓' : 'Copiar'}
          </span>
        </button>
      </section>
    </div>
  );
}
