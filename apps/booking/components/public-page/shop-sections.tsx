'use client';

import { useState, type ReactNode } from 'react';
import {
  formatDuration,
  formatRatingBps,
  minutesToTime,
  type PublicBarbershop,
} from '@barbervp/types';
import { Avatar, Button, StarIcon } from '@barbervp/ui';
import { WEEKDAY_FULL, formatPrice, formatRelativeDate, mapsLink } from '../../lib/format';

/** Quantos serviços a lista mostra antes do "ver todos". */
const SERVICES_PREVIEW = 5;

interface SectionProps {
  title: string;
  count?: number;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  /** Sem padding lateral — usado pelos carrosséis, que sangram na borda. */
  bleed?: boolean;
}

/**
 * Moldura de seção.
 *
 * O padding lateral fica SEMPRE na seção, inclusive em `bleed`. O carrossel se
 * estende de borda a borda cancelando esse padding (`-mx-5 px-5`), o que só
 * fecha a conta se o pai realmente o tiver: sem ele, o carrossel passa 20px de
 * cada lado e a página inteira ganha rolagem horizontal — o defeito que o
 * critério de aceite de 360px existe para pegar.
 */
export function Section({ title, count, subtitle, action, children, bleed }: SectionProps) {
  return (
    <section className="mt-8 px-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="flex items-baseline gap-1.5 text-lg font-semibold text-fg">
          {title}
          {count !== undefined && (
            <span className="text-sm font-normal text-fg-muted">({count})</span>
          )}
        </h2>
        {action}
      </div>
      {subtitle && <p className="mt-1 text-sm text-fg-muted">{subtitle}</p>}
      {/* `bleed` não muda a moldura: quem sangra é o carrossel lá dentro,
          cancelando exatamente o padding desta seção. */}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/**
 * Carrossel horizontal.
 *
 * Sangra 20px para os lados (`-mx-5 px-5`) para o último card não colar na
 * borda e para o primeiro nascer alinhado ao resto da página. `snap` deixa a
 * rolagem no toque parar em card inteiro, como no protótipo.
 */
function Carousel({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {children}
    </div>
  );
}

// ── Serviços ────────────────────────────────────────────────────────────────

interface ServicesSectionProps {
  shop: PublicBarbershop;
  onBook: (serviceId: string) => void;
}

export function ServicesSection({ shop, onBook }: ServicesSectionProps) {
  const [showAll, setShowAll] = useState(false);

  const services = shop.services;
  const visible = showAll ? services : services.slice(0, SERVICES_PREVIEW);
  const hasMore = services.length > SERVICES_PREVIEW;

  if (services.length === 0) return null;

  return (
    <Section title="Serviços e preços" count={services.length}>
      <ul className="flex flex-col gap-2">
        {visible.map((service) => (
          <li
            key={service.id}
            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border border-border p-4"
          >
            <div className="flex min-w-0 flex-[1_1_60%] flex-col gap-1">
              <span className="flex items-center gap-2">
                <span className="truncate text-base font-medium text-fg">{service.name}</span>
                {service.isCombo && (
                  <span className="shrink-0 rounded-full bg-gold/15 px-2 py-0.5 text-xs text-gold">
                    Combo
                  </span>
                )}
              </span>
              <span className="text-[13px] text-fg-muted">
                {formatDuration(service.durationMin)}
              </span>
            </div>

            {/* `ml-auto` mantém o preço encostado à direita mesmo quando a
                linha quebra em 360px — o alinhamento do protótipo sobrevive à
                largura mínima. */}
            <div className="ml-auto flex shrink-0 items-center gap-3">
              <span className="text-base font-semibold text-gold">
                {formatPrice(service.priceCents)}
              </span>
              {shop.allowOnlineBooking && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-11 sm:h-10"
                  onClick={() => onBook(service.id)}
                >
                  Agendar
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {hasMore && (
        <button
          type="button"
          onClick={() => setShowAll((current) => !current)}
          className="mt-2 flex min-h-11 items-center rounded text-sm text-fg-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          {showAll ? 'Ver menos ▴' : `Ver todos os ${services.length} serviços ▾`}
        </button>
      )}
    </Section>
  );
}

// ── Planos de assinatura ────────────────────────────────────────────────────

/**
 * Planos vendidos pela barbearia.
 *
 * A CONTRATAÇÃO é da fase 05 — aqui a seção é vitrine, e o botão leva para o
 * fluxo de assinatura quando ele existir. Um assinante vê o próprio saldo no
 * lugar da lista de ofertas.
 */
export function PlansSection({
  shop,
  onSubscribe,
  onManageSubscription,
}: {
  shop: PublicBarbershop;
  onSubscribe: (planId: string) => void;
  onManageSubscription?: () => void;
}) {
  if (shop.subscription) {
    const subscription = shop.subscription;
    return (
      <Section title="Sua assinatura">
        <button
          type="button"
          onClick={onManageSubscription}
          disabled={!onManageSubscription}
          className="flex w-full flex-col gap-2.5 rounded-xl border border-gold p-4 text-left disabled:cursor-default"
        >
          <span className="font-display text-base font-bold text-fg">{subscription.planName}</span>
          <ul className="flex flex-col gap-1.5">
            {subscription.usages.map((usage) => (
              <li key={usage.serviceId} className="text-[13px] text-fg-muted">
                {usage.serviceName} — {usage.used}/{usage.quota} usados
              </li>
            ))}
          </ul>
          {onManageSubscription && <span className="text-[13px] text-gold">Gerenciar assinatura →</span>}
        </button>
      </Section>
    );
  }

  if (shop.plans.length === 0) return null;

  return (
    <Section
      title="Planos para membros"
      count={shop.plans.length}
      subtitle="Assine e economize todo mês"
      bleed
    >
      <Carousel>
        {shop.plans.map((plan) => (
          <article
            key={plan.id}
            className={[
              'flex w-60 shrink-0 snap-start flex-col gap-2.5 rounded-xl border p-4',
              plan.isPopular ? 'border-gold' : 'border-border',
            ].join(' ')}
          >
            {plan.isPopular && (
              <span className="w-fit rounded-full bg-gold/15 px-2.5 py-0.5 text-xs text-gold">
                Mais popular
              </span>
            )}
            <h3 className="font-display text-base font-bold text-fg">{plan.name}</h3>
            <p className="flex items-baseline gap-1">
              <span className="font-display text-[22px] font-bold text-gold">
                {formatPrice(plan.priceCents)}
              </span>
              <span className="text-[13px] text-fg-muted">/mês</span>
            </p>
            <ul className="flex flex-col gap-1">
              {plan.items.map((item) => (
                <li key={item.serviceId} className="text-[13px] text-fg">
                  {item.quota}× {item.serviceName}
                </li>
              ))}
            </ul>
            {plan.savingsCents > 0 && (
              <p className="text-[13px] font-semibold text-success">
                Economize {formatPrice(plan.savingsCents)}/mês
              </p>
            )}
            <Button
              variant="outline"
              size="sm"
              fullWidth
              className="mt-auto h-11 sm:h-10"
              onClick={() => onSubscribe(plan.id)}
            >
              Assinar
            </Button>
          </article>
        ))}
      </Carousel>
    </Section>
  );
}

// ── Equipe ──────────────────────────────────────────────────────────────────

export function TeamSection({ shop }: { shop: PublicBarbershop }) {
  if (!shop.sections.team || shop.barbers.length === 0) return null;

  return (
    <Section title="Nossos barbeiros" bleed>
      <Carousel>
        {shop.barbers.map((barber) => (
          <article
            key={barber.id}
            className="flex w-36 shrink-0 snap-start flex-col items-center gap-2 rounded-xl border border-border p-4 text-center"
          >
            <Avatar name={barber.name} src={barber.avatarUrl} size="lg" className="size-[72px] text-xl" />
            <span className="w-full truncate text-sm font-semibold text-fg">{barber.name}</span>
            {barber.specialty && (
              <span className="w-full truncate text-xs text-fg-muted">{barber.specialty}</span>
            )}
            {barber.ratingBps !== null && (
              <span className="flex items-center gap-1 text-xs text-gold">
                <StarIcon size={11} />
                {formatRatingBps(barber.ratingBps)}
              </span>
            )}
          </article>
        ))}
      </Carousel>
    </Section>
  );
}

// ── Sobre ───────────────────────────────────────────────────────────────────

export function AboutSection({ shop }: { shop: PublicBarbershop }) {
  if (!shop.sections.about || !shop.about) return null;

  return (
    <Section title="Sobre">
      <p className="text-sm leading-relaxed text-fg-muted">{shop.about}</p>
    </Section>
  );
}

// ── Avaliações ──────────────────────────────────────────────────────────────

export function ReviewsSection({ shop }: { shop: PublicBarbershop }) {
  if (!shop.sections.reviews || shop.reviews.length === 0) return null;

  return (
    <Section
      title="Avaliações"
      action={
        shop.rating ? (
          <span className="flex items-center gap-1 text-sm text-fg-muted">
            <StarIcon size={13} className="text-gold" />
            {formatRatingBps(shop.rating.averageBps)} · {shop.rating.count}
          </span>
        ) : undefined
      }
    >
      <ul className="flex flex-col gap-3">
        {shop.reviews.map((review) => (
          <li
            key={review.id}
            className="flex flex-col gap-2 rounded-xl border border-border p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2">
                <Avatar name={review.authorName} size="sm" />
                <span className="truncate text-sm font-medium text-fg">{review.authorName}</span>
              </span>
              <span className="shrink-0 text-xs text-fg-muted">
                {formatRelativeDate(review.createdAt)}
              </span>
            </div>

            <span
              className="flex gap-0.5 text-gold"
              aria-label={`${review.rating} de 5 estrelas`}
            >
              {Array.from({ length: review.rating }, (_, index) => (
                <StarIcon key={index} size={13} aria-hidden="true" />
              ))}
            </span>

            {review.comment && (
              <p className="text-sm leading-relaxed text-fg">{review.comment}</p>
            )}
            {review.barberName && (
              <p className="text-xs text-fg-muted">Atendimento com {review.barberName}</p>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

// ── Onde estamos + horário ──────────────────────────────────────────────────

export function LocationSection({ shop }: { shop: PublicBarbershop }) {
  const today = todayWeekday(shop.timezone);

  return (
    <Section title="Onde estamos">
      {shop.address && (
        <>
          <p className="text-sm text-fg">{shop.address}</p>
          {shop.addressQuery && (
            <a
              href={mapsLink(shop.addressQuery)}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-3 flex h-11 w-full items-center justify-center rounded-xl border border-border text-sm text-fg transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            >
              Traçar rota
            </a>
          )}
        </>
      )}

      <h3 className="mt-6 text-sm font-semibold text-fg">Horário de funcionamento</h3>
      <ul className="mt-1">
        {[...shop.businessHours]
          // Começa na segunda, como o protótipo — domingo fecha a lista.
          .sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7))
          .map((hour, index, all) => {
            const isToday = hour.weekday === today;
            return (
              <li
                key={hour.weekday}
                className={[
                  'flex h-10 items-center justify-between gap-3 text-sm',
                  index < all.length - 1 ? 'border-b border-border' : '',
                  isToday ? 'font-semibold text-gold' : 'text-fg',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <span>
                  {WEEKDAY_FULL[hour.weekday]?.replace('-feira', '')}
                  {isToday && <span className="sr-only"> (hoje)</span>}
                </span>
                <span>
                  {hour.closed
                    ? 'Fechado'
                    : `${minutesToTime(hour.opensAt)} – ${minutesToTime(hour.closesAt)}`}
                </span>
              </li>
            );
          })}
      </ul>
    </Section>
  );
}

/** Dia da semana AGORA no fuso da barbearia. */
function todayWeekday(timezone: string): number {
  const label = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(
    new Date(),
  );
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(label);
}
