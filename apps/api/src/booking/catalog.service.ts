import { Injectable } from '@nestjs/common';
import type { BookingQuote, QuotedService } from '@barbervp/types';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/errors/api.exception';
import { SubscriptionCoverageService, type ServiceCoverage } from './subscription-coverage.service';

/** Serviço do catálogo já com o que o motor precisa saber sobre ele. */
export interface CatalogEntry {
  id: string;
  name: string;
  durationMin: number;
  priceCents: number;
  isCombo: boolean;
  /** Peças que este combo substitui (vazio quando não é combo). */
  partIds: string[];
}

export interface ResolvedSelection {
  services: CatalogEntry[];
  comboApplied: boolean;
  comboServiceName: string | null;
  coverage: Map<string, ServiceCoverage>;
}

/**
 * Catálogo do booking: resolve a seleção de serviços do wizard.
 *
 * **O combo é regra de catálogo, não de tela.** O protótipo troca os ids no
 * cliente (`COMBO_ID`/`PAIR_IDS`); aqui a composição vive em `ServiceComboPart`
 * e a troca acontece no servidor. Motivo: preço promocional decidido no
 * navegador é preço que qualquer um edita — e a mesma regra precisa valer para
 * o agendamento feito pelo dashboard (fase 06), que não passa por este wizard.
 *
 * **O combo só entra quando de fato sai mais barato** — que é o que o toast do
 * protótipo promete ("Combo aplicado — sai mais barato 😉"). Para um assinante
 * cujo plano cobre Corte e Barba separadamente, agrupá-los num terceiro serviço
 * fora do plano transformaria dois atendimentos gratuitos num de R$ 70. Nesse
 * caso a seleção fica como está.
 */
@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly coverage: SubscriptionCoverageService,
  ) {}

  /** Serviços ativos do tenant, com a composição dos combos já carregada. */
  async listActive(tenantId: string): Promise<CatalogEntry[]> {
    const services = await this.prisma.service.findMany({
      where: { tenantId, active: true, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        durationMin: true,
        priceCents: true,
        isCombo: true,
        comboParts: { select: { partServiceId: true } },
      },
    });

    return services.map((service) => ({
      id: service.id,
      name: service.name,
      durationMin: service.durationMin,
      priceCents: service.priceCents,
      isCombo: service.isCombo,
      partIds: service.comboParts.map((part) => part.partServiceId),
    }));
  }

  /**
   * Aplica o combo e calcula a cobertura de assinatura da seleção final.
   *
   * Recusa id desconhecido, inativo ou de outra barbearia — a rota é pública, e
   * um id de serviço do tenant vizinho não pode virar agendamento aqui.
   */
  async resolveSelection(
    tenantId: string,
    requestedIds: string[],
    clientId: string | null,
    now = new Date(),
  ): Promise<ResolvedSelection> {
    const unique = [...new Set(requestedIds)];
    if (unique.length === 0) {
      throw ApiException.badRequest('Escolha ao menos um serviço.');
    }

    const catalog = await this.listActive(tenantId);
    const byId = new Map(catalog.map((service) => [service.id, service]));

    const selected = unique.map((id) => {
      const service = byId.get(id);
      if (!service) {
        throw ApiException.badRequest('Serviço indisponível nesta barbearia.', { serviceId: id });
      }
      return service;
    });

    const rawCoverage = await this.coverage.coverageFor(tenantId, clientId, unique, now);

    const selectedIds = new Set(unique);
    let comboApplied = false;
    let comboServiceName: string | null = null;

    // Um combo por vez: os catálogos reais têm um ("Corte + Barba"), e aplicar
    // dois em cascata exigiria decidir prioridade sem regra de negócio para isso.
    for (const combo of catalog) {
      if (!combo.isCombo || combo.partIds.length === 0 || selectedIds.has(combo.id)) {
        continue;
      }
      if (!combo.partIds.every((partId) => selectedIds.has(partId))) {
        continue;
      }

      const partsCharged = combo.partIds.reduce((total, partId) => {
        const part = byId.get(partId);
        const covered = rawCoverage.get(partId);
        if (!part || (covered && !covered.exhausted)) {
          return total;
        }
        return total + part.priceCents;
      }, 0);

      const comboCovered = rawCoverage.get(combo.id);
      const comboCharged = comboCovered && !comboCovered.exhausted ? 0 : combo.priceCents;

      if (comboCharged >= partsCharged) {
        continue;
      }

      for (const partId of combo.partIds) {
        selectedIds.delete(partId);
      }
      selectedIds.add(combo.id);
      comboApplied = true;
      comboServiceName = combo.name;
      break;
    }

    const services = comboApplied
      ? catalog.filter((service) => selectedIds.has(service.id))
      : selected;

    const coverage = comboApplied
      ? await this.coverage.coverageFor(
          tenantId,
          clientId,
          services.map((service) => service.id),
          now,
        )
      : rawCoverage;

    return { services, comboApplied, comboServiceName, coverage };
  }

  /**
   * Cotação completa da seleção: preço, cobertura e quem pode atender.
   *
   * É o que alimenta os passos 1, 2 e 4 do wizard de uma vez — a lista de
   * serviços com o selo "Incluído na assinatura", a lista de barbeiros com o
   * motivo de cada bloqueio e o total do rodapé.
   */
  async quote(
    tenantId: string,
    requestedIds: string[],
    clientId: string | null,
    now = new Date(),
  ): Promise<BookingQuote> {
    const resolved = await this.resolveSelection(tenantId, requestedIds, clientId, now);
    const services = resolved.services;

    const quoted: QuotedService[] = services.map((service) => {
      const covered = resolved.coverage.get(service.id);
      const isCovered = !!covered && !covered.exhausted;
      return {
        serviceId: service.id,
        name: service.name,
        durationMin: service.durationMin,
        priceCents: service.priceCents,
        chargedCents: isCovered ? 0 : service.priceCents,
        coveredBySubscription: isCovered,
        subscriptionExhausted: !!covered && covered.exhausted,
      };
    });

    const eligibility = await this.barberEligibility(
      tenantId,
      services.map((service) => ({ id: service.id, name: service.name })),
    );

    return {
      resolvedServiceIds: services.map((service) => service.id),
      comboApplied: resolved.comboApplied,
      comboServiceName: resolved.comboServiceName,
      services: quoted,
      totalDurationMin: quoted.reduce((total, service) => total + service.durationMin, 0),
      totalPriceCents: quoted.reduce((total, service) => total + service.chargedCents, 0),
      coveredCents: quoted.reduce(
        (total, service) => total + (service.priceCents - service.chargedCents),
        0,
      ),
      eligibleBarberIds: eligibility.eligible,
      ineligibleBarbers: eligibility.ineligible,
    };
  }

  /**
   * Quem atende a seleção inteira, e por que os demais não atendem.
   *
   * O motivo importa: o protótipo apaga a linha do barbeiro e escreve "não
   * realiza Pigmentação" no lugar do "próximo livre". Um `disabled` mudo faria
   * o cliente achar que a tela travou.
   */
  async barberEligibility(
    tenantId: string,
    services: Array<{ id: string; name: string }>,
  ): Promise<{ eligible: string[]; ineligible: Array<{ barberId: string; reason: string }> }> {
    const barbers = await this.prisma.barber.findMany({
      where: { tenantId, active: true, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        barberServices: { select: { serviceId: true } },
      },
    });

    const eligible: string[] = [];
    const ineligible: Array<{ barberId: string; reason: string }> = [];

    for (const barber of barbers) {
      const offered = new Set(barber.barberServices.map((link) => link.serviceId));
      const missing = services.filter((service) => !offered.has(service.id));

      if (missing.length === 0) {
        eligible.push(barber.id);
        continue;
      }

      const names = missing.map((service) => service.name);
      const list =
        names.length === 1
          ? names[0]
          : `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
      ineligible.push({ barberId: barber.id, reason: `não realiza ${list}` });
    }

    return { eligible, ineligible };
  }
}
