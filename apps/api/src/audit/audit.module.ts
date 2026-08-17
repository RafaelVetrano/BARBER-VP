import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';

/** Auditoria é transversal: todo módulo de negócio pode injetar `AuditService`. */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
