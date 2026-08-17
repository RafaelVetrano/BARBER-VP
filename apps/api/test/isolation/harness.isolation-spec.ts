import {
  disconnectIsolationFixture,
  setupIsolationFixture,
  type IsolationFixture,
} from './tenant-fixture';

/**
 * Suíte de isolamento de tenant — GATE de aceite do projeto.
 *
 * Esta fase entrega só o arnês: os dois tenants e o assert de vazamento. Cada
 * fase seguinte acrescenta um `*.isolation-spec.ts` com os seus casos
 * (fase 04: slots e agendamentos · fase 05: dados do cliente · fase 06/07:
 * agenda, comandas e financeiro · fase 08: super admin).
 *
 * Os testes abaixo verificam o próprio arnês — se eles quebrarem, os casos das
 * próximas fases estariam medindo a coisa errada.
 */
describe('isolamento de tenant — arnês', () => {
  let fixture: IsolationFixture;

  beforeAll(async () => {
    fixture = await setupIsolationFixture();
  });

  afterAll(async () => {
    await fixture.teardown();
    await disconnectIsolationFixture();
  });

  it('cria dois tenants distintos com dados próprios', () => {
    expect(fixture.a.id).not.toBe(fixture.b.id);
    expect(fixture.a.slug).not.toBe(fixture.b.slug);
    expect(fixture.a.appointmentId).not.toBe(fixture.b.appointmentId);
  });

  it('consulta escopada em A não devolve nada de B', async () => {
    const rows = await fixture.prisma.appointment.findMany({
      where: { tenantId: fixture.a.id },
      select: { id: true, tenantId: true },
    });

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.map((row) => row.id)).not.toContain(fixture.b.appointmentId);
    fixture.expectOnlyTenant(rows, fixture.a);
  });

  it('o assert de vazamento reprova quando uma linha estrangeira passa', async () => {
    const todas = await fixture.prisma.appointment.findMany({
      where: { tenantId: { in: [fixture.a.id, fixture.b.id] } },
      select: { id: true, tenantId: true },
    });

    expect(() => fixture.expectOnlyTenant(todas, fixture.a)).toThrow(/Vazamento de tenant/);
  });
});
