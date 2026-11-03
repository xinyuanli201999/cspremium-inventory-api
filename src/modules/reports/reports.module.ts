import { Module } from '@nestjs/common';
import { ExcelService } from './excel.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, ExcelService],
})
export class ReportsModule {}
