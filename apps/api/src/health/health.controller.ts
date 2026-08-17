import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { HealthResponse } from '@barbervp/types';
import type { Response } from 'express';
import { Public, TenantOptional } from '../common/decorators/public.decorator';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
// Health é infraestrutura: sem tenant, sem auth e fora do rate limit (senão o
// healthcheck do compose/orquestrador acaba se auto-bloqueando).
@Public()
@TenantOptional()
@SkipThrottle()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @ApiOperation({
    summary: 'Estado da API',
    description: 'Executa um ping real no Postgres e no Redis. 503 se algum estiver fora.',
  })
  @ApiOkResponse({ description: 'API e dependências no ar.' })
  @ApiServiceUnavailableResponse({ description: 'Alguma dependência está fora.' })
  async check(@Res({ passthrough: true }) response: Response): Promise<HealthResponse> {
    const result = await this.health.check();

    response.status(
      result.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE,
    );

    return result;
  }
}
