import { randomUUID } from 'node:crypto';
import { hash } from '@node-rs/argon2';
import {
  AccountStatus,
  CashMovementType,
  CashRegisterStatus,
  CommissionRuleType,
  MembershipRole,
  PaymentMethod,
  PrismaClient,
  SaasInvoiceStatus,
  SubscriptionStatus,
  OutboxStatus,
  WhatsappEvent,
  type Prisma,
} from '@prisma/client';
import { PlanTier, featuresForTier } from '@barbervp/types';

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

  // Fase 09: um registro de CADA recurso de negócio, para que a suíte possa
  // tentar ler e escrever cada um deles com o token do outro tenant. Sem isto
  // não há o que pedir cruzado, e o gate não mede nada.
  productId: string;
  bankAccountId: string;
  /** Caixa ABERTO — o alvo das movimentações de caixa da fase 18. */
  cashRegisterId: string;
  payableId: string;
  receivableId: string;
  commissionRuleId: string;
  valeId: string;
  clientPlanId: string;
  clientSubscriptionId: string;
  unitId: string;
  whatsappConfigId: string;
  /** Linha de `NotificationOutbox` — o histórico da aba WhatsApp. */
  outboxId: string;
  /** Convite PENDENTE — o alvo dos casos da aba Equipe (fase 24). */
  staffInviteId: string;
  // Fase 25 (Minha Página): a tabela "Avaliações recebidas" publica/despublica
  // por id, e a galeria remove por id — sem uma linha de B, não há o que pedir
  // cruzado nessas duas rotas.
  reviewId: string;
  photoId: string;
  /**
   * Fatura do SaaS — o alvo por id do recibo em PDF da aba Plano e cobrança
   * (fase 26). Sem uma linha de B não há o que pedir cruzado nessa rota.
   */
  saasInvoiceId: string;
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

async function createTenant(
  label: string,
  suffix: string,
  planId: string,
): Promise<IsolatedTenant> {
  const slug = `iso-${label}-${suffix}`;

  const tenant = await prisma.tenant.create({
    data: {
      slug,
      name: `Tenant de isolamento ${label.toUpperCase()}`,
      // Plano Avançado nos DOIS: sem ele, metade dos endpoints responderia 403
      // por feature gate, e um 403 de plano seria confundido com um 403 de
      // isolamento — o teste passaria sem ter provado nada.
      planId,
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

  const product = await prisma.product.create({
    data: {
      tenantId: tenant.id,
      name: `Produto ${label.toUpperCase()}`,
      priceCents: 2_500,
      stock: 10,
      estoqueMin: 2,
    },
    select: { id: true },
  });

  const bankAccount = await prisma.bankAccount.create({
    data: { tenantId: tenant.id, name: `Conta ${label.toUpperCase()}` },
    select: { id: true },
  });

  const payable = await prisma.accountPayable.create({
    data: {
      tenantId: tenant.id,
      description: `A pagar ${label.toUpperCase()}`,
      category: 'Fornecedores',
      amountCents: 15_000,
      dueDate: new Date(),
      status: AccountStatus.PENDING,
    },
    select: { id: true },
  });

  const receivable = await prisma.accountReceivable.create({
    data: {
      tenantId: tenant.id,
      description: `A receber ${label.toUpperCase()}`,
      category: 'Serviços',
      amountCents: 9_000,
      dueDate: new Date(),
      status: AccountStatus.PENDING,
    },
    select: { id: true },
  });

  const commissionRule = await prisma.commissionRule.create({
    data: {
      tenantId: tenant.id,
      name: `Regra ${label.toUpperCase()}`,
      type: CommissionRuleType.FIXED,
      percentBps: 4_000,
    },
    select: { id: true },
  });

  const vale = await prisma.vale.create({
    data: {
      tenantId: tenant.id,
      barberId: barber.id,
      amountCents: 5_000,
      date: new Date(),
      referenceMonth: new Date(),
    },
    select: { id: true },
  });

  await prisma.loyaltyProgram.create({ data: { tenantId: tenant.id, active: true } });

  const clientPlan = await prisma.clientPlan.create({
    data: {
      tenantId: tenant.id,
      name: `Plano ${label.toUpperCase()}`,
      priceCents: 12_000,
    },
    select: { id: true },
  });

  // Assinante de verdade no plano acima — é o alvo das rotas de pausar/
  // cancelar da aba Fidelidade, que precisam de caso de isolamento próprio.
  const periodStart = new Date(Date.now() - 86_400_000);
  const clientSubscription = await prisma.clientSubscription.create({
    data: {
      tenantId: tenant.id,
      clientId: client.id,
      planId: clientPlan.id,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: periodStart,
      currentPeriodEnd: new Date(Date.now() + 29 * 86_400_000),
      nextChargeAt: new Date(Date.now() + 29 * 86_400_000),
      usages: {
        create: {
          tenantId: tenant.id,
          serviceId: service.id,
          periodStart,
          periodEnd: new Date(Date.now() + 29 * 86_400_000),
          quota: 4,
          used: 1,
        },
      },
    },
    select: { id: true },
  });

  // Caixa aberto com a movimentação de abertura, como o serviço cria.
  const cashRegister = await prisma.cashRegister.create({
    data: {
      tenantId: tenant.id,
      openedByUserId: owner.id,
      status: CashRegisterStatus.OPEN,
      openingCents: 10_000,
      movements: {
        create: {
          tenantId: tenant.id,
          type: CashMovementType.OPENING,
          amountCents: 10_000,
          description: 'Abertura do caixa',
          method: PaymentMethod.CASH,
          category: 'Abertura',
        },
      },
    },
    select: { id: true },
  });

  const unit = await prisma.unit.create({
    data: { tenantId: tenant.id, name: `Unidade ${label.toUpperCase()}`, isDefault: true },
    select: { id: true },
  });

  const whatsappConfig = await prisma.whatsappAutomationConfig.create({
    data: {
      tenantId: tenant.id,
      event: WhatsappEvent.REMINDER,
      enabled: true,
      template: `Lembrete ${label.toUpperCase()} para {nome}`,
      offsetMinutes: 1_440,
    },
    select: { id: true },
  });

  // Uma mensagem no outbox por tenant: é o que o "Histórico de envios" da aba
  // WhatsApp lê, e o caso de isolamento precisa de uma linha de B para provar
  // que ela não vaza na leitura de A.
  const outbox = await prisma.notificationOutbox.create({
    data: {
      tenantId: tenant.id,
      recipient: `9999${suffix}${label === 'a' ? '1' : '2'}`,
      templateKey: 'whatsapp.reactivation',
      body: `Reativação ${label.toUpperCase()} para {nome}`,
      status: OutboxStatus.SENT,
      attempts: 1,
      sentAt: new Date(),
    },
    select: { id: true },
  });

  // Convite pendente por tenant: sem uma linha em B, não há o que pedir
  // cruzado nas rotas de convite da aba Equipe.
  const staffInvite = await prisma.staffInvite.create({
    data: {
      tenantId: tenant.id,
      email: `iso-invite-${label}-${suffix}@barbervp.test`,
      name: `Convidado ${label.toUpperCase()}`,
      serviceIds: [service.id],
      workDays: [1, 2, 3],
      tokenHash: `iso-token-${label}-${suffix}`,
      invitedByUserId: owner.id,
      expiresAt: new Date(Date.now() + 7 * 86_400_000),
    },
    select: { id: true },
  });

  // Avaliação PUBLICADA e foto de galeria por tenant — os dois alvos por id da
  // aba Minha Página (fase 25).
  const review = await prisma.review.create({
    data: {
      tenantId: tenant.id,
      barberId: barber.id,
      authorName: `Cliente ${label.toUpperCase()}`,
      rating: 5,
      comment: `Avaliação do tenant ${label.toUpperCase()}`,
      published: true,
    },
    select: { id: true },
  });

  const photo = await prisma.tenantPhoto.create({
    data: {
      tenantId: tenant.id,
      url: `https://exemplo.test/iso-${label}-${suffix}.jpg`,
      sortOrder: 0,
    },
    select: { id: true },
  });

  const subscription = await prisma.tenantSubscription.create({
    data: {
      tenantId: tenant.id,
      planId,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000),
    },
    select: { id: true },
  });

  const saasInvoice = await prisma.saasInvoice.create({
    data: {
      tenantId: tenant.id,
      subscriptionId: subscription.id,
      amountCents: 13_900,
      status: SaasInvoiceStatus.PAID,
      paidAt: new Date(),
    },
    select: { id: true },
  });

  return {
    id: tenant.id,
    slug: tenant.slug,
    outboxId: outbox.id,
    staffInviteId: staffInvite.id,
    reviewId: review.id,
    photoId: photo.id,
    saasInvoiceId: saasInvoice.id,
    barberId: barber.id,
    serviceId: service.id,
    clientId: client.id,
    clientProfileId: client.profiles[0]!.id,
    appointmentId: appointment.id,
    orderId: order.id,
    ownerUserId: owner.id,
    ownerEmail,
    productId: product.id,
    bankAccountId: bankAccount.id,
    cashRegisterId: cashRegister.id,
    payableId: payable.id,
    receivableId: receivable.id,
    commissionRuleId: commissionRule.id,
    valeId: vale.id,
    clientPlanId: clientPlan.id,
    clientSubscriptionId: clientSubscription.id,
    unitId: unit.id,
    whatsappConfigId: whatsappConfig.id,
  };
}

export async function setupIsolationFixture(): Promise<IsolationFixture> {
  const suffix = randomUUID().replace(/\D/g, '').slice(0, 8).padEnd(8, '0');

  const plan = await prisma.saasPlan.create({
    data: {
      code: `iso-avancado-${suffix}`,
      name: 'Avançado (isolamento)',
      priceCents: 13_900,
      tier: PlanTier.AVANCADO,
      maxBarbers: null,
      features: featuresForTier(PlanTier.AVANCADO) as object,
    },
    select: { id: true },
  });

  const a = await createTenant('a', suffix, plan.id);
  const b = await createTenant('b', suffix, plan.id);

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
      // O plano é global e só existe para estes dois tenants; sai depois deles
      // porque `Tenant.planId` o referencia.
      await prisma.saasPlan.deleteMany({ where: { id: plan.id } });
    },
  };
}

export async function disconnectIsolationFixture(): Promise<void> {
  await prisma.$disconnect();
}

/** Açúcar para escrever casos novos nas próximas fases. */
export type TenantScopedWhere = Prisma.AppointmentWhereInput & { tenantId: string };
