import { ReportDefinition } from '../report.types';
import {
  stockInReport,
  stockMovementReport,
  stockOutReport,
} from './movement-reports';
import {
  lowStockReport,
  productReport,
  stockReport,
  valuationReport,
} from './product-reports';
import {
  categoryReport,
  subcategoryReport,
  supplierReport,
} from './summary-reports';

/**
 * Report registry. To add a report: create a ReportDefinition and add it here.
 * No controller/route changes are needed.
 */
export const REPORTS: ReportDefinition[] = [
  stockReport,
  stockInReport,
  stockOutReport,
  stockMovementReport,
  lowStockReport,
  productReport,
  supplierReport,
  valuationReport,
  categoryReport,
  subcategoryReport,
];

export const REPORTS_BY_KEY = new Map(REPORTS.map((r) => [r.key, r]));
