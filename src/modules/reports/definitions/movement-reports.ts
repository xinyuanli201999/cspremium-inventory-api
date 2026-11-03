import { MovementType, Prisma, Role } from '@prisma/client';
import { buildMovementWhere, movementInclude } from '../../inventory/movement-filters';
import { MOVEMENT_LABEL } from '../reports.constants';
import { ReportColumn, ReportDefinition } from '../report.types';
import { displayName, toNum } from './helpers';

const BOTH = [Role.ADMIN, Role.STAFF];
const MOVEMENT_FILTERS = [
  'dateFrom',
  'dateTo',
  'productId',
  'categoryId',
  'subcategoryId',
  'supplierId',
  'search',
] as const;

const col = (c: ReportColumn) => c;
const order = [{ movementDate: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }] as const;

function movementReport(opts: {
  key: string;
  title: string;
  titleEn: string;
  fileName: string;
  type?: MovementType;
  columns: ReportColumn[];
  map: (m: MovementRecord) => Record<string, string | number | Date | null>;
}): ReportDefinition {
  return {
    key: opts.key,
    title: opts.title,
    titleEn: opts.titleEn,
    fileName: opts.fileName,
    roles: BOTH,
    filters: [...MOVEMENT_FILTERS],
    columns: opts.columns,
    async fetch(prisma, f, page) {
      const where = buildMovementWhere({ ...f, type: opts.type });
      const [items, total] = await Promise.all([
        prisma.stockMovement.findMany({ where, include: movementInclude, orderBy: [...order], ...page }),
        prisma.stockMovement.count({ where }),
      ]);
      return { total, rows: items.map(opts.map) };
    },
  };
}

type MovementRecord = Prisma.StockMovementGetPayload<{ include: typeof movementInclude }>;

export const stockInReport = movementReport({
  key: 'stock-in',
  title: 'របាយការណ៍ទំនិញចូល',
  titleEn: 'Stock In Report',
  fileName: 'stock-in-report',
  type: MovementType.STOCK_IN,
  columns: [
    col({ key: 'date', header: 'កាលបរិច្ឆេទ', type: 'datetime', width: 18 }),
    col({ key: 'referenceNo', header: 'លេខយោង', type: 'text', width: 22 }),
    col({ key: 'sku', header: 'SKU', type: 'text', width: 16 }),
    col({ key: 'product', header: 'ឈ្មោះទំនិញ', type: 'text', width: 34 }),
    col({ key: 'supplier', header: 'អ្នកផ្គត់ផ្គង់', type: 'text', width: 24 }),
    col({ key: 'quantity', header: 'ចំនួន', type: 'number', width: 10, total: true }),
    col({ key: 'unitCost', header: 'តម្លៃទិញ/ឯកតា', type: 'currency', width: 16 }),
    col({ key: 'totalCost', header: 'តម្លៃសរុប', type: 'currency', width: 16, total: true }),
    col({ key: 'user', header: 'អ្នកបញ្ចូល', type: 'text', width: 18 }),
  ],
  map: (m) => ({
    date: m.movementDate,
    referenceNo: m.referenceNo,
    sku: m.product.sku,
    product: displayName(m.product),
    supplier: m.supplier?.companyName ?? '',
    quantity: m.quantity,
    unitCost: toNum(m.unitCost),
    totalCost: toNum(m.totalCost),
    user: m.createdBy.name,
  }),
});

export const stockOutReport = movementReport({
  key: 'stock-out',
  title: 'របាយការណ៍ទំនិញចេញ',
  titleEn: 'Stock Out Report',
  fileName: 'stock-out-report',
  type: MovementType.STOCK_OUT,
  columns: [
    col({ key: 'date', header: 'កាលបរិច្ឆេទ', type: 'datetime', width: 18 }),
    col({ key: 'referenceNo', header: 'លេខយោង', type: 'text', width: 22 }),
    col({ key: 'sku', header: 'SKU', type: 'text', width: 16 }),
    col({ key: 'product', header: 'ឈ្មោះទំនិញ', type: 'text', width: 34 }),
    col({ key: 'quantity', header: 'ចំនួន', type: 'number', width: 10, total: true }),
    col({ key: 'reason', header: 'មូលហេតុ', type: 'text', width: 24 }),
    col({ key: 'party', header: 'អតិថិជន / ផ្នែក', type: 'text', width: 24 }),
    col({ key: 'user', header: 'អ្នកបញ្ចូល', type: 'text', width: 18 }),
  ],
  map: (m) => ({
    date: m.movementDate,
    referenceNo: m.referenceNo,
    sku: m.product.sku,
    product: displayName(m.product),
    quantity: m.quantity,
    reason: m.reason ?? '',
    party: m.party ?? '',
    user: m.createdBy.name,
  }),
});

export const stockMovementReport = movementReport({
  key: 'stock-movement',
  title: 'របាយការណ៍ចលនាស្តុក',
  titleEn: 'Stock Movement Report',
  fileName: 'stock-movement-report',
  columns: [
    col({ key: 'date', header: 'កាលបរិច្ឆេទ', type: 'datetime', width: 18 }),
    col({ key: 'referenceNo', header: 'លេខយោង', type: 'text', width: 22 }),
    col({ key: 'type', header: 'ប្រភេទ', type: 'text', width: 14 }),
    col({ key: 'sku', header: 'SKU', type: 'text', width: 16 }),
    col({ key: 'product', header: 'ឈ្មោះទំនិញ', type: 'text', width: 34 }),
    col({ key: 'quantity', header: 'ចំនួន', type: 'number', width: 10 }),
    col({ key: 'previousStock', header: 'ស្តុកមុន', type: 'number', width: 12 }),
    col({ key: 'newStock', header: 'ស្តុកថ្មី', type: 'number', width: 12 }),
    col({ key: 'user', header: 'អ្នកបញ្ចូល', type: 'text', width: 18 }),
    col({ key: 'note', header: 'កំណត់ចំណាំ', type: 'text', width: 30 }),
  ],
  map: (m) => ({
    date: m.movementDate,
    referenceNo: m.referenceNo,
    type: MOVEMENT_LABEL[m.type],
    sku: m.product.sku,
    product: displayName(m.product),
    quantity: m.quantity,
    previousStock: m.previousStock,
    newStock: m.newStock,
    user: m.createdBy.name,
    note: m.note ?? m.reason ?? '',
  }),
});
