'use client';

import {
  formatBRL,
  formatRatingBps,
  minutesToTime,
  type PublicBarbershop,
} from '@barbervp/types';
import { Skeleton, StarIcon } from '@barbervp/ui';
import { WEEKDAY_FULL } from '@/lib/booking/format';

/**
 * Conteúdo do "Preview ao vivo" (`Dashboard.dc.html` l.2354–2421), na ordem do
 * protótipo: capa + logo, nome + nota, CTA, Serviços, Avaliações, Fotos,
 * Horário e Localização.
 *
 * Duas divergências deliberadas em relação ao desenho:
 *
 * 1. O protótipo desenha a página do cliente em tema CLARO (#FAF9F7). O
 *    projeto unificou as quatro superfícies no tema de produto (README →
 *    Design system), e `/{slug}` é escura de verdade — um preview claro
 *    mostraria uma página que não existe.
 * 2. O bloco "mapa estático" saiu: é placeholder de um mapa que a página
 *    pública não tem. Preview não inventa seção.
 *
 * Todo valor vem de `GET /my-page/preview`, que serve o MESMO payload de
 * `/{slug}` — nenhum número do protótipo está escrito aqui.
 */
export function PagePreview({ shop }: { shop: PublicBarbershop }) {
  return (
    <div className="flex flex-col pb-5">
      <div className="relative">
        {shop.coverUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={shop.coverUrl} alt="" className="h-[110px] w-full object-cover" />
        ) : (
          <div className="h-[110px] w-full bg-surface-3" />
        )}
        <div className="absolute -bottom-7 left-4">
          {shop.logoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={shop.logoUrl}
              alt=""
              className="size-[60px] rounded-full border-[3px] border-bg object-cover"
            />
          ) : (
            <div className="flex size-[60px] items-center justify-center rounded-full border-[3px] border-bg bg-surface-3 text-[10px] text-fg-subtle">
              Logo
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1 px-4 pb-3 pt-9">
        <span className="font-display text-[17px] font-bold text-fg">{shop.name}</span>
        {shop.rating && (
          <span className="flex items-center gap-1.5">
            <span className="flex items-center gap-1 text-[13px] font-semibold text-gold">
              <StarIcon size={12} fill="currentColor" strokeWidth={0} />
              {formatRatingBps(shop.rating.averageBps)}
            </span>
            <span className="text-xs text-fg-muted">
              ({shop.rating.count} {shop.rating.count === 1 ? 'avaliação' : 'avaliações'})
            </span>
          </span>
        )}
      </div>

      {shop.allowOnlineBooking && (
        <div className="px-4 pb-4">
          <span className="flex h-10 items-center justify-center rounded-control bg-gold text-[13px] font-bold text-bg">
            Agendar horário
          </span>
        </div>
      )}

      {shop.sections.services && shop.services.length > 0 && (
        <PreviewSection title="Serviços">
          <ul>
            {shop.services.map((service) => (
              <li
                key={service.id}
                className="flex items-center justify-between gap-3 border-b border-border py-[7px] last:border-0"
              >
                <span className="truncate text-[13px] font-medium text-fg">{service.name}</span>
                <span className="shrink-0 text-[13px] font-semibold text-fg">
                  {formatBRL(service.priceCents)}
                </span>
              </li>
            ))}
          </ul>
        </PreviewSection>
      )}

      {shop.sections.reviews && shop.reviews.length > 0 && (
        <PreviewSection title="Avaliações">
          <ul className="flex flex-col gap-2">
            {shop.reviews.map((review) => (
              <li key={review.id} className="flex flex-col gap-1 rounded-control bg-surface-2 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-semibold text-fg">
                    {review.authorName}
                  </span>
                  <span className="shrink-0 text-[11px] font-semibold text-gold">
                    {'★'.repeat(review.rating)}
                  </span>
                </div>
                {review.comment && (
                  <span className="text-xs leading-relaxed text-fg-muted">{review.comment}</span>
                )}
              </li>
            ))}
          </ul>
        </PreviewSection>
      )}

      {shop.sections.photos && shop.photos.length > 0 && (
        <PreviewSection title="Fotos">
          <div className="grid grid-cols-3 gap-1.5">
            {shop.photos.map((photo) => (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                key={photo.id}
                src={photo.url}
                alt=""
                className="h-[62px] w-full rounded-lg bg-surface-3 object-cover"
              />
            ))}
          </div>
        </PreviewSection>
      )}

      {shop.sections.businessHours && shop.businessHours.length > 0 && (
        <PreviewSection title="Horário de funcionamento">
          <ul className="flex flex-col gap-1.5">
            {[...shop.businessHours]
              // Começa na segunda, como a página pública — domingo fecha.
              .sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7))
              .map((hour) => (
                <li key={hour.weekday} className="flex justify-between gap-3">
                  <span className="text-xs text-fg-muted">
                    {WEEKDAY_FULL[hour.weekday]?.replace('-feira', '')}
                  </span>
                  <span className="text-xs font-medium text-fg">
                    {hour.closed
                      ? 'Fechado'
                      : `${minutesToTime(hour.opensAt)} – ${minutesToTime(hour.closesAt)}`}
                  </span>
                </li>
              ))}
          </ul>
        </PreviewSection>
      )}

      {(shop.address || shop.instagram) && (
        <PreviewSection title="Localização">
          <div className="flex flex-col gap-1">
            {shop.address && <span className="text-xs text-fg-muted">{shop.address}</span>}
            {shop.instagram && (
              <span className="text-xs font-medium text-gold">{shop.instagram}</span>
            )}
          </div>
        </PreviewSection>
      )}
    </div>
  );
}

function PreviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 px-4 pb-4">
      <span className="text-[11px] font-bold uppercase tracking-[0.4px] text-fg-muted">
        {title}
      </span>
      {children}
    </div>
  );
}

/** Esqueleto com a MESMA silhueta do preview — sem salto ao carregar. */
export function PagePreviewSkeleton() {
  return (
    <div className="flex flex-col pb-5">
      <Skeleton className="h-[110px] w-full rounded-none" />
      <div className="flex flex-col gap-2 px-4 pb-3 pt-9">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/3" />
      </div>
      <div className="px-4 pb-4">
        <Skeleton className="h-10 w-full rounded-control" />
      </div>
      <div className="flex flex-col gap-2 px-4">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-6 w-full" />
        ))}
      </div>
    </div>
  );
}
