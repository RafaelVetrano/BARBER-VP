import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { minutesToTime } from '@barbervp/types';
import { BarbershopPage } from '../../components/public-page/barbershop-page';
import { fetchBarbershop } from '../../lib/server-api';

interface PageProps {
  params: { slug: string };
}

/**
 * Metadata por barbearia.
 *
 * A página é o cartão de visitas do negócio: quando o dono manda o link no
 * grupo do WhatsApp, o que aparece é o que sai daqui. Título, descrição e capa
 * saem do cadastro real — nada de "BarberVP" genérico em todas as barbearias.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const shop = await fetchBarbershop(params.slug);

  if (!shop) {
    return { title: 'Barbearia não encontrada', robots: { index: false, follow: false } };
  }

  const description =
    shop.about?.slice(0, 160) ??
    [
      `Agende online na ${shop.name}`,
      shop.address ? `em ${shop.address}` : null,
      shop.services.length > 0
        ? `Serviços: ${shop.services.slice(0, 3).map((service) => service.name).join(', ')}.`
        : null,
    ]
      .filter(Boolean)
      .join(' · ');

  const canonical = `/${shop.slug}`;

  return {
    title: shop.name,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      title: `${shop.name} — agende seu horário`,
      description,
      url: canonical,
      siteName: shop.name,
      locale: 'pt_BR',
      images: shop.coverUrl ? [{ url: shop.coverUrl, alt: `Capa da ${shop.name}` }] : undefined,
    },
    twitter: {
      card: shop.coverUrl ? 'summary_large_image' : 'summary',
      title: `${shop.name} — agende seu horário`,
      description,
      images: shop.coverUrl ? [shop.coverUrl] : undefined,
    },
    // Barbearia que desligou o agendamento online continua sendo vitrine, mas
    // não faz sentido indexar quem está com a página desativada por completo.
    robots: { index: true, follow: true },
  };
}

/**
 * Rota pública `/{slug}`.
 *
 * Componente de SERVIDOR: a primeira carga vem com HTML pronto, para o robô de
 * busca e para quem abre o link num 4G ruim. A interação (wizard, login) vive no
 * `BarbershopPage`, que é cliente.
 */
export default async function Page({ params }: PageProps) {
  const shop = await fetchBarbershop(params.slug);

  if (!shop) {
    notFound();
  }

  return (
    <>
      <script
        type="application/ld+json"
        // Dados estruturados de negócio local: é o que faz a barbearia aparecer
        // com horário e endereço no resultado da busca.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildJsonLd(shop)) }}
      />
      <BarbershopPage initialShop={shop} />
    </>
  );
}

function buildJsonLd(shop: NonNullable<Awaited<ReturnType<typeof fetchBarbershop>>>) {
  const DAYS = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];

  return {
    '@context': 'https://schema.org',
    '@type': 'HairSalon',
    name: shop.name,
    description: shop.about ?? undefined,
    image: shop.coverUrl ?? undefined,
    logo: shop.logoUrl ?? undefined,
    telephone: shop.whatsapp ? `+${shop.whatsapp}` : undefined,
    address: shop.address ?? undefined,
    aggregateRating: shop.rating
      ? {
          '@type': 'AggregateRating',
          ratingValue: (shop.rating.averageBps / 100).toFixed(1),
          reviewCount: shop.rating.count,
        }
      : undefined,
    openingHoursSpecification: shop.businessHours
      .filter((hour) => !hour.closed)
      .map((hour) => ({
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: DAYS[hour.weekday],
        opens: minutesToTime(hour.opensAt),
        closes: minutesToTime(hour.closesAt),
      })),
    makesOffer: shop.services.map((service) => ({
      '@type': 'Offer',
      itemOffered: { '@type': 'Service', name: service.name },
      price: (service.priceCents / 100).toFixed(2),
      priceCurrency: 'BRL',
    })),
  };
}
