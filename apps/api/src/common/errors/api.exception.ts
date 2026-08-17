import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode, type ApiErrorBody } from '@barbervp/types';

/**
 * Exceção no contrato do projeto. Prefira estes helpers a `BadRequestException`
 * & cia. — assim o `code` é explícito e estável para o frontend.
 */
export class ApiException extends HttpException {
  constructor(status: HttpStatus, body: ApiErrorBody) {
    super(body, status);
  }

  static badRequest(message: string, details?: unknown): ApiException {
    return new ApiException(HttpStatus.BAD_REQUEST, {
      code: ErrorCode.BAD_REQUEST,
      message,
      details,
    });
  }

  static unauthenticated(
    message = 'Autenticação necessária.',
    code: string = ErrorCode.UNAUTHENTICATED,
  ): ApiException {
    return new ApiException(HttpStatus.UNAUTHORIZED, { code, message });
  }

  static forbidden(message = 'Acesso negado.', code: string = ErrorCode.FORBIDDEN): ApiException {
    return new ApiException(HttpStatus.FORBIDDEN, { code, message });
  }

  static notFound(message = 'Registro não encontrado.'): ApiException {
    return new ApiException(HttpStatus.NOT_FOUND, { code: ErrorCode.NOT_FOUND, message });
  }

  static conflict(message: string, code: string = ErrorCode.CONFLICT): ApiException {
    return new ApiException(HttpStatus.CONFLICT, { code, message });
  }

  static tenantRequired(): ApiException {
    return new ApiException(HttpStatus.FORBIDDEN, {
      code: ErrorCode.TENANT_REQUIRED,
      message: 'Nenhuma barbearia identificada nesta requisição.',
    });
  }

  static tenantMismatch(): ApiException {
    return new ApiException(HttpStatus.FORBIDDEN, {
      code: ErrorCode.TENANT_MISMATCH,
      message: 'Você não tem acesso a esta barbearia.',
    });
  }

  static featureNotInPlan(feature: string): ApiException {
    return new ApiException(HttpStatus.FORBIDDEN, {
      code: ErrorCode.FEATURE_NOT_IN_PLAN,
      message: 'Este recurso não está disponível no plano atual.',
      details: { feature },
    });
  }
}
