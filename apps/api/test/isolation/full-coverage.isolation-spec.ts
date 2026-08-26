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

    // Agente 23 — as duas rotas novas do kebab de produto.
    it('não repõe o estoque do produto de B', async () => {
      await expectDenied(
        asA.post(`/products/${fixture.b.productId}/restock`).send({ quantity: 50 }),
        'POST /products/:id/restock',
      );
    });

    it('não exclui o produto de B', async () => {
      await expectDenied(
        asA.delete(`/products/${fixture.b.productId}`),
        'DELETE /products/:id',
      );
    });

    it('o produto de B continua intacto depois das tentativas', async () => {
      const product = await fixture.prisma.product.findUniqueOrThrow({
        where: { id: fixture.b.productId },
      });
      expect(product.name).toBe('Produto B');
      expect(product.active).toBe(true);
      expect(product.deletedAt).toBeNull();
    });
  });

  describe('Service', () => {
    it('não edita o serviço de B', async () => {
      await expectDenied(
        asA.patch(`/services/${fixture.b.serviceId}`).send({ name: 'Invadido' }),
        'PATCH /services/:id',
      );
    });

    // Agente 23.
    it('não exclui o serviço de B', async () => {
      await expectDenied(asA.delete(`/services/${fixture.b.serviceId}`), 'DELETE /services/:id');
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

    it('não troca o cliente da comanda de B', async () => {
      await expectDenied(
        asA.patch(`/orders/${fixture.b.orderId}`).send({ clientId: fixture.a.clientId }),
        'PATCH /orders/:id',
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

  // ── Caixa (fase 18) ────────────────────────────────────────────────────

  describe('CashRegister / CashMovement', () => {
    it('o caixa que A lê é o DELE, não o de B', async () => {
      const response = await asA.get('/finance/cash-register').expect(200);
      expect(response.body.register?.id).toBe(fixture.a.cashRegisterId);
      expectNoForeignId(response.body, fixture.b.cashRegisterId, 'status do caixa');
    });

    /**
     * O lançamento não recebe id nenhum: ele acha o caixa aberto pelo tenant do
     * token. É justamente por isso que precisa de caso — um `findFirst` sem
     * `tenantId` acertaria o caixa de outra barbearia sem ninguém notar.
     */
    it('a movimentação lançada por A não entra no caixa de B', async () => {
      await asA
        .post('/finance/cash-register/movements')
        .send({
          direction: 'OUT',
          amountCents: 5_000,
          description: 'Sangria do teste de isolamento',
          category: 'Sangria',
          method: 'CASH',
        })
        .expect(201);

      const movementsOfB = await fixture.prisma.cashMovement.findMany({
        where: { cashRegisterId: fixture.b.cashRegisterId },
      });
      expect(movementsOfB).toHaveLength(1);
      expect(movementsOfB[0]!.type).toBe('OPENING');

      const movementsOfA = await fixture.prisma.cashMovement.findMany({
        where: { cashRegisterId: fixture.a.cashRegisterId, type: 'WITHDRAWAL' },
      });
      expect(movementsOfA).toHaveLength(1);
      expect(movementsOfA[0]!.amountCents).toBe(-5_000);
    });

    it('o fechamento de A não fecha o caixa de B', async () => {
      await asA.post('/finance/cash-register/close').send({ countedCents: 5_000 }).expect(201);

      const registerOfB = await fixture.prisma.cashRegister.findUniqueOrThrow({
        where: { id: fixture.b.cashRegisterId },
      });
      expect(registerOfB.status).toBe('OPEN');
      expect(registerOfB.closedAt).toBeNull();
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

    it('o extrato semanal de A não menciona o barbeiro de B', async () => {
      const anchor = new Date().toISOString().slice(0, 10);
      const response = await asA.get(`/commissions/period?type=WEEKLY&anchor=${anchor}`).expect(200);
      expectNoForeignId(response.body, fixture.b.barberId, 'extrato semanal de comissões');
    });

    /**
     * O relatório em PDF é a única rota da aba que devolve um binário — sem
     * este caso, um `barberId` de outro tenant vazaria o extrato inteiro num
     * arquivo que ninguém inspeciona.
     */
    it('não emite o relatório em PDF de um barbeiro de B', async () => {
      const month = new Date().toISOString().slice(0, 7);
      await expectDenied(
        asA.get(`/commissions/period/report.pdf?month=${month}&barberId=${fixture.b.barberId}`),
        'GET /commissions/period/report.pdf com barbeiro de B',
      );
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

  describe('LoyaltyProgram / ClientPlan / ClientSubscription', () => {
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

    it('não reativa o plano de assinatura de B', async () => {
      await expectDenied(
        asA.patch(`/loyalty/plans/${fixture.b.clientPlanId}/reactivate`),
        'PATCH /loyalty/plans/:id/reactivate',
      );
    });

    it('não exclui o plano de assinatura de B', async () => {
      await expectDenied(
        asA.delete(`/loyalty/plans/${fixture.b.clientPlanId}`),
        'DELETE /loyalty/plans/:id',
      );
    });

    it('a lista de assinantes de A não traz a assinatura de B', async () => {
      const response = await asA.get('/loyalty/subscribers').expect(200);
      expectNoForeignId(response.body, fixture.b.clientSubscriptionId, 'lista de assinantes');
      expectNoForeignId(response.body, fixture.b.clientId, 'lista de assinantes');
    });

    it('não pausa a assinatura de B', async () => {
      await expectDenied(
        asA.patch(`/loyalty/subscribers/${fixture.b.clientSubscriptionId}/pause`),
        'PATCH /loyalty/subscribers/:id/pause',
      );
    });

    it('não retoma a assinatura de B', async () => {
      await expectDenied(
        asA.patch(`/loyalty/subscribers/${fixture.b.clientSubscriptionId}/resume`),
        'PATCH /loyalty/subscribers/:id/resume',
      );
    });

    it('não cancela a assinatura de B', async () => {
      await expectDenied(
        asA.patch(`/loyalty/subscribers/${fixture.b.clientSubscriptionId}/cancel`),
        'PATCH /loyalty/subscribers/:id/cancel',
      );
    });

    it('o plano e a assinatura de B seguem intactos', async () => {
      const plan = await fixture.prisma.clientPlan.findUniqueOrThrow({
        where: { id: fixture.b.clientPlanId },
      });
      const subscription = await fixture.prisma.clientSubscription.findUniqueOrThrow({
        where: { id: fixture.b.clientSubscriptionId },
      });
      expect(plan.name).toBe('Plano B');
      expect(plan.active).toBe(true);
      expect(subscription.status).toBe('ACTIVE');
      expect(subscription.canceledAt).toBeNull();
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

    /**
     * Fase 26 — o link "PDF" do histórico de faturas. O recibo carrega o nome
     * e o CNPJ da barbearia: um cuid adivinhado do vizinho não pode devolver
     * 200 com o documento dele.
     */
    it('não baixa o recibo da fatura de B', async () => {
      await expectDenied(
        asA.get(`/settings/plan/invoices/${fixture.b.saasInvoiceId}.pdf`),
        'GET /settings/plan/invoices/:id.pdf',
      );
    });

    it('as faturas listadas para A não trazem a fatura de B', async () => {
      const response = await asA.get('/settings/plan').expect(200);
      expectNoForeignId(response.body, fixture.b.saasInvoiceId, 'histórico de faturas');
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

    // ── Minha Página: preview, avaliações e galeria (fase 25) ────────────

    it('o preview ao vivo de A é a página de A', async () => {
      const response = await asA.get('/my-page/preview').expect(200);
      expect(response.body.id).toBe(fixture.a.id);
      expectNoForeignId(response.body, fixture.b.id, 'preview de Minha Página');
    });

    it('as avaliações recebidas de A não trazem a de B', async () => {
      const response = await asA.get('/my-page/reviews').expect(200);
      expectNoForeignId(response.body, fixture.b.reviewId, 'avaliações recebidas');
    });

    it('não despublica a avaliação de B', async () => {
      await expectDenied(
        asA.patch(`/my-page/reviews/${fixture.b.reviewId}`).send({ published: false }),
        'PATCH /my-page/reviews/:id',
      );

      const review = await fixture.prisma.review.findUniqueOrThrow({
        where: { id: fixture.b.reviewId },
      });
      expect(review.published).toBe(true);
    });

    it('não remove a foto da galeria de B', async () => {
      await expectDenied(
        asA.delete(`/my-page/photos/${fixture.b.photoId}`),
        'DELETE /my-page/photos/:id',
      );

      const photo = await fixture.prisma.tenantPhoto.findUnique({
        where: { id: fixture.b.photoId },
      });
      expect(photo).not.toBeNull();
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
        // 180 = 3h, uma das opções que a API publica em `options`. O valor
        // antigo (120) deixou de ser aceito na fase 22, quando o `<select>`
        // do protótipo virou validação de servidor.
        .send({ enabled: true, template: 'Template de A para {nome}', offsetMinutes: 180 })
        .expect(200);

      const configB = await fixture.prisma.whatsappAutomationConfig.findUniqueOrThrow({
        where: { id: fixture.b.whatsappConfigId },
      });
      expect(configB.template).toBe('Lembrete B para {nome}');
      expect(configB.offsetMinutes).toBe(1_440);
    });

    /**
     * O `upsert` da fase 22 CRIA a linha que não existia. Sem este caso, um
     * `create` sem `tenantId` no corpo passaria despercebido — a linha nova
     * nasceria órfã, ou pior, colidiria com a de outra barbearia.
     */
    it('a linha criada pelo upsert de A nasce no tenant de A', async () => {
      await asA
        .patch('/whatsapp-config/CONFIRMATION')
        .send({ enabled: true, template: 'Confirmação de A para {nome}' })
        .expect(200);

      const criada = await fixture.prisma.whatsappAutomationConfig.findUniqueOrThrow({
        where: { tenantId_event: { tenantId: fixture.a.id, event: 'CONFIRMATION' } },
      });
      expect(criada.tenantId).toBe(fixture.a.id);

      const emB = await fixture.prisma.whatsappAutomationConfig.findUnique({
        where: { tenantId_event: { tenantId: fixture.b.id, event: 'CONFIRMATION' } },
      });
      expect(emB).toBeNull();
    });
  });

  // ── Histórico de envios (NotificationOutbox) ───────────────────────────

  describe('NotificationOutbox', () => {
    it('o histórico de A não traz a mensagem de B', async () => {
      const response = await asA.get('/whatsapp-config/history').expect(200);

      const ids = response.body.items.map((item: { id: string }) => item.id);
      expect(ids).toContain(fixture.a.outboxId);
      expect(ids).not.toContain(fixture.b.outboxId);
      expect(JSON.stringify(response.body)).not.toContain('Reativação B');
    });

    it('a contagem de inativos e o disparo em massa de A não alcançam clientes de B', async () => {
      const summary = await asA.get('/whatsapp-config/reactivation').expect(200);
      expect(summary.body.clientCount).toBeLessThanOrEqual(1);

      const antesEmB = await fixture.prisma.notificationOutbox.count({
        where: { tenantId: fixture.b.id },
      });

      await asA.post('/whatsapp-config/reactivation/send').expect(201);

      const depoisEmB = await fixture.prisma.notificationOutbox.count({
        where: { tenantId: fixture.b.id },
      });
      expect(depoisEmB).toBe(antesEmB);

      const deA = await fixture.prisma.notificationOutbox.findMany({
        where: { tenantId: fixture.a.id, templateKey: 'whatsapp.reactivation' },
        select: { recipient: true },
      });
      // Nenhuma mensagem de A saiu para o telefone do cliente de B.
      const telefoneDeB = await fixture.prisma.client.findUniqueOrThrow({
        where: { id: fixture.b.clientId },
        select: { phone: true },
      });
      expect(deA.map((row) => row.recipient)).not.toContain(telefoneDeB.phone);
    });

    it('a conexão de A conta só o outbox de A', async () => {
      const response = await asA.get('/whatsapp-config/connection').expect(200);
      const emA = await fixture.prisma.notificationOutbox.count({
        where: { tenantId: fixture.a.id, channel: 'WHATSAPP' },
      });
      expect(response.body.messagesSent).toBe(emA);
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

  // ── Equipe (fase 24) ───────────────────────────────────────────────────

  describe('Barber / WorkSchedule / ScheduleException / StaffInvite', () => {
    it('a listagem de A não traz o barbeiro de B', async () => {
      const response = await asA.get('/barbers').expect(200);
      const ids = (response.body as Array<{ id: string }>).map((row) => row.id);
      expect(ids).not.toContain(fixture.b.barberId);
    });

    it('o uso do plano lido por A conta a equipe de A', async () => {
      const response = await asA.get('/barbers/plan-usage').expect(200);
      const barbers = await asA.get('/barbers').expect(200);
      const active = (barbers.body as Array<{ active: boolean }>).filter((row) => row.active).length;
      expect(response.body.activeBarbers).toBe(active);
    });

    it('não edita o barbeiro de B', async () => {
      await expectDenied(
        asA.patch(`/barbers/${fixture.b.barberId}`).send({ name: 'Invadido' }),
        'PATCH /barbers/:id',
      );
    });

    it('não desativa o barbeiro de B', async () => {
      await expectDenied(
        asA.patch(`/barbers/${fixture.b.barberId}`).send({ active: false }),
        'PATCH /barbers/:id (active)',
      );
    });

    it('não lê nem reescreve a escala do barbeiro de B', async () => {
      await expectDenied(
        asA.get(`/barbers/${fixture.b.barberId}/work-schedule`),
        'GET /barbers/:id/work-schedule',
      );
      await expectDenied(
        asA.put(`/barbers/${fixture.b.barberId}/work-schedule`).send({
          days: [{ weekday: 1, startTime: 60, endTime: 120, isDayOff: false }],
        }),
        'PUT /barbers/:id/work-schedule',
      );
    });

    it('não marca férias para o barbeiro de B', async () => {
      await expectDenied(
        asA.post('/barbers/exceptions').send({
          barberId: fixture.b.barberId,
          startDate: '2030-01-01',
          endDate: '2030-01-05',
          type: 'VACATION',
        }),
        'POST /barbers/exceptions',
      );
    });

    it('a lista de convites de A não traz o convite de B', async () => {
      const response = await asA.get('/team/invites').expect(200);
      const ids = (response.body as Array<{ id: string }>).map((row) => row.id);
      expect(ids).not.toContain(fixture.b.staffInviteId);
    });

    it('não reenvia, não revoga e não gera link do convite de B', async () => {
      await expectDenied(
        asA.post(`/team/invites/${fixture.b.staffInviteId}/resend`),
        'POST /team/invites/:id/resend',
      );
      await expectDenied(
        asA.post(`/team/invites/${fixture.b.staffInviteId}/revoke`),
        'POST /team/invites/:id/revoke',
      );
      // O link é o caso mais sensível: um 200 aqui entregaria a A um token de
      // cadastro válido dentro do tenant B.
      await expectDenied(
        asA.post(`/team/invites/${fixture.b.staffInviteId}/link`),
        'POST /team/invites/:id/link',
      );
    });

    it('o barbeiro e o convite de B seguem intactos depois das tentativas', async () => {
      const [barber, invite] = await Promise.all([
        fixture.prisma.barber.findUniqueOrThrow({ where: { id: fixture.b.barberId } }),
        fixture.prisma.staffInvite.findUniqueOrThrow({ where: { id: fixture.b.staffInviteId } }),
      ]);

      expect(barber.name).not.toBe('Invadido');
      expect(barber.active).toBe(true);
      expect(invite.status).toBe('PENDING');
      expect(invite.tokenHash).toContain('iso-token-b-');
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

    /**
     * Os filtros da barra são parâmetros vindos do cliente — é por eles que um
     * tenant tentaria alcançar o outro. Pedir o barbeiro/a unidade de B não
     * pode devolver os números de B nem vazar o id de volta na resposta.
     */
    it('filtrar pelo barbeiro de B não traz nada de B', async () => {
      const response = await asA
        .get(`/reports/summary?period=30d&barberIds=${fixture.b.barberId}`)
        .expect(200);
      expect(response.body.revenueByBarber).toEqual([]);
      expect(JSON.stringify(response.body)).not.toContain(fixture.b.barberId);
    });

    it('filtrar pela unidade de B não traz nada de B', async () => {
      const response = await asA
        .get(`/reports/summary?period=30d&unitId=${fixture.b.unitId}`)
        .expect(200);
      expect(response.body.revenueCents).toBe(0);
      expect(response.body.revenueByBarber).toEqual([]);
    });

    it('a exportação de A não carrega nome nem número de B', async () => {
      const response = await asA.get('/reports/export.csv?period=30d').expect(200);
      expect(response.text).not.toContain(fixture.b.barberId);
      expect(response.text).not.toContain(fixture.b.serviceId);
    });
  });

  // ── Assistente IA ──────────────────────────────────────────────────────

  describe('Assistant', () => {
    it('a conversa de A nasce vazia e não enxerga o tenant B', async () => {
      const response = await asA.get('/assistant/messages').expect(200);
      expect(JSON.stringify(response.body)).not.toContain(fixture.b.id);
    });

    /**
     * O cartão da resposta é o vazamento novo desta auditoria: ele carrega
     * NOME de cliente, id de agendamento e faturamento. Perguntar sobre a base
     * inteira com o token de A não pode trazer nada de B.
     */
    it('o cartão de clientes inativos não traz cliente de B', async () => {
      const response = await asA
        .post('/assistant/messages')
        .send({ content: 'Quais clientes não vêm há 30 dias?' })
        .expect(201);
      const body = JSON.stringify(response.body);
      expect(body).not.toContain(fixture.b.clientProfileId);
      expect(body).not.toContain(fixture.b.clientId);
    });

    it('o cartão de agenda não traz agendamento de B', async () => {
      const response = await asA
        .post('/assistant/messages')
        .send({ content: 'Como está a agenda de hoje?' })
        .expect(201);
      expect(JSON.stringify(response.body)).not.toContain(fixture.b.appointmentId);
    });

    it('limpar a conversa de A não apaga nem revela mensagem de B', async () => {
      const foreign = await fixture.prisma.aiChatMessage.create({
        data: {
          tenantId: fixture.b.id,
          userId: fixture.b.ownerUserId,
          role: 'USER',
          content: 'pergunta do tenant B',
        },
      });

      await asA.delete('/assistant/messages').expect(200);

      const survivor = await fixture.prisma.aiChatMessage.findUnique({ where: { id: foreign.id } });
      expect(survivor).not.toBeNull();
      expect(survivor?.hiddenAt).toBeNull();

      await fixture.prisma.aiChatMessage.delete({ where: { id: foreign.id } });
    });

    /**
     * A cota é do PLANO, logo do tenant — e por isso é contada com um `where`
     * de tenant. Se esse recorte falhar, a conversa de B consome a cota de A.
     */
    it('a cota de A não conta mensagem de B', async () => {
      const before = await asA.get('/assistant/messages').expect(200);

      const foreign = await fixture.prisma.aiChatMessage.create({
        data: {
          tenantId: fixture.b.id,
          userId: fixture.b.ownerUserId,
          role: 'USER',
          content: 'mais uma do tenant B',
        },
      });

      const after = await asA.get('/assistant/messages').expect(200);
      expect(after.body.usage.used).toBe(before.body.usage.used);

      await fixture.prisma.aiChatMessage.delete({ where: { id: foreign.id } });
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

  // ── Meu perfil (agente 27) ─────────────────────────────────────────────

  /**
   * `/me` é a única família de rotas do painel que NÃO leva id de recurso na
   * URL: o alvo é sempre "a pessoa logada, na barbearia ativa". O risco de
   * isolamento aqui não é ler a linha errada, é o TENANT errado entrar pela
   * porta lateral — o header de slug — e o papel, o nome da barbearia e, no
   * pior caso, a EXCLUSÃO caírem sobre a casa de outro.
   */
  describe('Meu perfil', () => {
    afterAll(async () => {
      // Se algum caso conseguir agendar a exclusão de A, o resto do arquivo
      // não pode herdar um tenant CANCELED.
      await fixture.prisma.tenant.update({
        where: { id: fixture.a.id },
        data: { purgeAt: null },
      });
    });

    it('o perfil de A não carrega nada de B', async () => {
      const response = await asA.get('/me').expect(200);
      expect(response.body.role).toBe('OWNER');
      expectNoForeignId(response.body, fixture.b.id, 'GET /me');
      expect(response.body.tenantName).not.toContain(fixture.b.slug);
    });

    it('o header de slug de B não troca o tenant do perfil', async () => {
      const response = await api()
        .get(url('/me'))
        .set('Authorization', `Bearer ${tokenA}`)
        .set('x-tenant-slug', fixture.b.slug)
        .expect(200);

      // O `TenantGuard` resolve pelo JWT antes de olhar o header — o perfil
      // continua sendo o de A, na barbearia de A.
      expectNoForeignId(response.body, fixture.b.id, 'GET /me com slug de B');
    });

    it('a exportação LGPD de A não lista a barbearia de B', async () => {
      const response = await asA.get('/me/export').expect(200);
      expectNoForeignId(response.body, fixture.b.id, 'GET /me/export');
      expect(JSON.stringify(response.body)).not.toContain(fixture.b.slug);
    });

    it('nem com o slug de B no header a exclusão cai sobre B', async () => {
      await api()
        .post(url('/me/account-deletion'))
        .set('Authorization', `Bearer ${tokenA}`)
        .set('x-tenant-slug', fixture.b.slug)
        .send({ confirm: 'EXCLUIR' });

      const b = await fixture.prisma.tenant.findUniqueOrThrow({
        where: { id: fixture.b.id },
        select: { purgeAt: true, status: true, deletedAt: true },
      });
      expect(b.purgeAt).toBeNull();
      expect(b.deletedAt).toBeNull();
      expect(b.status).not.toBe('CANCELED');
    });

    it('o pedido de exclusão de dados de A não notifica o dono de B', async () => {
      await api()
        .post(url('/me/data-deletion-request'))
        .set('Authorization', `Bearer ${tokenA}`)
        .set('x-tenant-slug', fixture.b.slug)
        .send({});

      const mail = await fixture.prisma.mailOutbox.findFirst({
        where: { to: fixture.b.ownerEmail },
      });
      expect(mail).toBeNull();
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
