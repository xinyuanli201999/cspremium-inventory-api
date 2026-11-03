import { Controller, Get, Param, Query, StreamableFile } from '@nestjs/common';
import { CurrentActor } from '../../common/decorators/current-actor.decorator';
import { Actor } from '../../common/types/auth.types';
import { ReportQueryDto } from './dto/report-query.dto';
import { XLSX_MIME } from './reports.constants';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  /** Reports available to the current role. */
  @Get()
  catalog(@CurrentActor() actor: Actor) {
    return this.service.catalog(actor.role);
  }

  // e.g. GET /reports/stock/export?categoryId=...&dateFrom=2026-09-01&dateTo=2026-09-29
  @Get(':type/export')
  async export(
    @Param('type') type: string,
    @Query() query: ReportQueryDto,
    @CurrentActor() actor: Actor,
  ) {
    const { stream, fileName } = await this.service.exportExcel(type, query, actor.role);
    return new StreamableFile(stream, {
      type: XLSX_MIME,
      disposition: `attachment; filename="${fileName}"`,
    });
  }

  @Get(':type')
  preview(
    @Param('type') type: string,
    @Query() query: ReportQueryDto,
    @CurrentActor() actor: Actor,
  ) {
    return this.service.preview(type, query, actor.role);
  }
}
