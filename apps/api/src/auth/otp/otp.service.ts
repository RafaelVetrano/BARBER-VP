import { Inject, Injectable } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import { OtpChannel, OtpPurpose, type OtpCode, type Prisma } from '@prisma/client';
import {
  ErrorCode,
  maskEmailForDisplay,
  maskPhoneForDisplay,
  type OtpChallenge,
} from '@barbervp/types';
import { PinoLogger } from 'nestjs-pino';
import { CONFIG, type AppConfig } from '../../config/configuration';
import { PrismaService } from '../../prisma/prisma.service';
import { ApiException } from '../../common/errors/api.exception';
import { MAIL_ADAPTER, type MailAdapter } from '../../adapters/mail/mail.adapter';
import {
  NOTIFICATION_ADAPTER,
  type NotificationAdapter,
} from '../../adapters/notification/notification.adapter';
import { hashSecret, randomOtpCode, randomSecret, secretMatches } from '../crypto/secret-hash';

export interface CreateChallengeInput {
  purpose: OtpPurpose;
  /** Telefone E.164 ou e-mail já normalizado. */
  destination: string;
  channel: OtpChannel;
  clientId?: string | null;
  /** Cadastro pendente, guardado até o código ser confirmado. */
  payload?: Prisma.InputJsonValue;
  ip?: string | null;
  /** Nome usado no corpo da mensagem ("Olá, João"). */
  recipientName?: string;
}

export interface VerifiedChallenge {
  challenge: OtpCode;
  /** Token de uso único para a troca de senha — só em `CLIENT_PASSWORD_RESET`. */
  exchangeToken?: string;
  exchangeExpiresInSeconds?: number;
}

/** Janela do token de troca devolvido depois de um OTP de recuperação. */
const EXCHANGE_TTL_SECONDS = 600;

/**
 * Códigos OTP de 6 dígitos do fluxo de cliente (`ClienteAuth.dc.html`).
 *
 * Defesas, em camadas:
 *   · o código nunca é guardado em claro — só o HMAC (`secret-hash.ts`);
 *   · `attempts` queima o desafio depois de N erros (padrão 5);
 *   · `resendCount` limita reenvios dentro do mesmo desafio;
 *   · um teto por destino/hora impede usar o endpoint como metralhadora de SMS;
 *   · o cooldown de reenvio é o mesmo 59s que o protótipo mostra no contador.
 *
 * O envio sai pelo `NotificationAdapter`/`MailAdapter` — nesta fase, drivers
 * mock que persistem em `NotificationOutbox`/`MailOutbox`. É de lá que os testes
 * e2e leem o código, exatamente como um dev leria a mensagem recebida.
 */
@Injectable()
export class OtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(NOTIFICATION_ADAPTER) private readonly notifications: NotificationAdapter,
    @Inject(MAIL_ADAPTER) private readonly mail: MailAdapter,
  ) {
    this.logger.setContext(OtpService.name);
  }

  async createChallenge(input: CreateChallengeInput): Promise<OtpChallenge> {
    await this.assertDestinationWithinHourlyQuota(input.destination, input.purpose);

    const code = randomOtpCode();
    const now = new Date();

    const challenge = await this.prisma.otpCode.create({
      data: {
        purpose: input.purpose,
        channel: input.channel,
        destination: input.destination,
        codeHash: this.hash(code),
        clientId: input.clientId ?? null,
        payload: input.payload,
        maxAttempts: this.config.auth.otpMaxAttempts,
        expiresAt: new Date(now.getTime() + this.config.auth.otpTtlSeconds * 1_000),
        lastSentAt: now,
        ip: input.ip ?? null,
      },
    });

    await this.deliver(challenge, code, input.recipientName);

    return this.toChallengeResponse(challenge);
  }

  /**
   * Desafio de fachada para destino sem conta.
   *
   * A recuperação de senha não pode responder diferente quando a conta não
   * existe — seria um oráculo de "quem usa o BarberVP". A linha é criada de
   * verdade (então conta para o limite por destino e o tempo de resposta bate),
   * com um código que ninguém conhece e sem `clientId`: verificar até funciona,
   * mas a troca de senha depois não acha conta. Nada é enviado ao número alheio.
   */
  async createDecoyChallenge(input: {
    purpose: OtpPurpose;
    destination: string;
    channel: OtpChannel;
  }): Promise<OtpChallenge> {
    await this.assertDestinationWithinHourlyQuota(input.destination, input.purpose);

    const challenge = await this.prisma.otpCode.create({
      data: {
        purpose: input.purpose,
        channel: input.channel,
        destination: input.destination,
        codeHash: this.hash(randomSecret()),
        maxAttempts: this.config.auth.otpMaxAttempts,
        expiresAt: new Date(Date.now() + this.config.auth.otpTtlSeconds * 1_000),
      },
    });

    this.logger.info(
      { challengeId: challenge.id, purpose: input.purpose },
      'desafio de fachada criado (destino sem conta)',
    );

    return this.toChallengeResponse(challenge);
  }

  /** Reenvio — mesmo desafio, código novo, cooldown de 59s respeitado. */
  async resend(challengeId: string, channel?: OtpChannel): Promise<OtpChallenge> {
    const challenge = await this.loadOpen(challengeId);

    const elapsedSeconds = (Date.now() - challenge.lastSentAt.getTime()) / 1_000;
    const cooldown = this.config.auth.otpResendCooldownSeconds;
    if (elapsedSeconds < cooldown) {
      throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, {
        code: ErrorCode.OTP_COOLDOWN,
        message: 'Aguarde antes de pedir um novo código.',
        details: { retryInSeconds: Math.ceil(cooldown - elapsedSeconds) },
      });
    }

    if (challenge.resendCount >= this.config.auth.otpMaxResends) {
      throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, {
        code: ErrorCode.OTP_MAX_ATTEMPTS,
        message: 'Limite de reenvios atingido. Recomece o cadastro.',
      });
    }

    const code = randomOtpCode();
    const now = new Date();
    const updated = await this.prisma.otpCode.update({
      where: { id: challenge.id },
      data: {
        codeHash: this.hash(code),
        channel: channel ?? challenge.channel,
        // O relógio de expiração reinicia junto com o código.
        expiresAt: new Date(now.getTime() + this.config.auth.otpTtlSeconds * 1_000),
        lastSentAt: now,
        resendCount: { increment: 1 },
        attempts: 0,
      },
    });

    await this.deliver(updated, code);

    return this.toChallengeResponse(updated);
  }

  /**
   * Stub de "receber por chamada" — o protótipo oferece o link, mas nenhum
   * provedor de voz existe nesta fase. O adapter registra a intenção no outbox
   * com canal `CALL`, então a troca por telefonia real é só um driver novo.
   */
  async requestVoiceCall(challengeId: string): Promise<OtpChallenge> {
    return this.resend(challengeId, OtpChannel.CALL);
  }

  async verify(challengeId: string, code: string): Promise<VerifiedChallenge> {
    const challenge = await this.loadOpen(challengeId);

    if (challenge.attempts >= challenge.maxAttempts) {
      throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, {
        code: ErrorCode.OTP_MAX_ATTEMPTS,
        message: 'Muitas tentativas. Peça um novo código.',
      });
    }

    if (!secretMatches(code, challenge.codeHash, this.pepper)) {
      const updated = await this.prisma.otpCode.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
        select: { attempts: true, maxAttempts: true },
      });
      throw new ApiException(HttpStatus.BAD_REQUEST, {
        code: ErrorCode.OTP_INVALID,
        message: 'Código inválido. Tente novamente.',
        details: { attemptsLeft: Math.max(0, updated.maxAttempts - updated.attempts) },
      });
    }

    if (challenge.purpose === OtpPurpose.CLIENT_PASSWORD_RESET) {
      const exchangeToken = randomSecret();
      const consumed = await this.prisma.otpCode.update({
        where: { id: challenge.id },
        data: {
          consumedAt: new Date(),
          exchangeHash: this.hash(exchangeToken),
          exchangeExpiresAt: new Date(Date.now() + EXCHANGE_TTL_SECONDS * 1_000),
        },
      });
      return {
        challenge: consumed,
        exchangeToken: `${consumed.id}.${exchangeToken}`,
        exchangeExpiresInSeconds: EXCHANGE_TTL_SECONDS,
      };
    }

    const consumed = await this.prisma.otpCode.update({
      where: { id: challenge.id },
      data: { consumedAt: new Date() },
    });
    return { challenge: consumed };
  }

  /** Troca o token da recuperação pelo desafio que o originou (uso único). */
  async consumeExchangeToken(token: string): Promise<OtpCode> {
    const separator = token.indexOf('.');
    if (separator <= 0) {
      throw ApiException.badRequest('Token de recuperação inválido.');
    }
    const id = token.slice(0, separator);
    const secret = token.slice(separator + 1);

    const challenge = await this.prisma.otpCode.findFirst({
      where: { id, purpose: OtpPurpose.CLIENT_PASSWORD_RESET },
    });

    if (
      !challenge?.exchangeHash ||
      !challenge.exchangeExpiresAt ||
      challenge.exchangeExpiresAt.getTime() <= Date.now() ||
      !secretMatches(secret, challenge.exchangeHash, this.pepper)
    ) {
      throw ApiException.badRequest('Token de recuperação inválido ou expirado.');
    }

    // Uso único: queima o token junto com a troca de senha.
    return this.prisma.otpCode.update({
      where: { id: challenge.id },
      data: { exchangeHash: null, exchangeExpiresAt: null },
    });
  }

  toChallengeResponse(challenge: OtpCode): OtpChallenge {
    const remainingMs = challenge.expiresAt.getTime() - Date.now();
    return {
      challengeId: challenge.id,
      destinationMasked: maskDestination(challenge.destination),
      channel: challenge.channel,
      expiresInSeconds: Math.max(0, Math.round(remainingMs / 1_000)),
      resendInSeconds: this.config.auth.otpResendCooldownSeconds,
    };
  }

  private async loadOpen(challengeId: string): Promise<OtpCode> {
    const challenge = await this.prisma.otpCode.findUnique({ where: { id: challengeId } });

    if (!challenge || challenge.consumedAt) {
      throw ApiException.badRequest('Código não encontrado. Recomece o processo.');
    }
    if (challenge.expiresAt.getTime() <= Date.now()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, {
        code: ErrorCode.OTP_EXPIRED,
        message: 'O código expirou. Peça um novo.',
      });
    }
    return challenge;
  }

  private async assertDestinationWithinHourlyQuota(
    destination: string,
    purpose: OtpPurpose,
  ): Promise<void> {
    const since = new Date(Date.now() - 3_600_000);
    const recent = await this.prisma.otpCode.count({
      where: { destination, purpose, createdAt: { gte: since } },
    });

    if (recent >= this.config.auth.otpMaxPerDestinationHour) {
      throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, {
        code: ErrorCode.RATE_LIMITED,
        message: 'Muitas solicitações para este contato. Tente novamente mais tarde.',
      });
    }
  }

  /**
   * Desafio de fachada: recuperação de senha sem conta por trás. Não tem
   * `clientId` nem `payload`, ao contrário do desafio de registro (que carrega
   * o cadastro pendente). Nunca entrega mensagem — inclusive no reenvio.
   */
  private isDecoy(challenge: OtpCode): boolean {
    return (
      challenge.purpose === OtpPurpose.CLIENT_PASSWORD_RESET &&
      challenge.clientId === null &&
      challenge.payload === null
    );
  }

  private async deliver(challenge: OtpCode, code: string, recipientName?: string): Promise<void> {
    if (this.isDecoy(challenge)) {
      return;
    }

    const greeting = recipientName ? `Olá, ${recipientName.split(' ')[0]}! ` : '';
    const minutes = Math.round(this.config.auth.otpTtlSeconds / 60);
    const body =
      `${greeting}Seu código de verificação BarberVP é ${code}. ` +
      `Ele vale por ${minutes} minutos. Se não foi você, ignore esta mensagem.`;

    if (challenge.channel === OtpChannel.EMAIL) {
      await this.mail.send({
        to: challenge.destination,
        subject: `${code} é o seu código BarberVP`,
        body,
        payload: { purpose: challenge.purpose, challengeId: challenge.id },
      });
      return;
    }

    if (challenge.channel === OtpChannel.CALL) {
      // Sem provedor de voz nesta fase: registra a intenção e devolve o mesmo
      // código pelo canal padrão, para o usuário não ficar travado.
      this.logger.info({ challengeId: challenge.id }, 'chamada de voz solicitada (stub)');
    }

    // Sem `tenantId`: a conta do cliente é global, e no registro o tenant nem
    // faz parte do fluxo.
    await this.notifications.send({
      recipient: challenge.destination,
      channel: challenge.channel === OtpChannel.SMS ? 'SMS' : 'WHATSAPP',
      templateKey: `otp.${challenge.purpose.toLowerCase()}`,
      body,
      payload: { purpose: challenge.purpose, challengeId: challenge.id },
    });
  }

  private get pepper(): string {
    return this.config.jwt.refreshSecret;
  }

  private hash(secret: string): string {
    return hashSecret(secret, this.pepper);
  }
}

function maskDestination(destination: string): string {
  return destination.includes('@')
    ? maskEmailForDisplay(destination)
    : maskPhoneForDisplay(destination);
}
