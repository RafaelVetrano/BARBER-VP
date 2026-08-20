import type { NotificationChannel } from '@prisma/client';

export const NOTIFICATION_ADAPTER = 'NOTIFICATION_ADAPTER';

export interface SendNotificationParams {
  /**
   * `null`/ausente em mensagens da plataforma, fora de barbearia — o OTP de
   * cadastro do cliente é o caso: a conta é global e o tenant ainda nem existe.
   */
  tenantId?: string | null;
  /** Telefone em E.164, sem formatação. */
  recipient: string;
  /** Chave do template (`WhatsappEvent` ou chave livre para avulsos). */
  templateKey: string;
  /** Corpo já renderizado, com os placeholders substituídos. */
  body: string;
  channel?: NotificationChannel;
  payload?: Record<string, unknown>;
  /**
   * Quando a mensagem deve sair. Ausente (ou no passado) = agora.
   *
   * Existe por causa do lembrete de agendamento, que nasce 24h antes do
   * horário. Fica no contrato, e não num "outbox agendado" à parte, porque
   * "mandar depois" é responsabilidade do canal: um provedor real de WhatsApp
   * aceita agendamento nativo, e trocar o driver não pode obrigar o módulo de
   * negócio a mudar de API.
   */
  scheduledFor?: Date | null;
}

export interface SendNotificationResult {
  /** Id da linha em `NotificationOutbox`. */
  outboxId: string;
  /** Id no provedor — `null` enquanto o driver for mock. */
  externalId: string | null;
  /** `false` em mensagem agendada para o futuro: existe, mas ainda não saiu. */
  delivered: boolean;
}


export interface DispatchDueResult {
  /** Mensagens que estavam vencidas e foram tentadas nesta rodada. */
  picked: number;
  delivered: number;
  failed: number;
}

/**
 * Contrato de envio (WhatsApp hoje, SMS/push depois). Nenhum módulo de negócio
 * conhece o driver concreto: injetam `NOTIFICATION_ADAPTER` e pronto. Trocar
 * pelo provedor real é um binding no módulo, sem refatoração de negócio.
 */
export interface NotificationAdapter {
  send(params: SendNotificationParams): Promise<SendNotificationResult>;

  /**
   * Entrega as mensagens que foram agendadas e cujo horário já chegou.
   *
   * Existe porque `scheduledFor` é parte do contrato de `send`, e alguém
   * precisa cumpri-lo. QUEM cumpre depende do driver, e é por isso que o
   * método vive aqui e não no worker: um provedor com agendamento nativo
   * (WhatsApp Cloud API) já entregou sozinho e devolve zeros, enquanto o
   * driver mock varre o próprio `NotificationOutbox`. O job da fila chama
   * este método e não sabe qual dos dois está do outro lado.
   */
  dispatchDue(params?: { now?: Date; limit?: number }): Promise<DispatchDueResult>;
}
