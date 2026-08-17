import { GuestRiskService } from './guest-risk.service';
import type { AppConfig } from '../config/configuration';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Os três gatilhos do OTP condicional.
 *
 * Vale unitário e não e2e porque a suíte de ponta a ponta roda dezenas de
 * reservas do mesmo IP em segundos: para ela caber, os tetos são afrouxados por
 * env (`load-env.ts`), o que justamente desativaria dois dos gatilhos. Aqui os
 * limites são os de produção.
 */
describe('GuestRiskService', () => {
  const config = {
    booking: { createHourlyLimit: 30, guestIpHourlyLimit: 6, guestOpenAppointmentsLimit: 2 },
  } as AppConfig;

  function build(overrides: {
    client?: { phoneVerifiedAt: Date | null; passwordHash: string | null } | null;
    openCount?: number;
    ipCount?: number;
  }) {
    const prisma = {
      client: { findFirst: jest.fn().mockResolvedValue(overrides.client ?? null) },
      appointment: { count: jest.fn().mockResolvedValue(overrides.openCount ?? 0) },
      auditLog: { count: jest.fn().mockResolvedValue(overrides.ipCount ?? 0) },
    } as unknown as PrismaService;

    return new GuestRiskService(prisma, config);
  }

  const input = { tenantId: 't1', phone: '5516999990001', ip: '203.0.113.10' };

  it('deixa passar o visitante comum, sem fricção nenhuma', async () => {
    await expect(build({}).evaluate(input)).resolves.toEqual({
      otpRequired: false,
      reason: null,
    });
  });

  it('exige código quando o telefone é de conta verificada', async () => {
    const service = build({ client: { phoneVerifiedAt: new Date(), passwordHash: null } });
    await expect(service.evaluate(input)).resolves.toEqual({
      otpRequired: true,
      reason: 'REGISTERED_PHONE',
    });
  });

  it('exige código quando o telefone é de conta com senha, mesmo sem verificação', async () => {
    const service = build({ client: { phoneVerifiedAt: null, passwordHash: 'argon2$...' } });
    await expect(service.evaluate(input)).resolves.toEqual({
      otpRequired: true,
      reason: 'REGISTERED_PHONE',
    });
  });

  /**
   * Cadastro pendente (nascido de um registro que nunca confirmou o OTP) não é
   * conta: exigir código dele bloquearia quem só quer agendar.
   */
  it('não trata cadastro não verificado e sem senha como conta', async () => {
    const service = build({ client: { phoneVerifiedAt: null, passwordHash: null } });
    await expect(service.evaluate(input)).resolves.toEqual({
      otpRequired: false,
      reason: null,
    });
  });

  it('exige código a partir do terceiro horário aberto do mesmo telefone', async () => {
    await expect(build({ openCount: 1 }).evaluate(input)).resolves.toMatchObject({
      otpRequired: false,
    });
    await expect(build({ openCount: 2 }).evaluate(input)).resolves.toEqual({
      otpRequired: true,
      reason: 'TOO_MANY_OPEN',
    });
  });

  it('exige código quando o mesmo IP dispara reservas em rajada', async () => {
    await expect(build({ ipCount: 5 }).evaluate(input)).resolves.toMatchObject({
      otpRequired: false,
    });
    await expect(build({ ipCount: 6 }).evaluate(input)).resolves.toEqual({
      otpRequired: true,
      reason: 'IP_BURST',
    });
  });

  it('não consulta rajada de IP quando o IP é desconhecido', async () => {
    const prisma = {
      client: { findFirst: jest.fn().mockResolvedValue(null) },
      appointment: { count: jest.fn().mockResolvedValue(0) },
      auditLog: { count: jest.fn().mockResolvedValue(999) },
    } as unknown as PrismaService;

    const verdict = await new GuestRiskService(prisma, config).evaluate({ ...input, ip: null });

    expect(verdict.otpRequired).toBe(false);
    expect(prisma.auditLog.count).not.toHaveBeenCalled();
  });
});
