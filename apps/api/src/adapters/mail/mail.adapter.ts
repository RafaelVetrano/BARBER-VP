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

/** Contrato de e-mail transacional. Driver real entra na fase 09. */
export interface MailAdapter {
  send(params: SendMailParams): Promise<SendMailResult>;
}
