import { Injectable } from '@nestjs/common';
import type {
  PublicBarbershop,
  PublicBarberSummary,
  PublicClientPlanSummary,
  PublicReview,
  PublicServiceSummary,
} from '@barbervp/types';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/errors/api.exception';
import { SubscriptionCoverageService } from './subscription-coverage.service';

/** Quantas avaliações a página carrega de saída (o "ver todas" é fase 07). */
const REVIEWS_PAGE_SIZE = 6;

/**
 * Payload da página pública `/{slug}`.
 *
 * Uma consulta só para a tela inteira: capa, contatos, serviços, equipe,
 * planos, avaliações e horário de funcionamento. É página indexada e aberta em
 * 4G no meio da rua — servir isso em sete round-trips seria pior para o cliente
 * e para o SEO.
 *
 * Tudo é filtrado por `tenantId`, sempre resolvido a partir do slug pelo
 * `TenantGuard`. Nenhum parâmetro desta rota escolhe barbearia: é o que a suíte
 * de isolamento prova.
 */
@Injectable()
export class PublicPageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly coverage: SubscriptionCoverageService,
  ) {}

  async getBySlug(tenantId: string, clientId: string | null): Promise<PublicBarbershop> {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: {
        id: true,
        slug: true,
        name: true,
        timezone: true,
        settings: true,
        businessHours: {
          orderBy: { weekday: 'asc' },
          select: { weekday: true, opensAt: true, closesAt: true, closed: true },
        },
      },
    });

    if (!tenant) {
      throw ApiException.notFound('Barbearia não encontrada.');
    }

    const settings = tenant.settings;
    const showServices = settings?.showServices ?? true;
    const showTeam = settings?.showTeam ?? true;
    const showReviews = settings?.showReviews ?? true;

    const [services, barbers, plans, reviews, rating, subscription] = await Promise.all([
      showServices ? this.listServices(tenant.id) : Promise.resolve([]),
      showTeam ? this.listBarbers(tenant.id) : Promise.resolve([]),
      this.listPlans(tenant.id),
      showReviews ? this.listReviews(tenant.id) : Promise.resolve([]),
      showReviews ? this.aggregateRating(tenant.id) : Promise.resolve(null),
      clientId ? this.coverage.activeSubscription(tenant.id, clientId) : Promise.resolve(null),
    ]);

    return {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      timezone: tenant.timezone,
      logoUrl: settings?.logoUrl ?? null,
      coverUrl: settings?.coverUrl ?? null,
      about: settings?.showAbout === false ? null : (settings?.sobre ?? null),
      instagram: settings?.instagram ?? null,
      whatsapp: settings?.whatsapp ?? null,
      address: settings?.address ?? null,
      addressQuery: buildAddressQuery(tenant.name, settings),
      sections: {
        services: showServices,
        team: showTeam,
        about: settings?.showAbout ?? true,
        reviews: showReviews,
      },
      allowOnlineBooking: settings?.allowOnlineBooking ?? true,
      policy: {
        minLeadMinutes: settings?.antecedenciaMinima ?? 60,
        cancelWindowHours: settings?.cancelamentoHoras ?? 2,
        noShowBlockCount: settings?.bloquearFaltasQtd ?? 3,
      },
      rating,
      businessHours: tenant.businessHours,
      services,
      barbers,
      plans,
      reviews,
      subscription,
    };
  }

  private async listServices(tenantId: string): Promise<PublicServiceSummary[]> {
    const services = await this.prisma.service.findMany({
      where: { tenantId, active: true, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        description: true,
        durationMin: true,
        priceCents: true,
        category: true,
        isCombo: true,
        comboParts: { select: { partServiceId: true } },
        barberServices: {
          where: { barber: { active: true, deletedAt: null } },
          select: { barberId: true },
        },
      },
    });

    return services.map((service) => ({
      id: service.id,
      name: service.name,
      description: service.description,
      durationMin: service.durationMin,
      priceCents: service.priceCents,
      category: service.category,
      isCombo: service.isCombo,
      comboPartIds: service.comboParts.map((part) => part.partServiceId),
      barberIds: service.barberServices.map((link) => link.barberId),
    }));
  }

  private async listBarbers(tenantId: string): Promise<PublicBarberSummary[]> {
    const barbers = await this.prisma.barber.findMany({
      where: { tenantId, active: true, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        specialty: true,
        ratingBps: true,
        avatarUrl: true,
        barberServices: {
          where: { service: { active: true, deletedAt: null } },
          select: { serviceId: true },
        },
      },
    });

    return barbers.map((barber) => ({
      id: barber.id,
      name: barber.name,
      specialty: barber.specialty,
      ratingBps: barber.ratingBps,
      avatarUrl: barber.avatarUrl,
      serviceIds: barber.barberServices.map((link) => link.serviceId),
    }));
  }

  /**
   * Planos de assinatura vendidos pela barbearia, com a economia calculada
   * contra o preço avulso — o "Economize R$ 60/mês" do card.
   */
  private async listPlans(tenantId: string): Promise<PublicClientPlanSummary[]> {
    const plans = await this.prisma.clientPlan.findMany({
      where: { tenantId, active: true, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        description: true,
        priceCents: true,
        billingDay: true,
        isPopular: true,
        items: {
          select: {
            quota: true,
            serviceId: true,
            service: { select: { name: true, priceCents: true } },
          },
        },
      },
    });

    return plans.map((plan) => {
      const retailCents = plan.items.reduce(
        (total, item) => total + item.service.priceCents * item.quota,
        0,
      );

      return {
        id: plan.id,
        name: plan.name,
        description: plan.description,
        priceCents: plan.priceCents,
        billingDay: plan.billingDay,
        isPopular: plan.isPopular,
        items: plan.items.map((item) => ({
          serviceId: item.serviceId,
          serviceName: item.service.name,
          quota: item.quota,
        })),
        savingsCents: Math.max(0, retailCents - plan.priceCents),
      };
    });
  }

  private async listReviews(tenantId: string): Promise<PublicReview[]> {
    const reviews = await this.prisma.review.findMany({
      where: { tenantId, published: true },
      orderBy: { createdAt: 'desc' },
      take: REVIEWS_PAGE_SIZE,
      select: {
        id: true,
        authorName: true,
        rating: true,
        comment: true,
        createdAt: true,
        barber: { select: { name: true } },
      },
    });

    return reviews.map((review) => ({
      id: review.id,
      authorName: review.authorName,
      rating: review.rating,
      comment: review.comment,
      barberName: review.barber?.name ?? null,
      createdAt: review.createdAt.toISOString(),
    }));
  }

  /** Nota da barbearia: média das avaliações publicadas, em centésimos. */
  private async aggregateRating(
    tenantId: string,
  ): Promise<{ averageBps: number; count: number } | null> {
    const result = await this.prisma.review.aggregate({
      where: { tenantId, published: true },
      _avg: { rating: true },
      _count: { _all: true },
    });

    if (!result._count._all || result._avg.rating === null) {
      return null;
    }

    return {
      averageBps: Math.round(result._avg.rating * 100),
      count: result._count._all,
    };
  }
}

/** Texto para o `?q=` do mapa. Sem endereço, cai no nome da barbearia. */
function buildAddressQuery(
  tenantName: string,
  settings: {
    address: string | null;
    addressCity: string | null;
    addressState: string | null;
  } | null,
): string | null {
  if (!settings?.address) {
    return null;
  }
  const city = [settings.addressCity, settings.addressState].filter(Boolean).join('/');
  return [tenantName, settings.address, city].filter(Boolean).join(', ');
}
