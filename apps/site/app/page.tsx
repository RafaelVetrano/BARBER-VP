import type { Metadata, Viewport } from 'next';
import type { PublicSaasPlan } from '@barbervp/types';
import type { LandingFaq as LandingFaqItem } from '../components/landing/content';
import { fetchSaasPlans } from '../lib/server-api';
import { SITE_URL } from '../lib/urls';
import { LandingNav } from '../components/landing/landing-nav';
import { LandingFaq } from '../components/landing/landing-faq';
import {
  Features,
  FinalCta,
  Hero,
  HowItWorks,
  LandingFooter,
  Plans,
  Stats,
  Testimonials,
} from '../components/landing/sections';
import { buildFaqs, SECTION_IDS } from '../components/landing/content';
import { LIGHT_SAAS, paletteVars } from '../components/landing/palette';

/**
 * Landing de vendas (fase 10) — a porta de entrada do SaaS.
 *
 * Server Component com ISR de 1 hora: o conteúdo é 90% editorial e estático, e
 * o único pedaço vivo (preço e bullets dos planos) vem de
 * `GET /public/saas-plans`. Mudar o preço no super admin aparece aqui na
 * revalidação seguinte, sem deploy e sem rebuild.
 *
 * SSR e não client-side por causa do SEO: esta é a página que precisa ranquear
 * para "sistema para barbearia", e preço em `useEffect` chega vazio para o robô.
 */
export const revalidate = 3_600;

const DESCRIPTION =
  'Agendamento online 24h, financeiro, comissões automáticas e clube de assinaturas — tudo num painel feito para barbearias.';

export const metadata: Metadata = {
  // Sem `metadataBase` o Next emite canonical e `og:url` relativos ("/"), e
  // canonical relativo não consolida sinal de busca — o robô precisa da origem.
  metadataBase: new URL(SITE_URL),
  // Sobrescreve o `default` do layout: a home é a única página do site que
  // disputa busca por termo genérico, e "Site institucional" não é o termo.
  title: 'BarberVP — Sistema de gestão para barbearias',
  description: DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'BarberVP',
    locale: 'pt_BR',
    title: 'BarberVP — Sistema de gestão para barbearias',
    description: DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'BarberVP — Sistema de gestão para barbearias',
    description: DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

/**
 * A landing é a única superfície clara do produto (decisão da fase 10). O
 * layout raiz declara `colorScheme: 'dark'` para as telas de auth; aqui o
 * `viewport` da própria rota corrige a barra do navegador e os controles nativos
 * — sem isso, um `<select>` renderiza escuro no meio de uma página branca.
 */
export const viewport: Viewport = {
  themeColor: LIGHT_SAAS.bg,
  colorScheme: 'light',
  width: 'device-width',
  initialScale: 1,
};

/**
 * `SoftwareApplication` + `FAQPage`.
 *
 * As ofertas saem dos MESMOS planos renderizados na página — se o preço mudar no
 * admin, o dado estruturado muda junto. Anunciar R$ 89 ao Google e mostrar
 * R$ 99 ao visitante é o tipo de divergência que derruba rich result.
 */
function JsonLd({ plans, faqs }: { plans: PublicSaasPlan[]; faqs: LandingFaqItem[] }) {
  const graph: Record<string, unknown>[] = [
    {
      '@type': 'SoftwareApplication',
      name: 'BarberVP',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description: DESCRIPTION,
      url: SITE_URL,
      inLanguage: 'pt-BR',
      ...(plans.length > 0
        ? {
            offers: plans.map((plan) => ({
              '@type': 'Offer',
              name: plan.name,
              price: (plan.priceCents / 100).toFixed(2),
              priceCurrency: 'BRL',
              category: 'subscription',
              url: `${SITE_URL}/cadastro?plano=${encodeURIComponent(plan.id)}`,
            })),
          }
        : {}),
    },
    {
      '@type': 'FAQPage',
      mainEntity: faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.q,
        acceptedAnswer: { '@type': 'Answer', text: faq.a },
      })),
    },
  ];

  return (
    <script
      type="application/ld+json"
      // Conteúdo próprio e estático (nada vem do visitante); `JSON.stringify`
      // já escapa as aspas do texto do FAQ.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }),
      }}
    />
  );
}

export default async function Page() {
  const plans = await fetchSaasPlans();
  // Uma única fonte para a tela e para o dado estruturado — o `FAQPage` do
  // JSON-LD tem de dizer exatamente o que o visitante lê.
  const faqs = buildFaqs(plans);

  return (
    <div
      id="bvp-landing"
      style={paletteVars}
      className="min-h-screen bg-[var(--bvp-bg)] font-sans text-[var(--bvp-txt)] antialiased"
    >
      <JsonLd plans={plans} faqs={faqs} />
      <LandingNav />
      <main>
        <Hero />
        <Stats />
        <Features />
        <HowItWorks />
        <Plans plans={plans} />
        <Testimonials />

        <section id={SECTION_IDS.faq} className="mx-auto w-full max-w-[780px] px-5 py-[clamp(56px,7vw,88px)] sm:px-6">
          <h2 className="m-0 mb-8 text-center font-sans text-[clamp(24px,3vw,34px)] font-extrabold tracking-[-.6px] text-[var(--bvp-txt)]">
            Perguntas frequentes
          </h2>
          <LandingFaq faqs={faqs} />
        </section>

        <FinalCta />
      </main>
      <LandingFooter />
    </div>
  );
}
