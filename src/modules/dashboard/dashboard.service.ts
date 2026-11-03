import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MovementType, Role, Status } from '@prisma/client';
import { Actor } from '../../common/types/auth.types';
import { formatYmd, startOfDay } from '../../common/utils/date.util';
import { PrismaService } from '../../prisma/prisma.service';

const num = (v: unknown) => Number(v ?? 0);

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private get tz() {
    return this.config.get<string>('app.timezone') ?? 'Asia/Phnom_Penh';
  }

  async summary(actor: Actor) {
    const today = startOfDay();
    const canSeeMoney = actor.role === Role.ADMIN;

    const [
      totalProducts,
      totalCategories,
      totalSubcategories,
      totals,
      lowStock,
      outOfStock,
      inToday,
      outToday,
    ] = await Promise.all([
      this.prisma.product.count(),
      this.prisma.category.count(),
      this.prisma.subcategory.count(),
      this.prisma.$queryRaw<{ totalStock: number; inventoryValue: number }[]>`
        SELECT COALESCE(SUM("currentStock"), 0)::float8 AS "totalStock",
               COALESCE(SUM("currentStock" * "purchasePrice"), 0)::float8 AS "inventoryValue"
        FROM "Product"`,
      this.prisma.product.count({
        where: {
          status: Status.ACTIVE,
          currentStock: { gt: 0, lte: this.prisma.product.fields.minimumStock },
        },
      }),
      this.prisma.product.count({ where: { status: Status.ACTIVE, currentStock: 0 } }),
      this.prisma.stockMovement.aggregate({
        where: { type: MovementType.STOCK_IN, movementDate: { gte: today } },
        _sum: { quantity: true },
      }),
      this.prisma.stockMovement.aggregate({
        where: { type: MovementType.STOCK_OUT, movementDate: { gte: today } },
        _sum: { quantity: true },
      }),
    ]);

    return {
      totalProducts,
      totalCategories,
      totalSubcategories,
      totalStock: num(totals[0]?.totalStock),
      // Cost data is admin-only
      inventoryValue: canSeeMoney ? num(totals[0]?.inventoryValue) : null,
      lowStock,
      outOfStock,
      stockInToday: inToday._sum.quantity ?? 0,
      stockOutToday: outToday._sum.quantity ?? 0,
    };
  }

  async charts(actor: Actor) {
    const canSeeMoney = actor.role === Role.ADMIN;
    const [daily, monthly, valueByCategory, lowStockProducts] = await Promise.all([
      this.dailyFlow(14),
      this.monthlyMovement(6),
      canSeeMoney ? this.valueByCategory() : Promise.resolve([]),
      this.prisma.product.findMany({
        where: { status: Status.ACTIVE, currentStock: { lte: this.prisma.product.fields.minimumStock } },
        orderBy: [{ currentStock: 'asc' }, { name: 'asc' }],
        take: 10,
        select: { id: true, sku: true, name: true, nameKh: true, currentStock: true, minimumStock: true, unit: true },
      }),
    ]);
    return { stockFlowDaily: daily, movementByMonth: monthly, valueByCategory, lowStockProducts };
  }

  /** Stock In vs Stock Out per day, last `days` days (zero-filled). */
  private async dailyFlow(days: number) {
    const since = startOfDay(new Date(Date.now() - (days - 1) * 86_400_000));
    const rows = await this.prisma.$queryRaw<{ bucket: string; type: MovementType; qty: number }[]>`
      SELECT to_char(("movementDate" AT TIME ZONE 'UTC') AT TIME ZONE ${this.tz}::text, 'YYYY-MM-DD') AS bucket,
             "type" AS type, SUM("quantity")::float8 AS qty
      FROM "StockMovement"
      WHERE "type" IN ('STOCK_IN', 'STOCK_OUT') AND "movementDate" >= ${since}
      GROUP BY 1, 2`;

    const map = new Map<string, { stockIn: number; stockOut: number }>();
    for (let i = 0; i < days; i++) {
      const d = new Date(since.getTime() + i * 86_400_000);
      map.set(formatYmd(d), { stockIn: 0, stockOut: 0 });
    }
    for (const r of rows) {
      const slot = map.get(r.bucket);
      if (!slot) continue;
      if (r.type === MovementType.STOCK_IN) slot.stockIn = num(r.qty);
      else slot.stockOut = num(r.qty);
    }
    return [...map.entries()].map(([date, v]) => ({ date, ...v }));
  }

  /** In / out / adjustment quantity per month, last `months` months (zero-filled). */
  private async monthlyMovement(months: number) {
    const now = new Date();
    const since = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
    const rows = await this.prisma.$queryRaw<{ bucket: string; type: MovementType; qty: number }[]>`
      SELECT to_char(("movementDate" AT TIME ZONE 'UTC') AT TIME ZONE ${this.tz}::text, 'YYYY-MM') AS bucket,
             "type" AS type, SUM("quantity")::float8 AS qty
      FROM "StockMovement"
      WHERE "movementDate" >= ${since}
      GROUP BY 1, 2`;

    const map = new Map<string, { stockIn: number; stockOut: number; adjustment: number }>();
    for (let i = 0; i < months; i++) {
      const d = new Date(since.getFullYear(), since.getMonth() + i, 1);
      map.set(formatYmd(d).slice(0, 7), { stockIn: 0, stockOut: 0, adjustment: 0 });
    }
    for (const r of rows) {
      const slot = map.get(r.bucket);
      if (!slot) continue;
      if (r.type === MovementType.STOCK_IN) slot.stockIn = num(r.qty);
      else if (r.type === MovementType.STOCK_OUT) slot.stockOut = num(r.qty);
      else slot.adjustment = num(r.qty);
    }
    return [...map.entries()].map(([month, v]) => ({ month, ...v }));
  }

  private async valueByCategory() {
    const rows = await this.prisma.$queryRaw<
      { id: string; name: string; nameKh: string | null; value: number; stock: number }[]
    >`
      SELECT c."id", c."name", c."nameKh",
             COALESCE(SUM(p."currentStock" * p."purchasePrice"), 0)::float8 AS value,
             COALESCE(SUM(p."currentStock"), 0)::float8 AS stock
      FROM "Category" c
      LEFT JOIN "Product" p ON p."categoryId" = c."id"
      GROUP BY c."id"
      ORDER BY c."sortOrder" ASC`;
    return rows.map((r) => ({ ...r, value: num(r.value), stock: num(r.stock) }));
  }
}
