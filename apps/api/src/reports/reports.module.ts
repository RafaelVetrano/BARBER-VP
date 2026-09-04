import { Module } from '@nestjs/common';
import { StaffAgendaModule } from '../staff-agenda/staff-agenda.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ReportsExportService } from './reports-export.service';

@Module({
  imports: [StaffAgendaModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportsExportService],
})
export class ReportsModule {}
