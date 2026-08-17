import { Inject, Injectable } from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';
import { CONFIG, type AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { AuditAction } from '../audit/audit.service';

export type GuestRiskReason =
  | 'REGISTERED_PHONE'
  | 'TOO_MANY_OPEN'
  | 'IP_BURST';

export interface GuestRiskVerdict {
  otpRequired: boolean;
  reason: GuestRiskReason | null;
}

/**
 * Decide quando o agendamento de visitante precisa de código de verificação.
 *
 * O protótipo (`AgendamentoWizard.dc.html`, passo 4) confirma direto com nome +
 * WhatsApp, sem OTP; o `system-map.md` pedia OTP sempre. Os dois extremos são
 * ruins: sem verificação nenhuma, qualquer um lota a agenda com telefones
 * alheios (e queima a barbearia com clientes que nunca souberam do horário);
 * com OTP sempre, some a razão de existir do guest booking, que é agendar em 30
 * segundos.
 *
 * A saída é OTP CONDICIONAL — pedido só quando algo destoa:
 *
 *   · `REGISTERED_PHONE` — o telefone já é de uma conta verificada. Agendar em
 *     nome de quem tem conta exige provar que o número é seu; sem isso, um
 *     terceiro acumularia faltas no cadastro de outra pessoa até o bloqueio por
 *     `bloquearFaltasQtd` cair sobre ela.
 *   · `TOO_MANY_OPEN` — o número já tem `BOOKING_GUEST_OPEN_LIMIT` horários
 *     futuros nesta barbearia (2 por padrão). O cliente normal marca um por vez;
 *     o terceiro é sinal de bagunça ou robô.
 *   · `IP_BURST` — o mesmo IP abriu `BOOKING_GUEST_IP_HOURLY_LIMIT` reservas de
 *     visitante na última hora (6 por padrão). O número é frouxo de propósito:
 *     operadora de celular e wi-fi de shopping põem milhares de pessoas atrás
 *     do mesmo IP, e travar cliente de verdade é pior que deixar passar spam.
 *
 * O limite por IP sai do `AuditLog` (`booking.appointment_created`), que já
 * guarda IP e horário de toda ação sensível — nenhuma tabela nova para isso.
 */
@Injectable()
export class GuestRiskService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  async evaluate(input: {
    tenantId: string;
    phone: string;
    ip: string | null;
    now?: Date;
  }): Promise<GuestRiskVerdict> {
    const now = input.now ?? new Date();

    const client = await this.prisma.client.findFirst({
      where: { phone: input.phone, deletedAt: null },
      select: { phoneVerifiedAt: true, passwordHash: true },
    });

    // Conta verificada OU com senha: existe dono, e o dono se identifica.
    if (client && (client.phoneVerifiedAt !== null || client.passwordHash !== null)) {
      return { otpRequired: true, reason: 'REGISTERED_PHONE' };
    }

    const openCount = await this.prisma.appointment.count({
      where: {
        tenantId: input.tenantId,
        guestPhone: input.phone,
        startsAt: { gt: now },
        status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED] },
      },
    });

    if (openCount >= this.config.booking.guestOpenAppointmentsLimit) {
      return { otpRequired: true, reason: 'TOO_MANY_OPEN' };
    }

    if (input.ip) {
      const recentFromIp = await this.prisma.auditLog.count({
        where: {
          action: AuditAction.APPOINTMENT_CREATED,
          ip: input.ip,
          createdAt: { gte: new Date(now.getTime() - 3_600_000) },
          metadata: { path: ['guest'], equals: true },
        },
      });

      if (recentFromIp >= this.config.booking.guestIpHourlyLimit) {
        return { otpRequired: true, reason: 'IP_BURST' };
      }
    }

    return { otpRequired: false, reason: null };
  }
}
