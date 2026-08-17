import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import { ErrorCode, type ApiErrorBody } from '@barbervp/types';
import type { Response } from 'express';
import { PinoLogger } from 'nestjs-pino';
import { CONFIG, type AppConfig } from '../../config/configuration';
import type { RequestContext } from '../types/request-context';

/** Nome da EXCLUDE constraint anti double-booking (ver migration inicial). */
const DOUBLE_BOOKING_CONSTRAINT = 'no_double_booking';

interface NormalizedError {
  status: number;
  body: ApiErrorBody;
}

/**
 * Filtro global — toda resposta de erro sai como `{ code, message, details? }`
 * (SPEC.md → Convenções). Detalhe interno de 5xx nunca vaza para o cliente.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    private readonly logger: PinoLogger,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {
    this.logger.setContext(AllExceptionsFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestContext>();
    const response = http.getResponse<Response>();

    const { status, body } = this.normalize(exception);

    const logPayload = {
      requestId: request.requestId,
      method: request.method,
      url: request.originalUrl,
      status,
      code: body.code,
      tenantId: request.tenant?.id,
    };

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error({ ...logPayload, err: exception }, body.message);
    } else {
      this.logger.warn(logPayload, body.message);
    }

    response.status(status).json(body);
  }

  private normalize(exception: unknown): NormalizedError {
    if (exception instanceof ThrottlerException) {
      return {
        status: HttpStatus.TOO_MANY_REQUESTS,
        body: {
          code: ErrorCode.RATE_LIMITED,
          message: 'Muitas requisições. Tente novamente em instantes.',
        },
      };
    }

    if (exception instanceof HttpException) {
      return this.fromHttpException(exception);
    }

    const prismaError = this.fromPrismaError(exception);
    if (prismaError) {
      return prismaError;
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Erro interno. Tente novamente.',
        // Em produção o detalhe fica só no log — o cliente recebe o requestId.
        details: this.config.isProduction
          ? undefined
          : { reason: exception instanceof Error ? exception.message : String(exception) },
      },
    };
  }

  private fromHttpException(exception: HttpException): NormalizedError {
    const status = exception.getStatus();
    const payload = exception.getResponse();

    // Já veio no contrato (lançado por código nosso).
    if (this.isApiErrorShape(payload)) {
      return { status, body: payload };
    }

    // Formato padrão do Nest — `message` pode ser string ou array (ValidationPipe).
    const message = this.extractMessage(payload, exception.message);
    const details = this.extractValidationDetails(payload);

    return {
      status,
      body: {
        code: details ? ErrorCode.VALIDATION_ERROR : this.codeForStatus(status),
        message: details ? 'Dados inválidos.' : message,
        details,
      },
    };
  }

  private fromPrismaError(exception: unknown): NormalizedError | null {
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002':
          return {
            status: HttpStatus.CONFLICT,
            body: {
              code: ErrorCode.CONFLICT,
              message: 'Já existe um registro com esses dados.',
              details: { fields: exception.meta?.['target'] },
            },
          };
        case 'P2025':
          return {
            status: HttpStatus.NOT_FOUND,
            body: { code: ErrorCode.NOT_FOUND, message: 'Registro não encontrado.' },
          };
        case 'P2003':
          return {
            status: HttpStatus.CONFLICT,
            body: {
              code: ErrorCode.CONFLICT,
              message: 'Operação viola um vínculo existente.',
              details: { field: exception.meta?.['field_name'] },
            },
          };
        default:
          break;
      }
    }

    // A EXCLUDE constraint (23P01) não tem código Prisma dedicado — o nome da
    // constraint no texto do erro do Postgres é o sinal confiável.
    if (this.mentionsDoubleBooking(exception)) {
      return {
        status: HttpStatus.CONFLICT,
        body: {
          code: ErrorCode.DOUBLE_BOOKING,
          message: 'Este barbeiro já tem um agendamento nesse horário.',
        },
      };
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        body: { code: ErrorCode.BAD_REQUEST, message: 'Requisição inválida para o banco.' },
      };
    }

    return null;
  }

  private mentionsDoubleBooking(exception: unknown): boolean {
    return exception instanceof Error && exception.message.includes(DOUBLE_BOOKING_CONSTRAINT);
  }

  private isApiErrorShape(payload: unknown): payload is ApiErrorBody {
    return (
      typeof payload === 'object' &&
      payload !== null &&
      typeof (payload as ApiErrorBody).code === 'string' &&
      typeof (payload as ApiErrorBody).message === 'string'
    );
  }

  private extractMessage(payload: unknown, fallback: string): string {
    if (typeof payload === 'string') {
      return payload;
    }
    if (typeof payload === 'object' && payload !== null) {
      const message = (payload as { message?: unknown }).message;
      if (typeof message === 'string') {
        return message;
      }
    }
    return fallback;
  }

  /** Erros do `ValidationPipe` chegam como `message: string[]`. */
  private extractValidationDetails(payload: unknown): { errors: string[] } | undefined {
    if (typeof payload === 'object' && payload !== null) {
      const message = (payload as { message?: unknown }).message;
      if (Array.isArray(message) && message.every((item) => typeof item === 'string')) {
        return { errors: message };
      }
    }
    return undefined;
  }

  private codeForStatus(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ErrorCode.BAD_REQUEST;
      case HttpStatus.UNAUTHORIZED:
        return ErrorCode.UNAUTHENTICATED;
      case HttpStatus.FORBIDDEN:
        return ErrorCode.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ErrorCode.NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ErrorCode.CONFLICT;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ErrorCode.RATE_LIMITED;
      case HttpStatus.SERVICE_UNAVAILABLE:
        return ErrorCode.SERVICE_UNAVAILABLE;
      default:
        return status >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.BAD_REQUEST;
    }
  }
}
