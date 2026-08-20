import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AdminQueueDetail, AdminQueuesResponse } from '@barbervp/types';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantOptional } from '../common/decorators/public.decorator';
import { QueueAdminService } from './queue-admin.service';

/**
 * Painel de jobs — `SUPER_ADMIN` apenas, fora do conceito de tenant (as filas
 * são da plataforma, não de uma barbearia).
 */
@ApiTags('admin-queues')
@ApiBearerAuth('access-token')
@Controller('admin/queues')
@Roles('SUPER_ADMIN')
@TenantOptional()
export class QueueAdminController {
  constructor(private readonly queues: QueueAdminService) {}

  @Get()
  @ApiOperation({ summary: 'Resumo das filas (contagens e próximo disparo)' })
  list(): Promise<AdminQueuesResponse> {
    return this.queues.listQueues();
  }

  @Get(':name')
  @ApiOperation({ summary: 'Últimos jobs de uma fila' })
  detail(@Param('name') name: string, @Query('limit') limit?: string): Promise<AdminQueueDetail> {
    const parsed = Number(limit);
    return this.queues.detail(name, Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 100) : 20);
  }

  @Post(':name/run')
  @ApiOperation({ summary: 'Dispara o job da fila agora, fora do cron' })
  run(@Param('name') name: string): Promise<{ enqueued: true; jobId: string }> {
    return this.queues.runNow(name);
  }

  @Post(':name/jobs/:jobId/retry')
  @ApiOperation({ summary: 'Reenfileira um job que falhou' })
  retry(@Param('name') name: string, @Param('jobId') jobId: string): Promise<{ retried: true }> {
    return this.queues.retryJob(name, jobId);
  }
}
