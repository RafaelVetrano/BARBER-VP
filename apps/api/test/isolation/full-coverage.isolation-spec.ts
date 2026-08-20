import { Test, type TestingModule } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { Test as SuperTest } from 'supertest';
import { AppModule } from '../../src/app.module';
import { CONFIG, type AppConfig } from '../../src/config/configuration';
import {
  disconnectIsolationFixture,
  setupIsolationFixture,
  FIXTURE_PASSWORD,
  type IsolationFixture,
} from './tenant-fixture';

/**
 * GATE DE ACEITE DA FASE 09 — varredura de isolamento por RECURSO.
 *
 * As suítes das fases 03–07 cobrem os fluxos que cada fase criou. Esta cobre a
 * MATRIZ: para cada recurso de negócio das fases 01–08, uma leitura e uma
 * escrita cruzadas, feitas com o token do tenant errado. A resposta tem de ser
 * 403/404 — nunca 200, nunca 500.
 *
 * O 500 importa tanto quanto o 200: um `Prisma... not found` que escapa vira
 * 500 e revela, pelo código de status, que o id EXISTE em algum lugar. Por
 * isso os asserts checam a faixa, e não só "não é 200".
 *
 * Os dois tenants do fixture estão no plano Avançado, então nenhum 403 aqui é
 * de feature gate — é de isolamento. Os gates de plano são cobertos à parte,
 * em `dashboard-ii.isolation-spec.ts`.
 */
describe('GATE — isolamento por recurso de negócio (fase 09)', () => {
  let fixture: IsolationFixture;
  let app: INestApplication;
  let prefix: string;
  let tokenA: string;

  const api = () => request(app.getHttpServer());
  const url = (path: string) => `/${prefix}${path}`;

  /** Requisições com o token de A — usadas para pedir recursos de B. */
  const asA = {
    get: (path: string) => api().get(url(path)).set('Authorization', `Bearer ${tokenA}`),
    post: (path: string) => api().post(url(path)).set('Authorization', `Bearer ${tokenA}`),
    patch: (path: string) => api().patch(url(path)).set('Authorization', `Bearer ${tokenA}`),
    put: (path: string) => api().put(url(path)).set('Authorization', `Bearer ${tokenA}`),
    delete: (path: string) => api().delete(url(path)).set('Authorization', `Bearer ${tokenA}`),
  };

  const login = async (email: string): Promise<string> => {
    const response = await api()
      .post(url('/auth/login'))
      .send({ email, password: FIXTURE_PASSWORD })
      .expect(200);
    return response.body.accessToken as string;
  };

  /**
   * O assert central da suíte: recusa limpa, sem vazar e sem estourar.
   *
   * 400 entra na faixa aceita porque alguns endpoints validam a pertinência do
   * id como regra de negócio ("este barbeiro não é seu") antes de chegar ao
   * `findFirst` escopado — a recusa é igualmente efetiva, e exigir 404 ali
   * seria testar a implementação, não a propriedade.
   */
  const expectDenied = async (call: SuperTest, label: string): Promise<void> => {
    const response = await call;

    if (![400, 403, 404].includes(response.status)) {
      throw new Error(
        `VAZAMENTO: ${label} com o token do outro tenant respondeu ${response.status}. ` +
          'Esperado 403/404 (recusa limpa) — 200 vaza dado, 500 confirma que o id existe.',
      );
    }
  };

  /** Afirma que nenhum item de uma listagem carrega id de B. */
  const expectNoForeignId = (body: unknown, foreignId: string, label: string): void => {
    if (JSON.stringify(body ?? {}).includes(foreignId)) {
      throw new Error(`VAZAMENTO: ${label} escopada no tenant A devolveu o id ${foreignId}, de B.`);
    }
  };

  beforeAll(async () => {
    fixture = await setupIsolationFixture();

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    prefix = app.get<AppConfig>(CONFIG).prefix;
    app.setGlobalPrefix(prefix);
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    tokenA = await login(fixture.a.ownerEmail);
  });

  afterAll(async () => {
    await fixture.teardown();
    await app.close();
    await disconnectIsolationFixture();
  });

  // ── Catálogo ───────────────────────────────────────────────────────────

  describe('Product', () => {
    it('a listagem de A não traz o produto de B', async () => {
      const response = await asA.get('/products?perPage=100').expect(200);
      expectNoForeignId(response.body, fixture.b.productId, 'lista de produtos');
    });

    it('não edita o produto de B', async () => {
      await expectDenied(
        asA.patch(`/products/${fixture.b.productId}`).send({ name: 'Invadido' }),
        'PATCH /products/:id',
      );
    });

    it('não desativa o produto de B', async () => {
      await expectDenied(
        asA.patch(`/products/${fixture.b.productId}/deactivate`),
        'PATCH /products/:id/deactivate',
      );
    });

    it('o produto de B continua intacto depois das tentativas', async () => {
      const product = await fixture.prisma.product.findUniqueOrThrow({
        where: { id: fixture.b.productId },
      });
      expect(product.name).toBe('Produto B');
      expect(product.active).toBe(true);
    });
  });

  describe('Service', () => {
    it('não edita o serviço de B', async () => {
      await expectDenied(
        asA.patch(`/services/${fixture.b.serviceId}`).send({ name: 'Invadido' }),
        'PATCH /services/:id',
      );
    });

    it('o serviço de B continua com o nome original', async () => {
      const service = await fixture.prisma.service.findUniqueOrThrow({
        where: { id: fixture.b.serviceId },
      });
      expect(service.name).toBe('Serviço B');
    });
  });

  // ── Comanda / POS ──────────────────────────────────────────────────────

  describe('Order / Comanda', () => {
    it('não lê a comanda de B', async () => {
      await expectDenied(asA.get(`/orders/${fixture.b.orderId}`), 'GET /orders/:id');
    });

    it('não acrescenta item na comanda de B', async () => {
      await expectDenied(
        asA
          .post(`/orders/${fixture.b.orderId}/items`)
          .send({ kind: 'SERVICE', serviceId: fixture.a.serviceId, quantity: 1 }),
        'POST /orders/:id/items',
      );
    });

    it('não aplica desconto na comanda de B', async () => {
      await expectDenied(
        asA.patch(`/orders/${fixture.b.orderId}/discount`).send({ type: 'FIXED', value: 500 }),
        'PATCH /orders/:id/discount',
      );
    });

    it('não fecha a comanda de B', async () => {
      await expectDenied(
        asA
          .post(`/orders/${fixture.b.orderId}/close`)
          .send({ payments: [{ method: 'CASH', amountCents: 3_000 }] }),
        'POST /orders/:id/close',
      );
    });

    it('não reabre a comanda de B', async () => {
      await expectDenied(
        asA.post(`/orders/${fixture.b.orderId}/reopen`),
        'POST /orders/:id/reopen',
      );
    });

    it('a comanda de B segue aberta e sem itens', async () => {
      const order = await fixture.prisma.order.findUniqueOrThrow({
        where: { id: fixture.b.orderId },
        include: { items: true, payments: true },
      });
      expect(order.status).toBe('OPEN');
      expect(order.items).toHaveLength(0);
      expect(order.payments).toHaveLength(0);
    });
  });

  // ── Financeiro ─────────────────────────────────────────────────────────

  describe('AccountPayable / AccountReceivable / BankAccount', () => {
    it('a lista de contas a pagar de A não traz a de B', async () => {
      const response = await asA.get('/finance/payables?perPage=100').expect(200);
      expectNoForeignId(response.body, fixture.b.payableId, 'lista de contas a pagar');
    });

    it('a lista de contas a receber de A não traz a de B', async () => {
      const response = await asA.get('/finance/receivables?perPage=100').expect(200);
      expectNoForeignId(response.body, fixture.b.receivableId, 'lista de contas a receber');
    });

    it('a lista de contas bancárias de A não traz a de B', async () => {
      const response = await asA.get('/finance/bank-accounts').expect(200);
      expectNoForeignId(response.body, fixture.b.bankAccountId, 'lista de contas bancárias');
    });

    it('não dá baixa na conta a pagar de B', async () => {
      await expectDenied(
        asA.patch(`/finance/payables/${fixture.b.payableId}/pay`).send({}),
        'PATCH /finance/payables/:id/pay',
      );
    });

    it('não dá baixa na conta a receber de B', async () => {
      await expectDenied(
        asA.patch(`/finance/receivables/${fixture.b.receivableId}/receive`).send({}),
        'PATCH /finance/receivables/:id/receive',
      );
    });

    it('não edita a conta bancária de B', async () => {
      await expectDenied(
        asA.patch(`/finance/bank-accounts/${fixture.b.bankAccountId}`).send({ name: 'Invadida' }),
        'PATCH /finance/bank-accounts/:id',
      );
    });

    it('as contas de B seguem PENDING e a conta bancária intacta', async () => {
      const payable = await fixture.prisma.accountPayable.findUniqueOrThrow({
        where: { id: fixture.b.payableId },
      });
      const receivable = await fixture.prisma.accountReceivable.findUniqueOrThrow({
        where: { id: fixture.b.receivableId },
      });
      const bankAccount = await fixture.prisma.bankAccount.findUniqueOrThrow({
        where: { id: fixture.b.bankAccountId },
      });

      expect(payable.status).toBe('PENDING');
      expect(payable.paidAt).toBeNull();
      expect(receivable.status).toBe('PENDING');
      expect(receivable.receivedAt).toBeNull();
      expect(bankAccount.name).toBe('Conta B');
    });

    it('o fluxo de caixa de A não soma valores de B', async () => {
      const response = await asA.get('/finance/cash-flow').expect(200);
      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toContain(fixture.b.payableId);
      expect(serialized).not.toContain(fixture.b.receivableId);
    });
  });

  // ── Comissões e vales ──────────────────────────────────────────────────

  describe('CommissionRule / Vale / CommissionEntry', () => {
    it('a lista de regras de A não traz a regra de B', async () => {
      const response = await asA.get('/commissions/rules').expect(200);
      expectNoForeignId(response.body, fixture.b.commissionRuleId, 'lista de regras');
    });

    it('não edita a regra de comissão de B', async () => {
      await expectDenied(
        asA
          .patch(`/commissions/rules/${fixture.b.commissionRuleId}`)
          .send({ name: 'Invadida', type: 'FIXED', percentBps: 9_000 }),
        'PATCH /commissions/rules/:id',
      );
    });

    it('a lista de vales de A não traz o vale de B', async () => {
      const response = await asA.get('/commissions/vales').expect(200);
      expectNoForeignId(response.body, fixture.b.valeId, 'lista de vales');
    });

    it('não lança vale para um barbeiro de B', async () => {
      await expectDenied(
        asA.post('/commissions/vales').send({
          barberId: fixture.b.barberId,
          amountCents: 10_000,
          referenceMonth: new Date().toISOString().slice(0, 7),
        }),
        'POST /commissions/vales com barbeiro de B',
      );
    });

    it('o extrato de comissões de A não menciona o barbeiro de B', async () => {
      const month = new Date().toISOString().slice(0, 7);
      const response = await asA.get(`/commissions/period?month=${month}`).expect(200);
      expectNoForeignId(response.body, fixture.b.barberId, 'extrato de comissões');
    });

    it('a regra de B continua com o nome original', async () => {
      const rule = await fixture.prisma.commissionRule.findUniqueOrThrow({
        where: { id: fixture.b.commissionRuleId },
      });
      expect(rule.name).toBe('Regra B');
      expect(rule.percentBps).toBe(4_000);
    });
  });

  // ── Fidelidade e assinaturas ───────────────────────────────────────────

  describe('LoyaltyProgram / ClientPlan / LoyaltyRaffle', () => {
    it('o programa de fidelidade lido por A é o de A', async () => {
      const response = await asA.get('/loyalty/program').expect(200);
      const program = await fixture.prisma.loyaltyProgram.findUniqueOrThrow({
        where: { tenantId: fixture.a.id },
      });
      expect(response.body.id ?? program.id).toBe(program.id);
    });

    it('a lista de planos de A não traz o plano de B', async () => {
      const response = await asA.get('/loyalty/plans').expect(200);
      expectNoForeignId(response.body, fixture.b.clientPlanId, 'lista de planos do cliente');
    });

    it('não edita o plano de assinatura de B', async () => {
      await expectDenied(
        asA.patch(`/loyalty/plans/${fixture.b.clientPlanId}`).send({ name: 'Invadido' }),
        'PATCH /loyalty/plans/:id',
      );
    });

    it('não arquiva o plano de assinatura de B', async () => {
      await expectDenied(
        asA.patch(`/loyalty/plans/${fixture.b.clientPlanId}/archive`),
        'PATCH /loyalty/plans/:id/archive',
      );
    });

    it('a lista de sorteios de A não traz o sorteio de B', async () => {
      const response = await asA.get('/loyalty/raffles').expect(200);
      expectNoForeignId(response.body, fixture.b.raffleId, 'lista de sorteios');
    });

    it('não sorteia o sorteio de B', async () => {
      await expectDenied(
        asA.post(`/loyalty/raffles/${fixture.b.raffleId}/draw`),
        'POST /loyalty/raffles/:id/draw',
      );
    });

    it('a lista de clientes com pontos de A não traz o cliente de B', async () => {
      const response = await asA.get('/loyalty/clients?perPage=100').expect(200);
      expectNoForeignId(response.body, fixture.b.clientId, 'lista de fidelidade');
    });

    it('o plano e o sorteio de B seguem intactos', async () => {
      const plan = await fixture.prisma.clientPlan.findUniqueOrThrow({
        where: { id: fixture.b.clientPlanId },
      });
      const raffle = await fixture.prisma.loyaltyRaffle.findUniqueOrThrow({
        where: { id: fixture.b.raffleId },
      });
      expect(plan.name).toBe('Plano B');
      expect(plan.active).toBe(true);
      expect(raffle.status).toBe('ACTIVE');
      expect(raffle.winnerClientId).toBeNull();
    });
  });

  // ── Configurações, unidades e página pública ───────────────────────────

  describe('TenantSettings / Unit / MyPage', () => {
    it('as configurações lidas por A são as de A', async () => {
      const response = await asA.get('/settings/barbershop').expect(200);
      expect(JSON.stringify(response.body)).not.toContain(fixture.b.id);
    });

    it('a lista de unidades de A não traz a unidade de B', async () => {
      const response = await asA.get('/settings/units').expect(200);
      expectNoForeignId(response.body, fixture.b.unitId, 'lista de unidades');
    });

    it('não edita a unidade de B', async () => {
      await expectDenied(
        asA.patch(`/settings/units/${fixture.b.unitId}`).send({ name: 'Invadida' }),
        'PATCH /settings/units/:id',
      );
    });

    it('a Minha Página lida por A é a de A', async () => {
      const response = await asA.get('/my-page').expect(200);
      expect(JSON.stringify(response.body)).not.toContain(fixture.b.slug);
    });

    it('não toma o slug já usado por B', async () => {
      const response = await asA.patch('/my-page').send({ slug: fixture.b.slug });
      expect([400, 409]).toContain(response.status);

      const tenantB = await fixture.prisma.tenant.findUniqueOrThrow({
        where: { id: fixture.b.id },
      });
      expect(tenantB.slug).toBe(fixture.b.slug);
    });

    it('a unidade de B continua com o nome original', async () => {
      const unit = await fixture.prisma.unit.findUniqueOrThrow({
        where: { id: fixture.b.unitId },
      });
      expect(unit.name).toBe('Unidade B');
    });
  });

  // ── Automação de WhatsApp ──────────────────────────────────────────────

  describe('WhatsappAutomationConfig', () => {
    it('a configuração lida por A não traz o template de B', async () => {
      const response = await asA.get('/whatsapp-config').expect(200);
      expect(JSON.stringify(response.body)).not.toContain('Lembrete B');
    });

    it('escrever o template em A não altera o de B', async () => {
      await asA
        .patch('/whatsapp-config/REMINDER')
        .send({ enabled: true, template: 'Template de A para {nome}', offsetMinutes: 120 })
        .expect(200);

      const configB = await fixture.prisma.whatsappAutomationConfig.findUniqueOrThrow({
        where: { id: fixture.b.whatsappConfigId },
      });
      expect(configB.template).toBe('Lembrete B para {nome}');
      expect(configB.offsetMinutes).toBe(1_440);
    });
  });

  // ── Clientes ───────────────────────────────────────────────────────────

  describe('Client / ClientProfile', () => {
    it('não edita o perfil do cliente de B', async () => {
      await expectDenied(
        asA.patch(`/clients/${fixture.b.clientId}`).send({ notes: 'Invadido' }),
        'PATCH /clients/:id',
      );
    });

    it('não bloqueia o cliente de B', async () => {
      await expectDenied(
        asA.patch(`/clients/${fixture.b.clientId}/block`),
        'PATCH /clients/:id/block',
      );
    });

    it('o perfil do cliente em B segue desbloqueado e sem anotação', async () => {
      const profile = await fixture.prisma.clientProfile.findUniqueOrThrow({
        where: { id: fixture.b.clientProfileId },
      });
      expect(profile.blocked).toBe(false);
      expect(profile.notes ?? '').not.toContain('Invadido');
    });
  });

  // ── Relatórios ─────────────────────────────────────────────────────────

  describe('Reports', () => {
    it('o resumo de A não menciona nenhum id de B', async () => {
      const response = await asA.get('/reports/summary').expect(200);
      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toContain(fixture.b.barberId);
      expect(serialized).not.toContain(fixture.b.serviceId);
    });

    it('o relatório avançado de A não menciona nenhum id de B', async () => {
      const response = await asA.get('/reports/advanced').expect(200);
      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toContain(fixture.b.barberId);
      expect(serialized).not.toContain(fixture.b.serviceId);
      expect(serialized).not.toContain(fixture.b.productId);
    });
  });

  // ── Assistente IA ──────────────────────────────────────────────────────

  describe('Assistant', () => {
    it('a conversa de A nasce vazia e não enxerga o tenant B', async () => {
      const response = await asA.get('/assistant/messages').expect(200);
      expect(JSON.stringify(response.body)).not.toContain(fixture.b.id);
    });
  });

  // ── Agenda ─────────────────────────────────────────────────────────────

  describe('Appointment', () => {
    it('a agenda de A não traz o agendamento de B', async () => {
      const date = new Date().toISOString().slice(0, 10);
      const response = await asA.get(`/staff-agenda?date=${date}&view=DAY`).expect(200);
      expectNoForeignId(response.body, fixture.b.appointmentId, 'agenda do staff');
    });

    it('não cancela o agendamento de B', async () => {
      await expectDenied(
        asA.patch(`/staff-agenda/${fixture.b.appointmentId}/cancel`).send({}),
        'PATCH /staff-agenda/:id/cancel',
      );
    });

    it('o agendamento de B segue agendado', async () => {
      const appointment = await fixture.prisma.appointment.findUniqueOrThrow({
        where: { id: fixture.b.appointmentId },
      });
      expect(appointment.status).toBe('SCHEDULED');
    });
  });

  // ── Painel da plataforma ───────────────────────────────────────────────

  describe('Super admin', () => {
    it('OWNER de barbearia não abre o painel de tenants', async () => {
      await expectDenied(asA.get('/admin/tenants'), 'GET /admin/tenants');
    });

    it('OWNER de barbearia não abre o painel de filas', async () => {
      await expectDenied(asA.get('/admin/queues'), 'GET /admin/queues');
    });

    it('OWNER de barbearia não lê o outbox da plataforma', async () => {
      await expectDenied(asA.get('/admin/outbox'), 'GET /admin/outbox');
    });
  });
});
