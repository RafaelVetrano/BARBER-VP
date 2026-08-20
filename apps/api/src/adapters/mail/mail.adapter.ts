export const MAIL_ADAPTER = 'MAIL_ADAPTER';

export interface SendMailParams {
  /** `null` para e-mails da plataforma (fora de tenant). */
  tenantId?: string | null;
  to: string;
  subject: string;
  /** Corpo já renderizado (texto ou HTML). */
  body: string;
  payload?: Record<string, unknown>;
}

export interface SendMailResult {
  /** Id da linha em `MailOutbox`. */
  outboxId: string;
  externalId: string | null;
  delivered: boolean;
}

export interface DispatchDueMailResult {
  picked: number;
  delivered: number;
  failed: number;
}

/**
 * Contrato de e-mail transacional. Nenhum módulo de negócio importa o driver
 * concreto — só este símbolo.
 */
export interface MailAdapter {
  send(params: SendMailParams): Promise<SendMailResult>;

  /**
   * Reprocessa o que ficou para trás (`PENDING`, ou `FAILED` ainda dentro do
   * teto de tentativas). E-mail não tem agendamento no contrato — o `send` é
   * sempre imediato —, então aqui "vencido" quer dizer "não saiu e ainda vale
   * tentar". Simétrico ao `dispatchDue` da notificação para que o worker
   * trate os dois canais do mesmo jeito.
   */
  dispatchDue(params?: { now?: Date; limit?: number }): Promise<DispatchDueMailResult>;
}
