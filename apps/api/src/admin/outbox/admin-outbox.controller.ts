import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AdminOutboxListResponse } from '@barbervp/types';
import { Roles } from '../../common/decorators/roles.decorator';
import { TenantOptional } from '../../common/decorators/public.decorator';
import { AdminOutboxService } from './admin-outbox.service';
import { AdminOutboxQueryDto } from '../dto/admin.dto';

/** "Mensagens enviadas" — a trilha dos adapters, só para `SUPER_ADMIN`. */
@ApiTags('admin-outbox')
@ApiBearerAuth('access-token')
@Controller('admin/outbox')
@Roles('SUPER_ADMIN')
@TenantOptional()
export class AdminOutboxController {
  constructor(private readonly outbox: AdminOutboxService) {}

  @Get()
  @ApiOperation({ summary: 'Mensagens de WhatsApp e e-mail geradas pelos adapters' })
  list(@Query() query: AdminOutboxQueryDto): Promise<AdminOutboxListResponse> {
    return this.outbox.list(query);
  }
}
