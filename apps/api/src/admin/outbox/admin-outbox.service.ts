import { Injectable } from '@nestjs/common';
import { OutboxStatus, type Prisma } from '@prisma/client';
import type {
  AdminOutboxItem,
  AdminOutboxListQuery,
  AdminOutboxListResponse,
} from '@barbervp/types';
import { PrismaService } from '../../prisma/prisma.service';
import { pageWindow, toPaginated } from '../../common/dto/pagination.dto';
import { maskEmail, maskPhone } from '../../common/utils/mask';

/**
 * "Mensagens enviadas" do super admin — a trilha dos dois outboxes que os
 * drivers mock alimentam (`NotificationOutbox` e `MailOutbox`).
 *
 * As duas tabelas são unidas em memória, e não por SQL: têm colunas
 * diferentes, e o volume de uma página é de dezenas de linhas. A ordenação
 * final por `createdAt` é feita depois da união, então `page`/`perPage`
 * precisam ser aplicados sobre o conjunto já ordenado — daí buscar
 * `skip + take` de cada lado e cortar depois.
 *
 * Destinatário sai MASCARADO: quem opera a plataforma precisa saber que a
 * mensagem saiu e para que canal, não ler o telefone do cliente de outra
 * empresa. O corpo, esse sim, é o que permite depurar um template errado.
 */
@Injectable()
export class AdminOutboxService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AdminOutboxListQuery): Promise<AdminOutboxListResponse> {
    const window = pageWindow(query.page, query.perPage);
    const status = query.status ? (query.status as OutboxStatus) : undefined;
    const tenantId = query.tenantId;

    const wantsNotifications = query.kind !== 'mail';
    const wantsMails = query.kind !== 'notification';

    // Cada lado devolve no máximo o que caberia na página pedida contando
    // desde o começo (`skip + take`): é o mínimo que garante a página certa
    // depois da união, sem carregar as duas tabelas inteiras.
    const ceiling = window.skip + window.take;

    const notificationWhere: Prisma.NotificationOutboxWhereInput = {
      ...(status ? { status } : {}),
      ...(tenantId ? { tenantId } : {}),
    };
    const mailWhere: Prisma.MailOutboxWhereInput = {
      ...(status ? { status } : {}),
      ...(tenantId ? { tenantId } : {}),
    };

    const [notifications, notificationTotal, mails, mailTotal] = await Promise.all([
      wantsNotifications
        ? this.prisma.notificationOutbox.findMany({
            where: notificationWhere,
            orderBy: { createdAt: 'desc' },
            take: ceiling,
            include: { tenant: { select: { name: true } } },
          })
        : Promise.resolve([]),
      wantsNotifications
        ? this.prisma.notificationOutbox.count({ where: notificationWhere })
        : Promise.resolve(0),
      wantsMails
        ? this.prisma.mailOutbox.findMany({
            where: mailWhere,
            orderBy: { createdAt: 'desc' },
            take: ceiling,
            include: { tenant: { select: { name: true } } },
          })
        : Promise.resolve([]),
      wantsMails ? this.prisma.mailOutbox.count({ where: mailWhere }) : Promise.resolve(0),
    ]);

    const items: AdminOutboxItem[] = [
      ...notifications.map((row) => ({
        id: row.id,
        kind: 'notification' as const,
        tenantId: row.tenantId,
        tenantName: row.tenant?.name ?? null,
        recipient: maskPhone(row.recipient),
        subject: row.templateKey,
        body: row.body,
        status: row.status,
        attempts: row.attempts,
        scheduledFor: row.scheduledFor?.toISOString() ?? null,
        sentAt: row.sentAt?.toISOString() ?? null,
        error: row.error,
        createdAt: row.createdAt.toISOString(),
      })),
      ...mails.map((row) => ({
        id: row.id,
        kind: 'mail' as const,
        tenantId: row.tenantId,
        tenantName: row.tenant?.name ?? null,
        recipient: maskEmail(row.to),
        subject: row.subject,
        body: row.body,
        status: row.status,
        attempts: row.attempts,
        scheduledFor: null,
        sentAt: row.sentAt?.toISOString() ?? null,
        error: row.error,
        createdAt: row.createdAt.toISOString(),
      })),
    ]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(window.skip, window.skip + window.take);

    return toPaginated(items, notificationTotal + mailTotal, window);
  }
}
