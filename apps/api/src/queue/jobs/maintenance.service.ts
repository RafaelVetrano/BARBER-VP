import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../prisma/prisma.service';

export interface MaintenanceSummary {
  otpCodes: number;
  authSessions: number;
  notificationOutbox: number;
  mailOutbox: number;
  passwordResetTokens: number;
  auditLogs: number;
}

/**
 * Faxina do que só cresce.
 *
 * `OtpCode` e `AuthSession` expiradas eram dívida aberta desde a fase 03: têm
 * índice em `expiresAt`, não atrapalham consulta, mas nunca eram apagadas. Os
 * outboxes e o `AuditLog` entram pelo mesmo motivo — trilha de mensagem tem
 * valor por semanas, não para sempre.
 *
 * As retenções são deliberadamente diferentes: mensagem entregue é dado
 * operacional (30 dias bastam para investigar "o cliente não recebeu"), e
 * `AuditLog` é registro de conformidade, com o ano exigido pela LGPD para
 * demonstrar quem acessou o quê.
 */
export const RETENTION_DAYS = {
  /** Desafio queimado ou expirado — sem valor nenhum depois de resolvido. */
  otp: 7,
  /** Sessão de refresh já expirada. A revogação em si vive no `AuditLog`. */
  session: 30,
  /** Mensagem entregue ou desistida. Só linhas terminais saem. */
  outbox: 30,
  /** Link de recuperação de senha já usado ou vencido. */
  passwordReset: 7,
  auditLog: 365,
} as const;

const daysAgo = (days: number, now: Date): Date =>
  new Date(now.getTime() - days * 24 * 60 * 60 * 1_000);

@Injectable()
export class MaintenanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(MaintenanceService.name);
  }

  async runOnce(now = new Date()): Promise<MaintenanceSummary> {
    // Cada `deleteMany` é independente: um erro numa tabela não pode impedir
    // a faxina das outras, e nenhuma delas tem relação entre si que exija
    // atomicidade — por isso não há transação envolvendo o conjunto.
    const [otpCodes, authSessions, notificationOutbox, mailOutbox, passwordResetTokens, auditLogs] =
      await Promise.all([
        this.prisma.otpCode.deleteMany({
          where: { expiresAt: { lt: daysAgo(RETENTION_DAYS.otp, now) } },
        }),
        this.prisma.authSession.deleteMany({
          where: { expiresAt: { lt: daysAgo(RETENTION_DAYS.session, now) } },
        }),
        this.prisma.notificationOutbox.deleteMany({
          where: {
            status: { in: ['SENT', 'FAILED'] },
            createdAt: { lt: daysAgo(RETENTION_DAYS.outbox, now) },
          },
        }),
        this.prisma.mailOutbox.deleteMany({
          where: {
            status: { in: ['SENT', 'FAILED'] },
            createdAt: { lt: daysAgo(RETENTION_DAYS.outbox, now) },
          },
        }),
        this.prisma.passwordResetToken.deleteMany({
          where: { expiresAt: { lt: daysAgo(RETENTION_DAYS.passwordReset, now) } },
        }),
        this.prisma.auditLog.deleteMany({
          where: { createdAt: { lt: daysAgo(RETENTION_DAYS.auditLog, now) } },
        }),
      ]);

    const summary: MaintenanceSummary = {
      otpCodes: otpCodes.count,
      authSessions: authSessions.count,
      notificationOutbox: notificationOutbox.count,
      mailOutbox: mailOutbox.count,
      passwordResetTokens: passwordResetTokens.count,
      auditLogs: auditLogs.count,
    };

    const total = Object.values(summary).reduce((sum, count) => sum + count, 0);
    if (total > 0) {
      this.logger.info({ ...summary, total }, 'faxina de dados expirados concluída');
    }

    return summary;
  }
}
