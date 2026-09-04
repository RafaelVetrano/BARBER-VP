'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MyPageImageSlot, MyPageSettings, UpdateMyPageDto } from '@barbervp/types';
import { ErrorCode, isApiErrorBody } from '@barbervp/types';
import {
  Button,
  Card,
  CardHeader,
  CheckIcon,
  EmptyState,
  Skeleton,
  SpinnerIcon,
  Switch,
  Textarea,
  maskInstagramInput,
  useToast,
} from '@barbervp/ui';
import { DashboardChrome } from '@/components/dashboard/dashboard-chrome';
import { ImageSlot } from '@/components/dashboard/my-page/image-slot';
import { PhoneFrame } from '@/components/dashboard/my-page/phone-frame';
import { PagePreview, PagePreviewSkeleton } from '@/components/dashboard/my-page/page-preview';
import { ReviewsTable } from '@/components/dashboard/my-page/reviews-table';
import {
  useAddPhotoMutation,
  useMyPagePreviewQuery,
  useMyPageQuery,
  useRemoveMyPageImageMutation,
  useRemovePhotoMutation,
  useUpdateMyPageMutation,
  useUploadMyPageImageMutation,
} from '@/lib/dashboard/api/my-page';

/**
 * Espera antes de gravar o que está sendo digitado.
 *
 * A aba salva sozinha porque o protótipo não tem botão de salvar: os campos
 * chamam `updMpSlug`/`updMpSobre`/… no `onChange` e o preview reage
 * (`Dashboard.dc.html` l.2262–2311). 700ms é o suficiente para não gravar
 * letra a letra sem que o dono perceba atraso.
 */
const AUTOSAVE_MS = 700;

/** Campos de texto que o autosave acompanha. */
interface TextDraft {
  slug: string;
  sobre: string;
  instagram: string;
  address: string;
}

const draftFrom = (page: MyPageSettings): TextDraft => ({
  slug: page.slug,
  sobre: page.sobre ?? '',
  instagram: page.instagram ?? '',
  address: page.address ?? '',
});

export default function MinhaPaginaPage() {
  const { toast } = useToast();
  const pageQuery = useMyPageQuery();
  const previewQuery = useMyPagePreviewQuery();
  const update = useUpdateMyPageMutation();
  const uploadImage = useUploadMyPageImageMutation();
  const removeImage = useRemoveMyPageImageMutation();
  const addPhoto = useAddPhotoMutation();
  const removePhoto = useRemovePhotoMutation();

  const page = pageQuery.data;

  const [draft, setDraft] = useState<TextDraft | null>(null);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Último payload gravado com sucesso — evita reenviar o que não mudou. */
  const savedRef = useRef<TextDraft | null>(null);

  useEffect(() => {
    if (!page) return;
    const next = draftFrom(page);
    savedRef.current = next;
    // Só semeia o rascunho na primeira carga: sobrescrevê-lo a cada refetch
    // apagaria o que o dono está digitando neste instante.
    setDraft((current) => current ?? next);
  }, [page]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const save = useCallback(
    (dto: UpdateMyPageDto) => {
      update.mutate(dto, {
        onError: (error) => {
          const body = (error as { response?: { data?: unknown } }).response?.data;
          if (isApiErrorBody(body) && body.code === ErrorCode.SLUG_IN_USE) {
            setSlugError(body.message);
            return;
          }
          toast({
            message: error instanceof Error ? error.message : 'Não foi possível salvar.',
            tone: 'danger',
          });
        },
      });
    },
    [toast, update],
  );

  /** Agenda a gravação dos campos de texto que realmente mudaram. */
  const scheduleSave = useCallback(
    (next: TextDraft) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const saved = savedRef.current;
        if (!saved) return;

        const dto: UpdateMyPageDto = {};
        if (next.slug !== saved.slug && next.slug.length > 0) dto.slug = next.slug;
        if (next.sobre !== saved.sobre) dto.sobre = next.sobre;
        if (next.instagram !== saved.instagram) dto.instagram = next.instagram;
        if (next.address !== saved.address) dto.address = next.address;

        if (Object.keys(dto).length === 0) return;
        setSlugError(null);
        save(dto);
      }, AUTOSAVE_MS);
    },
    [save],
  );

  const editText = useCallback(
    (patch: Partial<TextDraft>) => {
      setDraft((current) => {
        if (!current) return current;
        const next = { ...current, ...patch };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  const copyLink = () => {
    if (!page) return;
    void navigator.clipboard
      .writeText(page.publicUrl)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => toast({ message: 'Não foi possível copiar o link.', tone: 'danger' }));
  };

  const onImage = (slot: MyPageImageSlot, file: File) => {
    uploadImage.mutate(
      { slot, file },
      {
        onError: (error) =>
          toast({
            message: error instanceof Error ? error.message : 'Não foi possível enviar a imagem.',
            tone: 'danger',
          }),
      },
    );
  };

  // ── Estados da aba ─────────────────────────────────────────────────────

  if (pageQuery.isLoading) {
    return (
      <DashboardChrome activeKey="minha-pagina">
        <PageSkeleton />
      </DashboardChrome>
    );
  }

  if (pageQuery.isError || !page || !draft) {
    return (
      <DashboardChrome activeKey="minha-pagina">
        <EmptyState
          message="Não foi possível carregar a Minha Página"
          description="Sua sessão pode não ter permissão para editar a página pública, ou a API não respondeu."
          action={
            <Button variant="outline" onClick={() => void pageQuery.refetch()}>
              Tentar de novo
            </Button>
          }
        />
      </DashboardChrome>
    );
  }

  const galleryFull = page.photos.length >= 12;

  return (
    <DashboardChrome activeKey="minha-pagina">
      <div className="flex max-w-[1400px] flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="font-display text-xl font-bold text-fg">Minha Página</h1>
            <p className="text-[13px] text-fg-muted">
              Personalize o site público da sua barbearia e veja o resultado em tempo real.
            </p>
          </div>
          <SaveStatus pending={update.isPending} failed={update.isError} />
        </div>

        {/* `1fr 380px` do protótipo (l.2247). Abaixo de `xl` o preview desce
            para baixo do editor — a coluna de 380px não cabe ao lado num
            tablet sem espremer os campos. */}
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="flex min-w-0 flex-col gap-4">
            <Card className="gap-3 p-5">
              <span className="font-display text-[15px] font-bold text-fg">
                Link de agendamento
              </span>
              <div className="flex h-10 items-center overflow-hidden rounded-control border border-border bg-surface px-3">
                <span className="truncate text-[13px] font-medium text-fg">{page.publicUrl}</span>
              </div>
              <Button variant="outline" size="sm" className="self-start" onClick={copyLink}>
                {copied ? 'Link copiado!' : 'Copiar link'}
              </Button>
            </Card>

            <Card className="gap-3 p-5">
              <span className="font-display text-[15px] font-bold text-fg">URL personalizada</span>
              {/* Prefixo + campo lado a lado como no protótipo; abaixo de `sm`
                  o prefixo sobe para a própria linha, senão o domínio come a
                  largura e sobram ~34px para digitar. */}
              <div className="flex flex-col sm:flex-row sm:items-center">
                {/* O domínio vem da API (`publicBaseUrl`), nunca do desenho. */}
                <span className="flex h-11 shrink-0 items-center rounded-t-control border border-b-0 border-border bg-surface px-3 text-[13px] font-medium text-fg-muted sm:rounded-l-control sm:rounded-tr-none sm:border-b sm:border-r-0">
                  {stripScheme(page.publicBaseUrl)}/
                </span>
                <input
                  value={draft.slug}
                  aria-label="URL personalizada da barbearia"
                  aria-invalid={slugError !== null}
                  onChange={(event) =>
                    editText({
                      slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
                    })
                  }
                  // `flex-1` SÓ a partir de `sm`: abaixo disso o contêiner é
                  // `flex-col`, e crescer no eixo principal significaria
                  // esticar/encolher a ALTURA — o `h-11` viraria 19px.
                  className="h-11 w-full min-w-0 rounded-b-control border border-border bg-surface px-3 text-sm text-fg outline-none focus-visible:border-gold aria-[invalid=true]:border-danger sm:w-auto sm:flex-1 sm:rounded-b-none sm:rounded-r-control"
                />
              </div>
              {slugError && <span className="text-xs text-danger">{slugError}</span>}
            </Card>

            <Card className="gap-3.5 p-5">
              <span className="font-display text-[15px] font-bold text-fg">Logo e capa</span>
              <div className="flex flex-wrap gap-4">
                <div className="flex flex-col items-center gap-2">
                  <ImageSlot
                    url={page.logoUrl}
                    placeholder="Logo"
                    label="Enviar logo"
                    shape="circle"
                    className="size-[84px]"
                    busy={uploadImage.isPending && uploadImage.variables?.slot === 'logo'}
                    onSelect={(file) => onImage('logo', file)}
                    onRemove={() => removeImage.mutate('logo')}
                  />
                  <span className="text-xs text-fg-muted">Logo</span>
                </div>
                <div className="flex min-w-[200px] flex-1 flex-col gap-2">
                  <ImageSlot
                    url={page.coverUrl}
                    placeholder="Foto de capa"
                    label="Enviar foto de capa"
                    shape="rounded"
                    className="h-[84px] w-full"
                    busy={uploadImage.isPending && uploadImage.variables?.slot === 'cover'}
                    onSelect={(file) => onImage('cover', file)}
                    onRemove={() => removeImage.mutate('cover')}
                  />
                  <span className="text-xs text-fg-muted">Capa</span>
                </div>
              </div>
            </Card>

            {/* O protótipo mostra as fotos no preview (l.2401) mas não desenha
                onde enviá-las. O bloco entra aqui, na mesma linguagem do
                "Logo e capa", porque um toggle "Fotos" sem galeria não teria
                o que exibir. */}
            <Card className="gap-3.5 p-5">
              <CardHeader
                title="Fotos"
                description={`${page.photos.length} de 12 · aparecem na seção "Fotos" da página.`}
              />
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                {page.photos.map((photo) => (
                  <ImageSlot
                    key={photo.id}
                    url={photo.url}
                    placeholder="Foto"
                    label="Foto da galeria"
                    shape="rounded"
                    className="aspect-square w-full"
                    busy={removePhoto.isPending && removePhoto.variables === photo.id}
                    // Trocar a foto no lugar = remover e enviar a nova.
                    onSelect={(file) =>
                      removePhoto.mutate(photo.id, { onSuccess: () => addPhoto.mutate(file) })
                    }
                    onRemove={() => removePhoto.mutate(photo.id)}
                  />
                ))}
                {!galleryFull && (
                  <ImageSlot
                    url={null}
                    placeholder="Adicionar"
                    label="Adicionar foto à galeria"
                    shape="rounded"
                    className="aspect-square w-full"
                    busy={addPhoto.isPending}
                    onSelect={(file) =>
                      addPhoto.mutate(file, {
                        onError: (error) =>
                          toast({
                            message:
                              error instanceof Error ? error.message : 'Não foi possível enviar.',
                            tone: 'danger',
                          }),
                      })
                    }
                  />
                )}
              </div>
              {page.photos.length === 0 && (
                <p className="text-xs text-fg-muted">
                  Sem fotos ainda — a seção não aparece na página pública enquanto a galeria
                  estiver vazia.
                </p>
              )}
            </Card>

            <Card className="gap-2.5 p-5">
              <span className="font-display text-[15px] font-bold text-fg">Sobre</span>
              <Textarea
                value={draft.sobre}
                aria-label="Sobre a barbearia"
                rows={4}
                placeholder="Conte em poucas linhas o que a sua barbearia tem de diferente."
                onChange={(event) => editText({ sobre: event.target.value })}
              />
            </Card>

            <Card className="gap-1 p-5">
              <span className="mb-2 font-display text-[15px] font-bold text-fg">Exibir no site</span>
              <SectionToggle
                label="Serviços e preços"
                checked={page.showServices}
                onChange={(showServices) => save({ showServices })}
              />
              <SectionToggle
                label="Avaliações"
                checked={page.showReviews}
                onChange={(showReviews) => save({ showReviews })}
              />
              <SectionToggle
                label="Fotos"
                checked={page.showPhotos}
                onChange={(showPhotos) => save({ showPhotos })}
              />
              <SectionToggle
                label="Horário de funcionamento"
                checked={page.showBusinessHours}
                onChange={(showBusinessHours) => save({ showBusinessHours })}
                last
              />
            </Card>

            <Card className="gap-4 p-5">
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium text-fg-muted">Instagram</span>
                <input
                  value={draft.instagram}
                  placeholder="@suabarbearia"
                  onChange={(event) =>
                    editText({ instagram: maskInstagramInput(event.target.value) })
                  }
                  className="h-11 w-full rounded-control border border-border bg-surface px-3 text-sm text-fg outline-none focus-visible:border-gold"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium text-fg-muted">Endereço</span>
                <input
                  value={draft.address}
                  placeholder="Rua, número — bairro, cidade"
                  onChange={(event) => editText({ address: event.target.value })}
                  className="h-11 w-full rounded-control border border-border bg-surface px-3 text-sm text-fg outline-none focus-visible:border-gold"
                />
              </label>
            </Card>
          </div>

          {/* ── Preview ao vivo ──────────────────────────────────────── */}
          <div className="flex flex-col items-center gap-3 xl:sticky xl:top-4">
            <span className="w-full text-xs font-semibold uppercase tracking-[0.5px] text-fg-muted">
              Preview ao vivo
            </span>
            <PhoneFrame title={previewQuery.data?.name ?? ''}>
              {previewQuery.isLoading && <PagePreviewSkeleton />}
              {previewQuery.isError && (
                <div className="flex h-full items-center justify-center p-6">
                  <EmptyState
                    message="Preview indisponível"
                    description="Não foi possível montar a prévia da página."
                    action={
                      <Button variant="outline" size="sm" onClick={() => void previewQuery.refetch()}>
                        Tentar de novo
                      </Button>
                    }
                  />
                </div>
              )}
              {previewQuery.data && <PagePreview shop={previewQuery.data} />}
            </PhoneFrame>
            <a
              href={page.publicUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex min-h-11 items-center text-[13px] font-medium text-gold underline-offset-4 hover:underline"
            >
              Abrir a página real
            </a>
          </div>
        </div>

        <ReviewsTable />
      </div>
    </DashboardChrome>
  );
}

/** Uma linha do bloco "Exibir no site" — divisor abaixo, menos na última. */
function SectionToggle({
  label,
  checked,
  onChange,
  last = false,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  last?: boolean;
}) {
  return (
    <Switch
      label={label}
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      // `[&>label]:flex-1` estica o rótulo até o interruptor: sem isso um
      // rótulo curto ("Fotos") deixa um alvo de toque de 34px de largura.
      className={`[&>label]:flex-1 ${last ? 'py-2.5' : 'border-b border-border py-2.5'}`}
    />
  );
}

/**
 * Substitui o botão "Salvar alterações": sem botão no protótipo, o dono
 * precisa de alguma confirmação de que o que ele digitou entrou.
 */
function SaveStatus({ pending, failed }: { pending: boolean; failed: boolean }) {
  if (pending) {
    return (
      <span className="flex items-center gap-1.5 text-[13px] text-fg-muted">
        <SpinnerIcon size={14} />
        Salvando…
      </span>
    );
  }
  if (failed) {
    return <span className="text-[13px] text-danger">Alterações não salvas</span>;
  }
  return (
    <span className="flex items-center gap-1.5 text-[13px] text-fg-muted">
      <CheckIcon size={14} className="text-success" />
      Salvo automaticamente
    </span>
  );
}

/** Silhueta da aba — mesmos blocos, mesma altura, sem salto ao carregar. */
function PageSkeleton() {
  return (
    <div className="flex max-w-[1400px] flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-4">
          {/* Alturas dos sete cards do editor, na ordem em que eles entram. */}
          {['h-28', 'h-[108px]', 'h-[148px]', 'h-[168px]', 'h-[132px]', 'h-[196px]', 'h-[148px]'].map(
            (height, index) => (
              <Skeleton key={index} className={`w-full rounded-xl ${height}`} />
            ),
          )}
        </div>
        <div className="flex flex-col items-center gap-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-[672px] w-full max-w-[320px] rounded-[38px]" />
        </div>
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}

/** `https://agendar.barbervp.com` → `agendar.barbervp.com` (prefixo do campo). */
function stripScheme(url: string): string {
  return url.replace(/^https?:\/\//, '');
}
