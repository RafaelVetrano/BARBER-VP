import { randomUUID } from 'node:crypto';
import { hash } from '@node-rs/argon2';
import { MembershipRole, PrismaClient, type Prisma } from '@prisma/client';

/**
 * Helper da suíte de isolamento de tenant.
 *
 * Monta DOIS tenants completos e independentes (A e B), cada um com barbeiro,
 * serviço, cliente e agendamento próprios. Cada fase seguinte acrescenta os
 * seus casos usando este fixture — o contrato é sempre o mesmo: uma consulta
 * escopada no tenant A jamais pode devolver linha do tenant B.
 *
 * Os dados nascem com um sufixo aleatório e são apagados no `teardown`, então
 * a suíte pode rodar no mesmo banco do `seed` sem sujá-lo.
 */

export interface IsolatedTenant {
  id: string;
  slug: string;
  barberId: string;
  serviceId: string;
  clientId: string;
  clientProfileId: string;
  appointmentId: string;
  orderId: string;
  /** Dono com `Membership` OWNER — usado pelos casos HTTP da fase 03. */
  ownerUserId: string;
  ownerEmail: string;
}

/** Senha dos donos do fixture. Mesma para os dois, para o teste ser curto. */
export const FIXTURE_PASSWORD = 'IsolamentoBvp2026';

export interface IsolationFixture {
  prisma: PrismaClient;
  /** Tenant "de dentro" — o que a consulta sob teste deve enxergar. */
  a: IsolatedTenant;
  /** Tenant "de fora" — nenhuma linha dele pode vazar para consultas de A. */
  b: IsolatedTenant;
  /**
   * Afirma que `rows` só contém registros do tenant esperado.
   * Aceita qualquer linha que carregue `tenantId`.
   */
  expectOnlyTenant(rows: Array<{ tenantId?: string | null }>, expected: IsolatedTenant): void;
  teardown(): Promise<void>;
}

const prisma = new PrismaClient();

async function createTenant(label: string, suffix: string): Promise<IsolatedTenant> {
  const slug = `iso-${label}-${suffix}`;

  const tenant = await prisma.tenant.create({
    data: {
      slug,
      name: `Tenant de isolamento ${label.toUpperCase()}`,
      settings: { create: {} },
    },
    select: { id: true, slug: true },
  });

  // Dono real, com senha argon2 de verdade: os casos HTTP da fase 03 fazem
  // login por este usuário e usam o token emitido, sem atalho.
  const ownerEmail = `iso-owner-${label}-${suffix}@barbervp.test`;
  const owner = await prisma.user.create({
    data: {
      email: ownerEmail,
      name: `Dono ${label.toUpperCase()}`,
      passwordHash: await hash(FIXTURE_PASSWORD, {
        memoryCost: 19_456,
        timeCost: 2,
        parallelism: 1,
      }),
      memberships: { create: { tenantId: tenant.id, role: MembershipRole.OWNER } },
    },
    select: { id: true },
  });

  const barber = await prisma.barber.create({
    data: { tenantId: tenant.id, name: `Barbeiro ${label.toUpperCase()}` },
    select: { id: true },
  });

  const service = await prisma.service.create({
    data: {
      tenantId: tenant.id,
      name: `Serviço ${label.toUpperCase()}`,
      durationMin: 30,
      priceCents: 3_000,
    },
    select: { id: true },
  });

  await prisma.barberService.create({
    data: { tenantId: tenant.id, barberId: barber.id, serviceId: service.id },
  });

  const client = await prisma.client.create({
    data: {
      // Telefone sintético fora de qualquer faixa real, único por execução.
      phone: `9999${suffix}${label === 'a' ? '1' : '2'}`,
      name: `Cliente ${label.toUpperCase()}`,
      profiles: {
        create: { tenantId: tenant.id, phone: `9999${suffix}${label === 'a' ? '1' : '2'}` },
      },
    },
    select: { id: true, profiles: { select: { id: true } } },
  });

  const startsAt = new Date(Date.now() + 86_400_000);
  const appointment = await prisma.appointment.create({
    data: {
      tenantId: tenant.id,
      // Código previsível por tenant: o caso "código de A não abre pelo slug de
      // B" precisa que os dois tenants tenham códigos distintos e conhecidos.
      bookingCode: `AG-ISO${label.toUpperCase()}`,
      barberId: barber.id,
      serviceId: service.id,
      clientId: client.id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 30 * 60_000),
      priceCents: 3_000,
      services: {
        create: {
          tenantId: tenant.id,
          serviceId: service.id,
          priceCents: 3_000,
          durationMin: 30,
        },
      },
    },
    select: { id: true },
  });

  const order = await prisma.order.create({
    data: {
      tenantId: tenant.id,
      number: 1,
      barberId: barber.id,
      clientId: client.id,
      subtotalCents: 3_000,
      totalCents: 3_000,
    },
    select: { id: true },
  });

  return {
    id: tenant.id,
    slug: tenant.slug,
    barberId: barber.id,
    serviceId: service.id,
    clientId: client.id,
    clientProfileId: client.profiles[0]!.id,
    appointmentId: appointment.id,
    orderId: order.id,
    ownerUserId: owner.id,
    ownerEmail,
  };
}

export async function setupIsolationFixture(): Promise<IsolationFixture> {
  const suffix = randomUUID().replace(/\D/g, '').slice(0, 8).padEnd(8, '0');

  const a = await createTenant('a', suffix);
  const b = await createTenant('b', suffix);

  return {
    prisma,
    a,
    b,

    expectOnlyTenant(rows, expected) {
      const other = expected.id === a.id ? b : a;
      const foreign = rows.filter((row) => row.tenantId === other.id);

      if (foreign.length > 0) {
        throw new Error(
          `Vazamento de tenant: ${foreign.length} linha(s) do tenant ${other.slug} ` +
            `apareceram numa consulta escopada em ${expected.slug}.`,
        );
      }
      for (const row of rows) {
        if (row.tenantId !== undefined && row.tenantId !== expected.id) {
          throw new Error(
            `Linha com tenantId inesperado (${row.tenantId}) numa consulta de ${expected.slug}.`,
          );
        }
      }
    },

    async teardown() {
      await prisma.tenant.deleteMany({ where: { id: { in: [a.id, b.id] } } });
      await prisma.client.deleteMany({ where: { id: { in: [a.clientId, b.clientId] } } });
      // O `User` é global: cai por último, e leva junto sessões e memberships
      // por cascade.
      await prisma.user.deleteMany({ where: { id: { in: [a.ownerUserId, b.ownerUserId] } } });
    },
  };
}

export async function disconnectIsolationFixture(): Promise<void> {
  await prisma.$disconnect();
}

/** Açúcar para escrever casos novos nas próximas fases. */
export type TenantScopedWhere = Prisma.AppointmentWhereInput & { tenantId: string };
