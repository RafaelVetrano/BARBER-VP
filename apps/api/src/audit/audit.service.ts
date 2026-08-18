import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestContext } from '../common/types/request-context';

/**
 * Ações sensíveis auditadas (`SPEC.md` → regra 6). A fase 03 registra login,
 * troca/recuperação de senha, criação e vínculo de tenant e alterações de
 * `TenantSettings`; as fases seguintes acrescentam as suas com o mesmo helper.
 */
export const AuditAction = {
  LOGIN: 'auth.login',
  LOGIN_FAILED: 'auth.login_failed',
  LOGOUT: 'auth.logout',
  PASSWORD_CHANGED: 'auth.password_changed',
  PASSWORD_RESET_REQUESTED: 'auth.password_reset_requested',
  PASSWORD_RESET_COMPLETED: 'auth.password_reset_completed',
  SESSION_REUSE_DETECTED: 'auth.session_reuse_detected',
  TENANT_CREATED: 'tenant.created',
  TENANT_LINKED: 'tenant.linked_existing_account',
  TENANT_CONTEXT_SWITCHED: 'tenant.context_switched',
  TENANT_SETTINGS_UPDATED: 'tenant.settings_updated',
  ONBOARDING_COMPLETED: 'tenant.onboarding_completed',
  CLIENT_REGISTERED: 'client.registered',
  CLIENT_VERIFIED: 'client.phone_verified',
  // Fase 04 — booking público. `APPOINTMENT_CREATED` também é lido de volta
  // pelo `GuestRiskService`, que conta reservas por IP na última hora.
  APPOINTMENT_CREATED: 'booking.appointment_created',
  APPOINTMENT_CANCELED: 'booking.appointment_canceled',
  APPOINTMENT_RESCHEDULED: 'booking.appointment_rescheduled',
  // Fase 05 — área do cliente.
  APPOINTMENT_RATED: 'booking.appointment_rated',
  CLIENT_PROFILE_UPDATED: 'client.profile_updated',
  CLIENT_PHONE_CHANGE_REQUESTED: 'client.phone_change_requested',
  CLIENT_PHONE_CHANGED: 'client.phone_changed',
  CLIENT_PASSWORD_CHANGED: 'client.password_changed',
  CLIENT_NOTIFICATIONS_UPDATED: 'client.notifications_updated',
  CLIENT_DATA_EXPORTED: 'client.data_exported',
  CLIENT_ACCOUNT_DELETED: 'client.account_deleted',
  SUBSCRIPTION_CREATED: 'subscription.created',
  SUBSCRIPTION_PAUSED: 'subscription.paused',
  SUBSCRIPTION_RESUMED: 'subscription.resumed',
  SUBSCRIPTION_CANCELED: 'subscription.canceled',
  SUBSCRIPTION_RENEWED: 'subscription.renewed',
  // Fase 06 — dashboard de operação.
  CLIENT_PROFILE_ADMIN_UPDATED: 'client.profile_admin_updated',
  CLIENT_BLOCKED: 'client.blocked',
  CLIENT_UNBLOCKED: 'client.unblocked',
  SERVICE_CREATED: 'catalog.service_created',
  SERVICE_UPDATED: 'catalog.service_updated',
  SERVICE_ARCHIVED: 'catalog.service_archived',
  PRODUCT_CREATED: 'catalog.product_created',
  PRODUCT_UPDATED: 'catalog.product_updated',
  PRODUCT_ARCHIVED: 'catalog.product_archived',
  BARBER_CREATED: 'team.barber_created',
  BARBER_UPDATED: 'team.barber_updated',
  BARBER_DEACTIVATED: 'team.barber_deactivated',
  WORK_SCHEDULE_UPDATED: 'team.work_schedule_updated',
  SCHEDULE_EXCEPTION_CREATED: 'team.schedule_exception_created',
  SCHEDULE_EXCEPTION_DELETED: 'team.schedule_exception_deleted',
  STAFF_INVITED: 'team.staff_invited',
  STAFF_INVITE_RESENT: 'team.staff_invite_resent',
  STAFF_INVITE_REVOKED: 'team.staff_invite_revoked',
  STAFF_INVITE_ACCEPTED: 'team.staff_invite_accepted',
  STAFF_APPOINTMENT_CREATED: 'staff_agenda.appointment_created',
  STAFF_APPOINTMENT_MOVED: 'staff_agenda.appointment_moved',
  STAFF_APPOINTMENT_CANCELED: 'staff_agenda.appointment_canceled',
  // Fase 07 — dashboard financeiro.
  ORDER_OPENED: 'pos.order_opened',
  ORDER_CLOSED: 'pos.order_closed',
  ORDER_REOPENED: 'pos.order_reopened',
  CASH_REGISTER_OPENED: 'finance.cash_register_opened',
  CASH_REGISTER_CLOSED: 'finance.cash_register_closed',
  ACCOUNT_PAYABLE_CREATED: 'finance.account_payable_created',
  ACCOUNT_PAYABLE_PAID: 'finance.account_payable_paid',
  ACCOUNT_RECEIVABLE_CREATED: 'finance.account_receivable_created',
  ACCOUNT_RECEIVABLE_RECEIVED: 'finance.account_receivable_received',
  BANK_ACCOUNT_UPSERTED: 'finance.bank_account_upserted',
  COMMISSION_RULE_UPSERTED: 'commissions.rule_upserted',
  COMMISSION_PERIOD_CLOSED: 'commissions.period_closed',
  VALE_CREATED: 'commissions.vale_created',
  LOYALTY_PROGRAM_UPDATED: 'loyalty.program_updated',
  RAFFLE_CREATED: 'loyalty.raffle_created',
  RAFFLE_DRAWN: 'loyalty.raffle_drawn',
  CLIENT_PLAN_UPSERTED: 'loyalty.client_plan_upserted',
  CLIENT_PLAN_ARCHIVED: 'loyalty.client_plan_archived',
  WHATSAPP_AUTOMATION_UPDATED: 'whatsapp.automation_updated',
  BARBERSHOP_SETTINGS_UPDATED: 'settings.barbershop_updated',
  UNIT_CREATED: 'settings.unit_created',
  UNIT_UPDATED: 'settings.unit_updated',
  PLAN_CHANGED: 'settings.plan_changed',
  PREFERENCES_UPDATED: 'settings.preferences_updated',
  MY_PAGE_UPDATED: 'settings.my_page_updated',
  // Fase 08 — super admin.
  ADMIN_PLAN_UPSERTED: 'admin.plan_upserted',
  ADMIN_PLAN_ARCHIVED: 'admin.plan_archived',
  ADMIN_TENANT_SUSPENDED: 'admin.tenant_suspended',
  ADMIN_TENANT_REACTIVATED: 'admin.tenant_reactivated',
  ADMIN_TENANT_PLAN_CHANGED: 'admin.tenant_plan_changed',
  /// Ação mais sensível do projeto — auditoria "pesada" de propósito: quem
  /// impersonou, qual tenant, qual OWNER alvo, sempre com IP/user-agent
  /// (o `AuditService.record` já grava os dois em toda entrada).
  ADMIN_TENANT_IMPERSONATED: 'admin.tenant_impersonated',
  ADMIN_BILLING_CYCLE_RUN: 'admin.billing_cycle_run',
  ADMIN_INVOICE_APPROVED: 'admin.invoice_approved',
  ADMIN_INVOICE_REJECTED: 'admin.invoice_rejected',
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

export interface AuditEntry {
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  tenantId?: string | null;
  actorUserId?: string | null;
  actorClientId?: string | null;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AuditService.name);
  }

  /**
   * Grava a trilha. NUNCA propaga erro: auditoria que derruba a operação
   * auditada troca um problema de observabilidade por um de disponibilidade.
   * A falha vira log de erro e a requisição segue.
   */
  async record(entry: AuditEntry, request?: RequestContext): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId ?? null,
          tenantId: entry.tenantId ?? null,
          actorUserId: entry.actorUserId ?? null,
          actorClientId: entry.actorClientId ?? null,
          ip: clientIp(request) ?? null,
          userAgent: request?.headers['user-agent']?.slice(0, 512) ?? null,
          metadata: (entry.metadata ?? {}) as object,
        },
      });
    } catch (error) {
      this.logger.error(
        { err: error, action: entry.action, entity: entry.entity },
        'falha ao gravar AuditLog',
      );
    }
  }
}

/** IP real do cliente — o `trust proxy` do `main.ts` já resolve o XFF. */
export function clientIp(request?: RequestContext): string | null {
  return request?.ip ?? null;
}
