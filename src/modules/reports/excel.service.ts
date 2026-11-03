import { Injectable, Logger } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { PassThrough } from 'stream';
import { formatYmd } from '../../common/utils/date.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CURRENCY_SYMBOL, EXPORT_BATCH_SIZE } from './reports.constants';
import {
  ColumnType,
  ReportColumn,
  ReportDefinition,
  ReportFilters,
} from './report.types';

const FONT = 'Khmer UI';
const HEADER_ROW = 5; // title, date, filters, blank, header
const NUM_FMT: Record<ColumnType, string | undefined> = {
  text: undefined,
  number: '#,##0',
  currency: `"${CURRENCY_SYMBOL}"#,##0.00`,
  date: 'dd/mm/yyyy',
  datetime: 'dd/mm/yyyy hh:mm',
};
const THIN = { style: 'thin', color: { argb: 'FFBFC5CF' } } as const;
const BORDER: Partial<ExcelJS.Borders> = { top: THIN, left: THIN, bottom: THIN, right: THIN };

/** ExcelJS writes dates as UTC; shift so the sheet shows business-timezone time. */
const toExcelDate = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000);

@Injectable()
export class ExcelService {
  private readonly logger = new Logger(ExcelService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Streams the workbook (rows are fetched in batches and flushed as they are
   * written) so large reports never sit fully in memory.
   * Returns immediately with a stream; errors destroy the stream.
   */
  createStream(def: ReportDefinition, filters: ReportFilters, filterInfo: string) {
    const stream = new PassThrough();
    this.write(def, filters, filterInfo, stream).catch((err: Error) => {
      this.logger.error(`Excel export "${def.key}" failed: ${err.message}`, err.stack);
      stream.destroy(err);
    });
    return stream;
  }

  private async write(
    def: ReportDefinition,
    filters: ReportFilters,
    filterInfo: string,
    stream: PassThrough,
  ) {
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream, useStyles: true });
    workbook.creator = 'Inventory System';
    workbook.created = new Date();

    // "ល.រ" (row number) is always the first column
    const columns: ReportColumn[] = [
      { key: '__no', header: 'ល.រ', type: 'number', width: 7 },
      ...def.columns,
    ];
    const lastCol = columns.length;

    const ws = workbook.addWorksheet(def.titleEn.slice(0, 31), {
      views: [{ state: 'frozen', ySplit: HEADER_ROW }],
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    ws.autoFilter = {
      from: { row: HEADER_ROW, column: 1 },
      to: { row: HEADER_ROW, column: lastCol },
    };
    ws.columns = columns.map((c) => ({ key: c.key, width: c.width ?? 16 }));

    // --- Title block ---
    const titleRow = ws.addRow([`${def.title} (${def.titleEn})`]);
    titleRow.font = { name: FONT, size: 16, bold: true };
    titleRow.commit();
    ws.addRow([`កាលបរិច្ឆេទរបាយការណ៍: ${formatYmd()}`]).commit();
    ws.addRow([`ព័ត៌មាន Filter: ${filterInfo || 'គ្មាន (ទាំងអស់)'}`]).commit();
    ws.addRow([]).commit();
    // (No merged cells: the streaming writer cannot merge after rows are committed.
    //  Text simply overflows into the empty cells to its right.)

    // --- Header ---
    const header = ws.addRow(columns.map((c) => c.header));
    header.height = 22;
    header.eachCell((cell) => {
      cell.font = { name: FONT, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E9E' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = BORDER;
    });
    header.commit();

    // --- Data, streamed in batches ---
    const totals: Record<string, number> = {};
    let rowNo = 0;
    for (let skip = 0; ; skip += EXPORT_BATCH_SIZE) {
      const { rows, total } = await def.fetch(this.prisma, filters, {
        skip,
        take: EXPORT_BATCH_SIZE,
      });

      for (const row of rows) {
        rowNo += 1;
        const values = columns.map((c) => {
          if (c.key === '__no') return rowNo;
          const v = row[c.key];
          if (c.total) totals[c.key] = (totals[c.key] ?? 0) + Number(v ?? 0);
          return v instanceof Date ? toExcelDate(v) : (v ?? '');
        });
        const r = ws.addRow(values);
        columns.forEach((c, i) => {
          const cell = r.getCell(i + 1);
          cell.font = { name: FONT };
          cell.border = BORDER;
          const fmt = NUM_FMT[c.type];
          if (fmt) cell.numFmt = fmt;
          if (c.key === '__no') cell.alignment = { horizontal: 'center' };
        });
        r.commit();
      }

      if (rows.length === 0 || skip + rows.length >= total) break;
    }

    // --- Total row ---
    if (columns.some((c) => c.total) && rowNo > 0) {
      const values = columns.map((c, i) =>
        i === 0 ? 'សរុប' : c.total ? (totals[c.key] ?? 0) : '',
      );
      const r = ws.addRow(values);
      columns.forEach((c, i) => {
        const cell = r.getCell(i + 1);
        cell.font = { name: FONT, bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF9' } };
        cell.border = {
          top: { style: 'medium', color: { argb: 'FF1F4E9E' } },
          left: THIN,
          bottom: THIN,
          right: THIN,
        };
        const fmt = c.total ? NUM_FMT[c.type] : undefined;
        if (fmt) cell.numFmt = fmt;
      });
      r.commit();
    }

    ws.commit();
    await workbook.commit();
  }
}
