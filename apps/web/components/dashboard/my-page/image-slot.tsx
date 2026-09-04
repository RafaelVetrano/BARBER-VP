'use client';

import { useId, useRef, useState } from 'react';
import { PlusIcon, SpinnerIcon, TrashIcon, cn, useToast } from '@barbervp/ui';

/** Mesmo contrato do `StorageAdapter` da API — recusar aqui poupa o upload. */
const ACCEPT = 'image/jpeg,image/png,image/webp';
const MAX_BYTES = 5 * 1024 * 1024;

export interface ImageSlotProps {
  /** URL atual, ou `null` para o estado vazio com o placeholder. */
  url: string | null;
  /** Texto dentro do quadro vazio ("Logo", "Foto de capa"). */
  placeholder: string;
  /** Rótulo acessível do botão de envio. */
  label: string;
  shape: 'circle' | 'rounded';
  className?: string;
  busy?: boolean;
  onSelect: (file: File) => void;
  /** Ausente = slot sem remoção (a galeria remove pelo card, não pelo slot). */
  onRemove?: () => void;
}

/**
 * Um `image-slot` do protótipo (`Dashboard.dc.html` l.2271/2276) com upload de
 * verdade: abre o seletor de arquivo, valida tipo e tamanho ANTES de subir e
 * mostra a imagem atual quando existe.
 */
export function ImageSlot({
  url,
  placeholder,
  label,
  shape,
  className,
  busy = false,
  onSelect,
  onRemove,
}: ImageSlotProps) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [dragging, setDragging] = useState(false);

  const radius = shape === 'circle' ? 'rounded-full' : 'rounded-control';

  const accept = (file: File | undefined) => {
    if (!file) return;
    if (!ACCEPT.split(',').includes(file.type)) {
      toast({ message: 'Formato não suportado. Envie JPG, PNG ou WebP.', tone: 'danger' });
      return;
    }
    if (file.size > MAX_BYTES) {
      toast({ message: 'Imagem acima de 5 MB.', tone: 'danger' });
      return;
    }
    onSelect(file);
  };

  return (
    <div className={cn('group relative', className)}>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={ACCEPT}
        // `hidden`, e não `sr-only`: o input de arquivo continua abrindo o
        // seletor por `.click()`, e some do layout — como `sr-only` ele fica
        // 1×1 e entra na varredura de alvo de toque como controle minúsculo.
        className="hidden"
        onChange={(event) => {
          accept(event.target.files?.[0]);
          // Zera o input para que reescolher o MESMO arquivo dispare `change`.
          event.target.value = '';
        }}
      />

      <button
        type="button"
        aria-label={label}
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          accept(event.dataTransfer.files?.[0]);
        }}
        className={cn(
          'relative flex size-full items-center justify-center overflow-hidden border border-dashed border-border bg-surface transition-colors',
          radius,
          !busy && 'hover:border-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold',
          dragging && 'border-gold bg-gold/[0.08]',
          busy && 'cursor-wait',
        )}
      >
        {url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={url} alt="" className="size-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-1 px-1 text-center text-[11px] text-fg-subtle">
            <PlusIcon size={16} />
            {placeholder}
          </span>
        )}

        {busy && (
          <span className="absolute inset-0 flex items-center justify-center bg-bg/70 text-gold">
            <SpinnerIcon size={18} />
          </span>
        )}
      </button>

      {url && onRemove && !busy && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remover ${label.toLowerCase()}`}
          // O ALVO tem 44px no dedo e encolhe para 28 a partir de `md`, onde
          // há ponteiro; o CÍRCULO desenhado é sempre de 28px, para o botão
          // não engolir o canto da miniatura no celular.
          className="absolute -right-4 -top-4 flex size-11 items-center justify-center focus-visible:outline-none md:-right-1.5 md:-top-1.5 md:size-7"
        >
          <span className="flex size-7 items-center justify-center rounded-full border border-border bg-surface-3 text-fg-muted transition-colors group-focus-within:border-border-strong hover:border-danger hover:text-danger">
            <TrashIcon size={13} />
          </span>
        </button>
      )}
    </div>
  );
}
