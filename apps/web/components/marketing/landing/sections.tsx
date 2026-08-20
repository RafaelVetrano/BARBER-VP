import type { PublicSaasPlan } from '@barbervp/types';
import {
  FEATURES,
  SECTION_IDS,
  STATS,
  STEPS,
  TESTIMONIALS,
  signupHref,
} from './content';

/**
 * Seções estáticas da landing — todas Server Components.
 *
 * Só nav e FAQ são ilhas client (têm estado). O resto é HTML puro: é o que faz
 * a página chegar pronta para o robô de busca e para o celular em 4G ruim.
 */

const SHELL = 'mx-auto w-full max-w-[1180px] px-5 sm:px-6';
/** Título de seção — `font-sans` explícito porque o base layer joga Sora nos h2. */
const H2 = 'm-0 font-sans text-[clamp(26px,3.4vw,38px)] font-extrabold leading-[1.1] tracking-[-.8px] text-[var(--bvp-txt)]';
const EYEBROW = 'mb-3 text-[12px] font-semibold uppercase tracking-[1px] text-[var(--bvp-gold)]';
const GOLD_BUTTON = 'inline-flex items-center justify-center rounded-xl font-bold no-underline transition-colors';

/** Barras do mock de faturamento — alturas exatas do protótipo. */
const MOCK_BARS = [42, 58, 50, 72, 64, 88, 80] as const;

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Duas camadas decorativas do protótipo: brilho dourado no canto e
          textura de linhas diagonais. Puramente visuais. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(80% 120% at 80% -10%, rgba(232,163,61,.18), transparent 55%), linear-gradient(180deg, #FFFFFF, #FAFAFA)',
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage:
            'repeating-linear-gradient(118deg, rgba(0,0,0,.018) 0 1px, transparent 1px 24px)',
        }}
      />
      <div
        className={`${SHELL} relative grid items-center gap-10 py-[clamp(44px,7vw,84px)] lg:grid-cols-2 lg:gap-12`}
      >
        <div>
          <div className="mb-[22px] inline-flex items-center gap-2 rounded-full border border-[var(--bvp-line-2)] px-3.5 py-1.5 text-[12px] font-semibold tracking-[.3px] text-[var(--bvp-gold)]">
            +180 barbearias já crescem com o BarberVP
          </div>
          <h1 className="m-0 mb-[18px] text-balance font-sans text-[clamp(30px,4.8vw,54px)] font-extrabold leading-[1.05] tracking-[-1.5px] text-[var(--bvp-txt)]">
            Sua barbearia lotada, <span className="text-[var(--bvp-gold)]">sem você tocar no telefone</span>
          </h1>
          <p className="m-0 mb-7 max-w-[520px] text-[clamp(15px,1.6vw,18px)] leading-[1.55] text-[var(--bvp-txt-2)]">
            Agendamento online 24h, financeiro, comissões automáticas e clube de assinaturas — tudo
            num painel feito para barbearias.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={signupHref()}
              className={`${GOLD_BUTTON} h-[54px] px-7 text-[16px] tracking-[.2px]`}
              style={{ background: 'var(--bvp-gold)', color: 'var(--bvp-on-gold)' }}
            >
              Comece grátis por 7 dias
            </a>
            <a
              href={`#${SECTION_IDS.plans}`}
              className="inline-flex h-[54px] items-center justify-center rounded-xl border border-[var(--bvp-line-2)] px-6 text-[15px] font-semibold text-[var(--bvp-txt)] no-underline transition-colors hover:border-[var(--bvp-gold)] hover:text-[var(--bvp-gold)]"
            >
              Ver planos
            </a>
          </div>
          <div className="mt-4 text-[12.5px] font-medium text-[var(--bvp-txt-3)]">
            Sem cartão de crédito · cancele quando quiser
          </div>
        </div>

        <DashboardMock />
      </div>
    </section>
  );
}

/**
 * Vitrine do painel. Decorativa e estática — números fixos de propósito: é uma
 * ilustração do produto, não dado de barbearia nenhuma. `aria-hidden` porque
 * ler "42%, 58%, 50%…" em voz alta não informa nada a quem usa leitor de tela.
 */
function DashboardMock() {
  return (
    <div
      aria-hidden
      className="rounded-[18px] border border-[var(--bvp-line-2)] bg-[var(--bvp-surface)] p-5"
      style={{ boxShadow: '0 24px 60px rgba(0,0,0,.10)' }}
    >
      <div className="mb-4 flex items-center justify-between">
        <span className="text-[12px] font-semibold uppercase tracking-[.5px] text-[var(--bvp-txt-3)]">
          Faturamento · hoje
        </span>
        <span
          className="rounded-md px-2 py-0.5 text-[11px] font-semibold text-[var(--bvp-green)]"
          style={{ background: 'rgba(47,158,107,.12)' }}
        >
          +12%
        </span>
      </div>
      <div className="mb-1 text-[clamp(30px,5vw,38px)] font-extrabold tracking-[-1px] text-[var(--bvp-gold)]">
        R$ 3.240
      </div>
      <div className="mb-5 text-[12px] font-medium text-[var(--bvp-txt-3)]">
        vs. R$ 2.890 na semana passada
      </div>
      <div className="flex h-[88px] items-end gap-[7px] border-t border-[var(--bvp-line)] pt-2">
        {MOCK_BARS.map((height, index) => (
          <div
            key={index}
            className="flex-1 rounded-t-[4px]"
            style={{
              height: `${height}%`,
              background: 'linear-gradient(180deg, var(--bvp-gold-2), rgba(232,163,61,.35))',
            }}
          />
        ))}
      </div>
      <div className="mt-3.5 flex justify-between gap-2.5">
        {[
          { value: '94%', label: 'ocupação' },
          { value: 'R$ 58', label: 'ticket médio' },
        ].map((card) => (
          <div
            key={card.label}
            className="flex-1 rounded-[10px] border border-[var(--bvp-line)] bg-[var(--bvp-surface-2)] px-3 py-2.5"
          >
            <div className="text-[17px] font-bold text-[var(--bvp-txt)]">{card.value}</div>
            <div className="text-[11px] font-medium text-[var(--bvp-txt-3)]">{card.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Stats() {
  return (
    <section className="border-y border-[var(--bvp-line)] bg-[var(--bvp-bg2)]">
      <div className={`${SHELL} grid gap-7 py-11 sm:grid-cols-2 lg:grid-cols-4`}>
        {STATS.map((stat) => (
          <div key={stat.big}>
            <div className="mb-2 text-[clamp(30px,4vw,40px)] font-extrabold tracking-[-1px] text-[var(--bvp-gold)]">
              {stat.big}
            </div>
            <div className="text-[13.5px] leading-[1.5] text-[var(--bvp-txt-2)]">{stat.txt}</div>
            {stat.src ? (
              <div className="mt-1.5 text-[11px] font-medium text-[var(--bvp-txt-3)]">
                Fonte: {stat.src}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

export function Features() {
  return (
    <section id={SECTION_IDS.features} className={`${SHELL} py-[clamp(56px,7vw,88px)]`}>
      <div className="mx-auto mb-11 max-w-[620px] text-center">
        <div className={EYEBROW}>Tudo num só lugar</div>
        <h2 className={H2}>Pare de gerenciar sua barbearia no caderninho</h2>
      </div>
      <div className="grid gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature) => (
          <div
            key={feature.title}
            className="rounded-2xl border border-[var(--bvp-line)] bg-[var(--bvp-surface)] p-6 transition-colors hover:border-[var(--bvp-line-2)]"
          >
            <div
              aria-hidden
              className="mb-4 flex h-[46px] w-[46px] items-center justify-center rounded-xl border border-[var(--bvp-line-2)] text-[20px] text-[var(--bvp-gold)]"
              style={{ background: 'var(--bvp-accent-soft)' }}
            >
              {feature.icon}
            </div>
            <div className="mb-2 text-[16px] font-bold text-[var(--bvp-txt)]">{feature.title}</div>
            <div className="text-[13.5px] leading-[1.55] text-[var(--bvp-txt-2)]">
              {feature.description}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function HowItWorks() {
  return (
    <section
      id={SECTION_IDS.how}
      className="border-t border-[var(--bvp-line)] bg-[var(--bvp-bg2)]"
    >
      <div className={`${SHELL} py-[clamp(56px,7vw,88px)]`}>
        <div className="mb-11 text-center">
          <div className={EYEBROW}>Simples de começar</div>
          <h2 className={H2}>Da inscrição ao primeiro agendamento</h2>
        </div>
        <ol className="m-0 grid list-none gap-[18px] p-0 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step) => (
            <li
              key={step.n}
              className="rounded-2xl border border-[var(--bvp-line)] bg-[var(--bvp-surface)] p-[22px]"
            >
              <div
                aria-hidden
                className="mb-4 flex h-[38px] w-[38px] items-center justify-center rounded-[10px] text-[16px] font-extrabold"
                style={{ background: 'var(--bvp-gold)', color: 'var(--bvp-on-gold)' }}
              >
                {step.n}
              </div>
              <div className="mb-[7px] text-[15.5px] font-bold text-[var(--bvp-txt)]">
                {step.title}
              </div>
              <div className="text-[13px] leading-[1.5] text-[var(--bvp-txt-2)]">
                {step.description}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** `pt-BR` a partir de centavos — a API manda `priceCents`, nunca string. */
function formatPrice(priceCents: number): string {
  return (priceCents / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function Plans({ plans }: { plans: PublicSaasPlan[] }) {
  return (
    <section id={SECTION_IDS.plans} className={`${SHELL} py-[clamp(56px,7vw,88px)]`}>
      <div className="mb-8 text-center">
        <div className={EYEBROW}>Planos</div>
        <h2 className={`${H2} mb-2.5`}>Um plano para cada fase da sua barbearia</h2>
        <p className="m-0 text-[14.5px] text-[var(--bvp-txt-2)]">
          Comece no Essencial e evolua quando precisar. Sem fidelidade.
        </p>
      </div>

      {plans.length === 0 ? (
        // A API não respondeu na revalidação. A página continua de pé e o
        // visitante continua tendo para onde ir — o cadastro não depende
        // de escolher plano antes.
        <div className="mx-auto max-w-[420px] rounded-2xl border border-[var(--bvp-line)] bg-[var(--bvp-surface)] p-6 text-center">
          <p className="m-0 mb-4 text-[14px] text-[var(--bvp-txt-2)]">
            Não conseguimos carregar os planos agora. Você pode começar o teste grátis e escolher
            depois, direto no painel.
          </p>
          <a
            href={signupHref()}
            className={`${GOLD_BUTTON} h-12 w-full text-[14px]`}
            style={{ background: 'var(--bvp-gold)', color: 'var(--bvp-on-gold)' }}
          >
            Comece grátis por 7 dias
          </a>
        </div>
      ) : (
        <div className="grid items-stretch gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className="relative flex flex-col rounded-[18px] bg-[var(--bvp-surface)] p-[26px]"
              style={
                plan.highlight
                  ? {
                      border: '1.5px solid var(--bvp-gold)',
                      boxShadow: '0 16px 50px rgba(232,163,61,.12)',
                      marginTop: '8px',
                    }
                  : { border: '1px solid var(--bvp-line)' }
              }
            >
              {plan.highlight ? (
                <div
                  className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full px-3.5 py-[5px] text-[11px] font-extrabold tracking-[.5px]"
                  style={{ background: 'var(--bvp-gold)', color: 'var(--bvp-on-gold)' }}
                >
                  ★ MAIS POPULAR
                </div>
              ) : null}

              <div className="mb-3.5 text-[18px] font-bold text-[var(--bvp-txt)]">{plan.name}</div>
              <div className="flex items-baseline gap-1">
                <span
                  className="text-[36px] font-extrabold tracking-[-1px]"
                  style={{ color: plan.highlight ? 'var(--bvp-gold)' : 'var(--bvp-txt)' }}
                >
                  R$ {formatPrice(plan.priceCents)}
                </span>
                <span className="text-[14px] font-medium text-[var(--bvp-txt-3)]">/mês</span>
              </div>

              {plan.baseLabel ? (
                <div className="mt-4 text-[13px] font-semibold text-[var(--bvp-gold)]">
                  {plan.baseLabel}
                </div>
              ) : null}

              <ul className="mb-5 mt-4 flex flex-1 list-none flex-col gap-[9px] p-0">
                {plan.marketingFeatures.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2.5 text-[13.5px] font-medium leading-[1.4] text-[var(--bvp-txt-2)]"
                  >
                    <span aria-hidden className="flex-shrink-0 text-[var(--bvp-gold)]">
                      ✓
                    </span>
                    {feature}
                  </li>
                ))}
              </ul>

              <a
                href={signupHref(plan.id)}
                className="mt-auto flex h-[46px] w-full items-center justify-center rounded-[11px] text-[14px] font-bold no-underline transition-colors"
                style={
                  plan.highlight
                    ? {
                        background: 'var(--bvp-gold)',
                        color: 'var(--bvp-on-gold)',
                        border: '1px solid var(--bvp-gold)',
                      }
                    : {
                        background: 'transparent',
                        color: 'var(--bvp-txt)',
                        border: '1px solid var(--bvp-line-2)',
                      }
                }
              >
                Comece grátis por 7 dias
              </a>
            </div>
          ))}
        </div>
      )}

      <div className="mt-[26px] text-center text-[12.5px] font-medium text-[var(--bvp-txt-3)]">
        Todos os planos incluem 7 dias grátis · sem cartão · cancele quando quiser
      </div>
    </section>
  );
}

export function Testimonials() {
  return (
    <section className="border-t border-[var(--bvp-line)] bg-[var(--bvp-bg2)]">
      <div className={`${SHELL} py-[clamp(56px,7vw,80px)]`}>
        <h2 className={`${H2} mb-9 text-center`}>Resultados de quem já usa</h2>
        <div className="grid gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
          {TESTIMONIALS.map((testimonial) => (
            <figure
              key={testimonial.name}
              className="m-0 rounded-2xl border border-[var(--bvp-line)] bg-[var(--bvp-surface)] p-6"
            >
              <div className="mb-3 text-[26px] font-extrabold tracking-[-.5px] text-[var(--bvp-gold)]">
                {testimonial.metric}
              </div>
              <blockquote className="m-0 mb-[18px] text-[14.5px] leading-[1.55] text-[var(--bvp-txt)]">
                “{testimonial.quote}”
              </blockquote>
              <figcaption className="flex items-center gap-[11px]">
                <div
                  aria-hidden
                  className="h-[38px] w-[38px] flex-shrink-0 rounded-full"
                  style={{
                    background: `radial-gradient(100% 100% at 30% 20%, hsl(${testimonial.hue} 34% 32%), hsl(${testimonial.hue} 30% 17%) 70%, hsl(${testimonial.hue + 6} 26% 10%))`,
                  }}
                />
                <div>
                  <div className="text-[13.5px] font-semibold text-[var(--bvp-txt)]">
                    {testimonial.name}
                  </div>
                  <div className="text-[12px] font-medium text-[var(--bvp-txt-3)]">
                    {testimonial.shop}
                  </div>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className="border-t border-[var(--bvp-line)]">
      <div className={`${SHELL} py-[clamp(56px,7vw,90px)] text-center`}>
        <div className="mx-auto max-w-[600px]">
          <h2 className="m-0 mb-4 text-balance font-sans text-[clamp(28px,4vw,44px)] font-extrabold leading-[1.1] tracking-[-1px] text-[var(--bvp-txt)]">
            Comece hoje. Sua agenda agradece.
          </h2>
          <p className="m-0 mb-7 text-[16px] leading-[1.5] text-[var(--bvp-txt-2)]">
            7 dias para testar tudo, sem cartão. Monte sua barbearia em minutos.
          </p>
          <a
            href={signupHref()}
            className={`${GOLD_BUTTON} h-14 px-8 text-[16px]`}
            style={{ background: 'var(--bvp-gold)', color: 'var(--bvp-on-gold)' }}
          >
            Comece grátis por 7 dias
          </a>
          <div className="mt-3.5 text-[12.5px] font-medium text-[var(--bvp-txt-3)]">
            7 dias grátis · sem cartão de crédito
          </div>
        </div>
      </div>
    </section>
  );
}

export function LandingFooter() {
  return (
    <footer className="border-t border-[var(--bvp-line)] bg-[var(--bvp-bg2)] px-5 py-7 text-center sm:px-6">
      {/* `min-h-[44px]` nos links: são alvo de dedo, e o texto de 12px sozinho
          dá 18px de altura — abaixo do mínimo das WCAG. */}
      <div className="flex flex-wrap items-center justify-center gap-x-1 text-[12px] font-medium text-[var(--bvp-txt-3)]">
        <span className="inline-flex min-h-[44px] items-center px-1">© 2026 BarberVP</span>
        {[
          { href: '/entrar', label: 'Entrar' },
          { href: `#${SECTION_IDS.plans}`, label: 'Planos' },
          { href: `#${SECTION_IDS.faq}`, label: 'Dúvidas' },
        ].map((link) => (
          <span key={link.label} className="inline-flex items-center">
            <span aria-hidden className="px-1">
              ·
            </span>
            <a
              href={link.href}
              className="inline-flex min-h-[44px] items-center px-2 text-[var(--bvp-gold)] no-underline hover:underline"
            >
              {link.label}
            </a>
          </span>
        ))}
      </div>
    </footer>
  );
}
