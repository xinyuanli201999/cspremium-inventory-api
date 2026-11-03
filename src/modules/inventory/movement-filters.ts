import { MovementType, Prisma } from '@prisma/client';
import { dateRange } from '../../common/utils/date.util';

export const movementInclude = {
  product: {
    select: {
      id: true,
      sku: true,
      name: true,
      nameKh: true,
      unit: true,
      category: { select: { id: true, name: true, nameKh: true } },
    },
  },
  supplier: { select: { id: true, companyName: true } },
  createdBy: { select: { id: true, name: true } },
  adjustment: {
    select: { oldQuantity: true, newQuantity: true, difference: true, reason: true },
  },
} satisfies Prisma.StockMovementInclude;

export interface MovementFilters {
  search?: string;
  type?: MovementType;
  productId?: string;
  categoryId?: string;
  subcategoryId?: string;
  supplierId?: string;
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export function buildMovementWhere(f: MovementFilters): Prisma.StockMovementWhereInput {
  const productWhere: Prisma.ProductWhereInput = {
    ...(f.categoryId ? { categoryId: f.categoryId } : {}),
    ...(f.subcategoryId ? { subcategoryId: f.subcategoryId } : {}),
  };
  const movementDate = dateRange(f.dateFrom, f.dateTo);

  return {
    ...(f.type ? { type: f.type } : {}),
    ...(f.productId ? { productId: f.productId } : {}),
    ...(f.supplierId ? { supplierId: f.supplierId } : {}),
    ...(f.userId ? { createdById: f.userId } : {}),
    ...(movementDate ? { movementDate } : {}),
    ...(Object.keys(productWhere).length ? { product: productWhere } : {}),
    ...(f.search
      ? {
          OR: [
            { referenceNo: { contains: f.search, mode: 'insensitive' } },
            { product: { sku: { contains: f.search, mode: 'insensitive' } } },
            { product: { name: { contains: f.search, mode: 'insensitive' } } },
            { product: { nameKh: { contains: f.search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };
}
