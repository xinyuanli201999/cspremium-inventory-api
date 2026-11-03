import { MovementType, Prisma, Role } from '@prisma/client';
import { dateRange } from '../../../common/utils/date.util';
import { STATUS_LABEL } from '../reports.constants';
import { ReportColumn, ReportDefinition, ReportRow } from '../report.types';
import { round2, toNum } from './helpers';

const ADMIN = [Role.ADMIN];
const col = (c: ReportColumn) => c;

export const supplierReport: ReportDefinition = {
  key: 'suppliers',
  title: 'របាយការណ៍អ្នកផ្គត់ផ្គង់',
  titleEn: 'Supplier Report',
  fileName: 'supplier-report',
  roles: ADMIN,
  filters: ['dateFrom', 'dateTo', 'status', 'search'],
  columns: [
    col({ key: 'companyName', header: 'ក្រុមហ៊ុន', type: 'text', width: 30 }),
    col({ key: 'contactPerson', header: 'អ្នកទំនាក់ទំនង', type: 'text', width: 22 }),
    col({ key: 'phone', header: 'ទូរស័ព្ទ', type: 'text', width: 16 }),
    col({ key: 'email', header: 'អ៊ីមែល', type: 'text', width: 26 }),
    col({ key: 'status', header: 'ស្ថានភាព', type: 'text', width: 12 }),
    col({ key: 'productCount', header: 'ចំនួនទំនិញ', type: 'number', width: 14, total: true }),
    col({ key: 'stockInQty', header: 'ចំនួនទំនិញចូល', type: 'number', width: 16, total: true }),
    col({ key: 'stockInCost', header: 'តម្លៃទំនិញចូល', type: 'currency', width: 18, total: true }),
  ],
  async fetch(prisma, f, page) {
    const where: Prisma.SupplierWhereInput = {
      ...(f.status ? { status: f.status } : {}),
      ...(f.search
        ? {
            OR: [
              { companyName: { contains: f.search, mode: 'insensitive' } },
              { contactPerson: { contains: f.search, mode: 'insensitive' } },
              { phone: { contains: f.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [suppliers, total] = await Promise.all([
      prisma.supplier.findMany({
        where,
        orderBy: [{ companyName: 'asc' }, { id: 'asc' }],
        include: { _count: { select: { products: true } } },
        ...page,
      }),
      prisma.supplier.count({ where }),
    ]);

    const movementDate = dateRange(f.dateFrom, f.dateTo);
    const grouped = await prisma.stockMovement.groupBy({
      by: ['supplierId'],
      where: {
        supplierId: { in: suppliers.map((s) => s.id) },
        type: MovementType.STOCK_IN,
        ...(movementDate ? { movementDate } : {}),
      },
      _sum: { quantity: true, totalCost: true },
    });
    const byId = new Map(grouped.map((g) => [g.supplierId, g._sum]));

    return {
      total,
      rows: suppliers.map((s) => ({
        companyName: s.companyName,
        contactPerson: s.contactPerson ?? '',
        phone: s.phone ?? '',
        email: s.email ?? '',
        status: STATUS_LABEL[s.status],
        productCount: s._count.products,
        stockInQty: byId.get(s.id)?.quantity ?? 0,
        stockInCost: round2(toNum(byId.get(s.id)?.totalCost)),
      })),
    };
  },
};

interface Agg {
  productCount: number;
  totalStock: number;
  stockValue: number;
}

async function aggregateProducts(
  prisma: import('../../../prisma/prisma.service').PrismaService,
  by: 'categoryId' | 'subcategoryId',
  ids: string[],
): Promise<Map<string, Agg>> {
  const products = await prisma.product.findMany({
    where: { [by]: { in: ids } },
    select: { categoryId: true, subcategoryId: true, currentStock: true, purchasePrice: true },
  });
  const map = new Map<string, Agg>();
  for (const p of products) {
    const key = p[by];
    if (!key) continue;
    const agg = map.get(key) ?? { productCount: 0, totalStock: 0, stockValue: 0 };
    agg.productCount += 1;
    agg.totalStock += p.currentStock;
    agg.stockValue += p.currentStock * toNum(p.purchasePrice);
    map.set(key, agg);
  }
  return map;
}

const emptyAgg: Agg = { productCount: 0, totalStock: 0, stockValue: 0 };

export const categoryReport: ReportDefinition = {
  key: 'categories',
  title: 'របាយការណ៍ប្រភេទទំនិញ',
  titleEn: 'Category Report',
  fileName: 'category-report',
  roles: ADMIN,
  filters: ['status', 'search'],
  columns: [
    col({ key: 'name', header: 'ប្រភេទ', type: 'text', width: 30 }),
    col({ key: 'nameKh', header: 'ឈ្មោះខ្មែរ', type: 'text', width: 26 }),
    col({ key: 'subcategoryCount', header: 'ប្រភេទរង', type: 'number', width: 12, total: true }),
    col({ key: 'productCount', header: 'ចំនួនទំនិញ', type: 'number', width: 14, total: true }),
    col({ key: 'totalStock', header: 'ស្តុកសរុប', type: 'number', width: 14, total: true }),
    col({ key: 'stockValue', header: 'Stock Value', type: 'currency', width: 18, total: true }),
    col({ key: 'status', header: 'ស្ថានភាព', type: 'text', width: 12 }),
  ],
  async fetch(prisma, f, page) {
    const where: Prisma.CategoryWhereInput = {
      ...(f.status ? { status: f.status } : {}),
      ...(f.search
        ? {
            OR: [
              { name: { contains: f.search, mode: 'insensitive' } },
              { nameKh: { contains: f.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [categories, total] = await Promise.all([
      prisma.category.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        include: { _count: { select: { subcategories: true } } },
        ...page,
      }),
      prisma.category.count({ where }),
    ]);
    const agg = await aggregateProducts(prisma, 'categoryId', categories.map((c) => c.id));
    const rows: ReportRow[] = categories.map((c) => {
      const a = agg.get(c.id) ?? emptyAgg;
      return {
        name: c.name,
        nameKh: c.nameKh ?? '',
        subcategoryCount: c._count.subcategories,
        productCount: a.productCount,
        totalStock: a.totalStock,
        stockValue: round2(a.stockValue),
        status: STATUS_LABEL[c.status],
      };
    });
    return { total, rows };
  },
};

export const subcategoryReport: ReportDefinition = {
  key: 'subcategories',
  title: 'របាយការណ៍ប្រភេទរង',
  titleEn: 'Subcategory Report',
  fileName: 'subcategory-report',
  roles: ADMIN,
  filters: ['categoryId', 'status', 'search'],
  columns: [
    col({ key: 'category', header: 'ប្រភេទ', type: 'text', width: 26 }),
    col({ key: 'name', header: 'ប្រភេទរង', type: 'text', width: 30 }),
    col({ key: 'nameKh', header: 'ឈ្មោះខ្មែរ', type: 'text', width: 26 }),
    col({ key: 'productCount', header: 'ចំនួនទំនិញ', type: 'number', width: 14, total: true }),
    col({ key: 'totalStock', header: 'ស្តុកសរុប', type: 'number', width: 14, total: true }),
    col({ key: 'stockValue', header: 'Stock Value', type: 'currency', width: 18, total: true }),
    col({ key: 'status', header: 'ស្ថានភាព', type: 'text', width: 12 }),
  ],
  async fetch(prisma, f, page) {
    const where: Prisma.SubcategoryWhereInput = {
      ...(f.categoryId ? { categoryId: f.categoryId } : {}),
      ...(f.status ? { status: f.status } : {}),
      ...(f.search
        ? {
            OR: [
              { name: { contains: f.search, mode: 'insensitive' } },
              { nameKh: { contains: f.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [subs, total] = await Promise.all([
      prisma.subcategory.findMany({
        where,
        orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }, { id: 'asc' }],
        include: { category: { select: { name: true } } },
        ...page,
      }),
      prisma.subcategory.count({ where }),
    ]);
    const agg = await aggregateProducts(prisma, 'subcategoryId', subs.map((s) => s.id));
    const rows: ReportRow[] = subs.map((s) => {
      const a = agg.get(s.id) ?? emptyAgg;
      return {
        category: s.category.name,
        name: s.name,
        nameKh: s.nameKh ?? '',
        productCount: a.productCount,
        totalStock: a.totalStock,
        stockValue: round2(a.stockValue),
        status: STATUS_LABEL[s.status],
      };
    });
    return { total, rows };
  },
};
