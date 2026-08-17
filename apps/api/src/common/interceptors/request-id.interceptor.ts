import { randomUUID } from 'node:crypto';
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { REQUEST_ID_HEADER } from '@barbervp/types';
import type { Response } from 'express';
import type { Observable } from 'rxjs';
import type { RequestContext } from '../types/request-context';

/**
 * Garante um `requestId` por requisição e o devolve no header, para correlacionar
 * log da API ↔ erro visto no frontend. Reaproveita o id vindo do cliente quando
 * existe (útil quando o Next faz fetch server-side em cascata).
 */
@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<RequestContext>();
    const response = http.getResponse<Response>();

    const incoming = request.headers[REQUEST_ID_HEADER];
    const requestId =
      typeof incoming === 'string' && incoming.length > 0 && incoming.length <= 128
        ? incoming
        : randomUUID();

    request.requestId = requestId;
    response.setHeader(REQUEST_ID_HEADER, requestId);

    return next.handle();
  }
}
