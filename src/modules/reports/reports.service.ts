import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { buildMeta } from '../../common/utils/pagination.util';
import { formatYmd } from '../../common/utils/date.util';
import { PrismaService } from '../../prisma/prisma.service';
import { REPORTS, REPORTS_BY_KEY } from './definitions';
import { ReportQueryDto } from './dto/report-query.dto';
import { ExcelService } from './excel.service';
import { STATUS_LABEL } from './reports.constants';
import { ReportDefinition, ReportFilters } from './report.types';

const TOTALS_BATCH = 1000;

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly excel: ExcelService,
  ) {}

  /** Reports (with their columns and supported filters) the caller may use. */
  catalog(role: Role) {
    return REPORTS.filter((r) => r.roles.includes(role)).map((r) => ({
      key: r.key,
      title: r.title,
      titleEn: r.titleEn,
      filters: r.filters,
      columns: r.columns.map(({ key, header, type, total }) => ({
        key,
        header,
        type,
        total: !!total,
      })),
    }));
  }

  async preview(key: string, q: ReportQueryDto, role: Role) {
    const def = this.getDefinition(key, role);
    const filters = this.pickFilters(def, q);
    const { rows, total } = await def.fetch(this.prisma, filters, {
      skip: (q.page - 1) * q.limit,
      take: q.limit,
    });
    const totals = await this.computeTotals(def, filters);
    return { data: rows, meta: buildMeta(q.page, q.limit, total, totals) };
  }

  async exportExcel(key: string, q: ReportQueryDto, role: Role) {
    const def = this.getDefinition(key, role); // permission + existence checked BEFORE streaming
    const filters = this.pickFilters(def, q);
    const info = await this.describeFilters(filters);
    return {
      stream: this.excel.createStream(def, filters, info),
      fileName: `${def.fileName}-${formatYmd()}.xlsx`,
    };
  }

  private getDefinition(key: string, role: Role): ReportDefinition {
    const def = REPORTS_BY_KEY.get(key);
    if (!def) throw new NotFoundException('រកមិនឃើញរបាយការណ៍');
    if (!def.roles.includes(role)) {
      throw new ForbiddenException('អ្នកមិនមានសិទ្ធិមើលរបាយការណ៍នេះទេ');
    }
    return def;
  }

  /** Only pass along filters the report declares, so unrelated params are ignored. */
  private pickFilters(def: ReportDefinition, q: ReportQueryDto): ReportFilters {
    const out: ReportFilters = {};
    for (const key of def.filters) {
      const value = q[key];
      if (value !== undefined && value !== '') (out as Record<string, unknown>)[key] = value;
    }
    return out;
  }

  /** Column totals over the whole filtered dataset (not just the current page). */
  private async computeTotals(def: ReportDefinition, filters: ReportFilters) {
    const keys = def.columns.filter((c) => c.total).map((c) => c.key);
    if (!keys.length) return undefined;

    const totals: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 0]));
    for (let skip = 0; ; skip += TOTALS_BATCH) {
      const { rows, total } = await def.fetch(this.prisma, filters, { skip, take: TOTALS_BATCH });
      for (const row of rows) for (const k of keys) totals[k] += Number(row[k] ?? 0);
      if (rows.length === 0 || skip + rows.length >= total) break;
    }
    for (const k of keys) totals[k] = Math.round(totals[k] * 100) / 100;
    return totals;
  }

  /** Human-readable filter summary for the Excel header. */
  private async describeFilters(f: ReportFilters): Promise<string> {
    const parts: string[] = [];
    if (f.dateFrom) parts.push(`ពីថ្ងៃ: ${f.dateFrom.slice(0, 10)}`);
    if (f.dateTo) parts.push(`ដល់ថ្ងៃ: ${f.dateTo.slice(0, 10)}`);
    if (f.categoryId) {
      const c = await this.prisma.category.findUnique({ where: { id: f.categoryId }, select: { name: true } });
      parts.push(`ប្រភេទ: ${c?.name ?? f.categoryId}`);
    }
    if (f.subcategoryId) {
      const s = await this.prisma.subcategory.findUnique({ where: { id: f.subcategoryId }, select: { name: true } });
      parts.push(`ប្រភេទរង: ${s?.name ?? f.subcategoryId}`);
    }
    if (f.supplierId) {
      const s = await this.prisma.supplier.findUnique({ where: { id: f.supplierId }, select: { companyName: true } });
      parts.push(`អ្នកផ្គត់ផ្គង់: ${s?.companyName ?? f.supplierId}`);
    }
    if (f.productId) {
      const p = await this.prisma.product.findUnique({ where: { id: f.productId }, select: { sku: true, name: true } });
      parts.push(`ទំនិញ: ${p ? `${p.sku} ${p.name}` : f.productId}`);
    }
    if (f.status) parts.push(`ស្ថានភាព: ${STATUS_LABEL[f.status]}`);
    if (f.search) parts.push(`ស្វែងរក: "${f.search}"`);
    return parts.join(' | ');
  }
}
