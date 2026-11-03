import { Role, Status } from '@prisma/client';
import { buildProductWhere, productInclude } from '../../products/products.service';
import { STATUS_LABEL, UNIT_LABEL } from '../reports.constants';
import { ReportColumn, ReportDefinition, ReportFilters } from '../report.types';
import { displayName, round2, stockState, toNum } from './helpers';

const BOTH = [Role.ADMIN, Role.STAFF];
const PRODUCT_FILTERS = ['search', 'categoryId', 'subcategoryId', 'supplierId', 'status'] as const;

const orderByName = [{ name: 'asc' }, { id: 'asc' }] as const;

const col = (c: ReportColumn) => c;

export const stockReport: ReportDefinition = {
  key: 'stock',
  title: 'របាយការណ៍ស្តុក',
  titleEn: 'Stock Report',
  fileName: 'stock-report',
  roles: BOTH,
  filters: [...PRODUCT_FILTERS],
  columns: [
    col({ key: 'sku', header: 'SKU', type: 'text', width: 16 }),
    col({ key: 'name', header: 'ឈ្មោះទំនិញ', type: 'text', width: 36 }),
    col({ key: 'category', header: 'ប្រភេទ', type: 'text', width: 22 }),
    col({ key: 'supplier', header: 'អ្នកផ្គត់ផ្គង់', type: 'text', width: 24 }),
    col({ key: 'purchasePrice', header: 'តម្លៃទិញ', type: 'currency', width: 14 }),
    col({ key: 'sellingPrice', header: 'តម្លៃលក់', type: 'currency', width: 14 }),
    col({ key: 'currentStock', header: 'ស្តុក', type: 'number', width: 10, total: true }),
    col({ key: 'minimumStock', header: 'Minimum Stock', type: 'number', width: 14 }),
    col({ key: 'stockValue', header: 'Stock Value', type: 'currency', width: 16, total: true }),
  ],
  async fetch(prisma, f, page) {
    const where = buildProductWhere(f);
    const [items, total] = await Promise.all([
      prisma.product.findMany({ where, include: productInclude, orderBy: [...orderByName], ...page }),
      prisma.product.count({ where }),
    ]);
    return {
      total,
      rows: items.map((p) => ({
        sku: p.sku,
        name: displayName(p),
        category: p.category.name,
        supplier: p.supplier?.companyName ?? '',
        purchasePrice: toNum(p.purchasePrice),
        sellingPrice: toNum(p.sellingPrice),
        currentStock: p.currentStock,
        minimumStock: p.minimumStock,
        stockValue: round2(p.currentStock * toNum(p.purchasePrice)),
      })),
    };
  },
};

export const productReport: ReportDefinition = {
  key: 'products',
  title: 'របាយការណ៍ទំនិញ',
  titleEn: 'Product Report',
  fileName: 'product-report',
  roles: BOTH,
  filters: [...PRODUCT_FILTERS],
  columns: [
    col({ key: 'sku', header: 'SKU', type: 'text', width: 16 }),
    col({ key: 'name', header: 'ឈ្មោះទំនិញ', type: 'text', width: 36 }),
    col({ key: 'category', header: 'ប្រភេទ', type: 'text', width: 22 }),
    col({ key: 'subcategory', header: 'ប្រភេទរង', type: 'text', width: 22 }),
    col({ key: 'brand', header: 'Brand', type: 'text', width: 16 }),
    col({ key: 'unit', header: 'ឯកតា', type: 'text', width: 10 }),
    col({ key: 'purchasePrice', header: 'តម្លៃទិញ', type: 'currency', width: 14 }),
    col({ key: 'sellingPrice', header: 'តម្លៃលក់', type: 'currency', width: 14 }),
    col({ key: 'currentStock', header: 'ស្តុក', type: 'number', width: 10, total: true }),
    col({ key: 'minimumStock', header: 'Minimum Stock', type: 'number', width: 14 }),
    col({ key: 'status', header: 'ស្ថានភាព', type: 'text', width: 12 }),
    col({ key: 'createdAt', header: 'កាលបរិច្ឆេទបង្កើត', type: 'date', width: 16 }),
  ],
  async fetch(prisma, f, page) {
    const where = buildProductWhere(f);
    const [items, total] = await Promise.all([
      prisma.product.findMany({ where, include: productInclude, orderBy: [...orderByName], ...page }),
      prisma.product.count({ where }),
    ]);
    return {
      total,
      rows: items.map((p) => ({
        sku: p.sku,
        name: displayName(p),
        category: p.category.name,
        subcategory: p.subcategory?.name ?? '',
        brand: p.brand ?? '',
        unit: UNIT_LABEL[p.unit] ?? p.unit,
        purchasePrice: toNum(p.purchasePrice),
        sellingPrice: toNum(p.sellingPrice),
        currentStock: p.currentStock,
        minimumStock: p.minimumStock,
        status: STATUS_LABEL[p.status],
        createdAt: p.createdAt,
      })),
    };
  },
};

export const lowStockReport: ReportDefinition = {
  key: 'low-stock',
  title: 'របាយការណ៍ស្តុកទាប',
  titleEn: 'Low Stock Report',
  fileName: 'low-stock-report',
  roles: BOTH,
  filters: [...PRODUCT_FILTERS],
  columns: [
    col({ key: 'sku', header: 'SKU', type: 'text', width: 16 }),
    col({ key: 'name', header: 'ឈ្មោះទំនិញ', type: 'text', width: 36 }),
    col({ key: 'category', header: 'ប្រភេទ', type: 'text', width: 22 }),
    col({ key: 'supplier', header: 'អ្នកផ្គត់ផ្គង់', type: 'text', width: 24 }),
    col({ key: 'currentStock', header: 'ស្តុក', type: 'number', width: 10 }),
    col({ key: 'minimumStock', header: 'Minimum Stock', type: 'number', width: 14 }),
    col({ key: 'shortage', header: 'ត្រូវបន្ថែម', type: 'number', width: 12, total: true }),
    col({ key: 'state', header: 'ស្ថានភាពស្តុក', type: 'text', width: 16 }),
  ],
  async fetch(prisma, f, page) {
    const where = {
      ...buildProductWhere({ ...f, status: f.status ?? Status.ACTIVE }),
      currentStock: { lte: prisma.product.fields.minimumStock },
    };
    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: productInclude,
        orderBy: [{ currentStock: 'asc' }, { name: 'asc' }, { id: 'asc' }],
        ...page,
      }),
      prisma.product.count({ where }),
    ]);
    return {
      total,
      rows: items.map((p) => ({
        sku: p.sku,
        name: displayName(p),
        category: p.category.name,
        supplier: p.supplier?.companyName ?? '',
        currentStock: p.currentStock,
        minimumStock: p.minimumStock,
        shortage: Math.max(0, p.minimumStock - p.currentStock),
        state: stockState(p.currentStock, p.minimumStock),
      })),
    };
  },
};

export const valuationReport: ReportDefinition = {
  key: 'valuation',
  title: 'របាយការណ៍តម្លៃស្តុក',
  titleEn: 'Inventory Valuation',
  fileName: 'inventory-valuation',
  roles: [Role.ADMIN],
  filters: [...PRODUCT_FILTERS],
  columns: [
    col({ key: 'category', header: 'ប្រភេទ', type: 'text', width: 22 }),
    col({ key: 'subcategory', header: 'ប្រភេទរង', type: 'text', width: 22 }),
    col({ key: 'sku', header: 'SKU', type: 'text', width: 16 }),
    col({ key: 'name', header: 'ឈ្មោះទំនិញ', type: 'text', width: 36 }),
    col({ key: 'currentStock', header: 'ស្តុក', type: 'number', width: 10, total: true }),
    col({ key: 'purchasePrice', header: 'តម្លៃទិញ', type: 'currency', width: 14 }),
    col({ key: 'stockValue', header: 'Stock Value', type: 'currency', width: 16, total: true }),
  ],
  async fetch(prisma, f, page) {
    const where = buildProductWhere(f);
    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: productInclude,
        orderBy: [{ category: { sortOrder: 'asc' } }, { name: 'asc' }, { id: 'asc' }],
        ...page,
      }),
      prisma.product.count({ where }),
    ]);
    return {
      total,
      rows: items.map((p) => ({
        category: p.category.name,
        subcategory: p.subcategory?.name ?? '',
        sku: p.sku,
        name: displayName(p),
        currentStock: p.currentStock,
        purchasePrice: toNum(p.purchasePrice),
        stockValue: round2(p.currentStock * toNum(p.purchasePrice)),
      })),
    };
  },
};

export type { ReportFilters };
