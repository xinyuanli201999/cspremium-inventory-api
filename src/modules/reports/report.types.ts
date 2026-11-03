import { Role, Status } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type ColumnType = 'text' | 'number' | 'currency' | 'date' | 'datetime';

export interface ReportColumn {
  key: string;
  /** Khmer header (used in UI and Excel) */
  header: string;
  type: ColumnType;
  width?: number;
  /** Sum this column in the total row */
  total?: boolean;
}

export type ReportRow = Record<string, string | number | Date | null>;

export interface ReportFilters {
  dateFrom?: string;
  dateTo?: string;
  productId?: string;
  categoryId?: string;
  subcategoryId?: string;
  supplierId?: string;
  status?: Status;
  search?: string;
}

export type FilterKey = keyof ReportFilters;

export interface ReportPage {
  skip: number;
  take: number;
}

export interface ReportDefinition {
  key: string;
  title: string;
  titleEn: string;
  /** Base of the downloaded file name, e.g. "stock-report" -> stock-report-2026-09-29.xlsx */
  fileName: string;
  /** Roles allowed to view/export */
  roles: Role[];
  /** Filters this report understands (the UI shows only these) */
  filters: FilterKey[];
  columns: ReportColumn[];
  /**
   * Must use a deterministic order so batches (skip/take) never overlap.
   * The same function feeds the on-screen table and the Excel export.
   */
  fetch(
    prisma: PrismaService,
    filters: ReportFilters,
    page: ReportPage,
  ): Promise<{ rows: ReportRow[]; total: number }>;
}
