import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  MovementType,
  Prisma,
  Status,
} from '@prisma/client';
import { Actor } from '../../common/types/auth.types';
import { toJson } from '../../common/utils/json.util';
import { buildMeta, skipTake } from '../../common/utils/pagination.util';
import { generateReference } from '../../common/utils/reference.util';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { StorageService } from '../storage/storage.service';
import {
  CreateProductDto,
  ProductQueryDto,
  UpdateProductDto,
} from './dto/product.dto';

export const productInclude = {
  category: { select: { id: true, name: true, nameKh: true } },
  subcategory: { select: { id: true, name: true, nameKh: true } },
  supplier: { select: { id: true, companyName: true } },
} satisfies Prisma.ProductInclude;

export function buildProductWhere(q: {
  search?: string;
  categoryId?: string;
  subcategoryId?: string;
  supplierId?: string;
  status?: Status;
}): Prisma.ProductWhereInput {
  return {
    ...(q.categoryId ? { categoryId: q.categoryId } : {}),
    ...(q.subcategoryId ? { subcategoryId: q.subcategoryId } : {}),
    ...(q.supplierId ? { supplierId: q.supplierId } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(q.search
      ? {
          OR: [
            { sku: { contains: q.search, mode: 'insensitive' } },
            { name: { contains: q.search, mode: 'insensitive' } },
            { nameKh: { contains: q.search, mode: 'insensitive' } },
            { brand: { contains: q.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogsService,
    private readonly storage: StorageService,
  ) {}

  async findAll(q: ProductQueryDto) {
    const where = buildProductWhere(q);
    if (q.stock === 'out') where.currentStock = 0;
    if (q.stock === 'low') {
      where.currentStock = {
        gt: 0,
        lte: this.prisma.product.fields.minimumStock,
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: productInclude,
        orderBy: { [q.sortBy]: q.sortOrder },
        ...skipTake(q.page, q.limit),
      }),
      this.prisma.product.count({ where }),
    ]);
    return { data, meta: buildMeta(q.page, q.limit, total) };
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        ...productInclude,
        movements: {
          take: 10,
          orderBy: [{ movementDate: 'desc' }, { createdAt: 'desc' }],
          include: { createdBy: { select: { id: true, name: true } } },
        },
      },
    });
    if (!product) throw new NotFoundException('រកមិនឃើញទំនិញ');
    return product;
  }

  async create(dto: CreateProductDto, actor: Actor) {
    await this.assertCategoryPair(dto.categoryId, dto.subcategoryId, null);
    const { initialStock = 0, ...data } = dto;

    const product = await this.prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: { ...data, currentStock: initialStock },
        include: productInclude,
      });

      if (initialStock > 0) {
        await tx.stockMovement.create({
          data: {
            referenceNo: generateReference('OPEN'),
            type: MovementType.STOCK_IN,
            productId: created.id,
            supplierId: created.supplierId,
            quantity: initialStock,
            previousStock: 0,
            newStock: initialStock,
            unitCost: created.purchasePrice,
            totalCost: new Prisma.Decimal(created.purchasePrice).mul(initialStock),
            reason: 'Opening stock',
            note: 'ស្តុកដំបូងពេលបង្កើតទំនិញ',
            createdById: actor.id,
          },
        });
      }

      await this.audit.log(
        {
          userId: actor.id,
          action: AuditAction.CREATE,
          module: 'product',
          recordId: created.id,
          newData: toJson(created),
          ipAddress: actor.ip,
        },
        tx,
      );
      return created;
    });
    return product;
  }

  async update(id: string, dto: UpdateProductDto, actor: Actor) {
    const before = await this.prisma.product.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('រកមិនឃើញទំនិញ');

    const categoryId = dto.categoryId ?? before.categoryId;
    const subcategoryId =
      dto.subcategoryId === undefined ? before.subcategoryId : dto.subcategoryId;
    await this.assertCategoryPair(categoryId, subcategoryId, before);

    const product = await this.prisma.product.update({
      where: { id },
      data: dto,
      include: productInclude,
    });
    await this.audit.log({
      userId: actor.id,
      action: AuditAction.UPDATE,
      module: 'product',
      recordId: id,
      oldData: toJson(before),
      newData: toJson(product),
      ipAddress: actor.ip,
    });

    // The image was replaced or cleared: remove the old file from storage
    if (before.image && before.image !== product.image) {
      await this.releaseImage(before.image, id);
    }
    return product;
  }

  async remove(id: string, actor: Actor) {
    const before = await this.prisma.product.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('រកមិនឃើញទំនិញ');

    const movements = await this.prisma.stockMovement.count({ where: { productId: id } });
    if (movements > 0) {
      throw new ConflictException(
        'ទំនិញនេះមានប្រវត្តិស្តុករួចហើយ មិនអាចលុបបានទេ។ សូមប្តូរស្ថានភាពទៅ "មិនសកម្ម" ជំនួស។',
      );
    }

    await this.prisma.product.delete({ where: { id } });
    await this.audit.log({
      userId: actor.id,
      action: AuditAction.DELETE,
      module: 'product',
      recordId: id,
      oldData: toJson(before),
      ipAddress: actor.ip,
    });
    await this.releaseImage(before.image, id);
    return null;
  }

  /** Delete an image file unless another product still points at it. Never throws. */
  private async releaseImage(url: string | null, exceptProductId: string) {
    if (!url) return;
    const stillUsed = await this.prisma.product.count({
      where: { image: url, id: { not: exceptProductId } },
    });
    if (!stillUsed) await this.storage.deleteByUrl(url);
  }

  /**
   * A subcategory must belong to the product's category, and a product can only be
   * (newly) put into an ACTIVE category/subcategory. A product that already sits in a
   * category that was later deactivated may keep it, so unrelated edits still save.
   */
  private async assertCategoryPair(
    categoryId: string,
    subcategoryId: string | null | undefined,
    current: { categoryId: string; subcategoryId: string | null } | null,
  ) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { status: true },
    });
    if (!category) throw new BadRequestException('ប្រភេទទំនិញមិនត្រឹមត្រូវ');
    if (category.status !== 'ACTIVE' && current?.categoryId !== categoryId) {
      throw new BadRequestException('ប្រភេទទំនិញនេះមិនសកម្មទេ');
    }
    if (!subcategoryId) return;

    const sub = await this.prisma.subcategory.findUnique({
      where: { id: subcategoryId },
      select: { categoryId: true, status: true },
    });
    if (!sub || sub.categoryId !== categoryId) {
      throw new BadRequestException('ប្រភេទរងមិនស្ថិតក្នុងប្រភេទទំនិញដែលបានជ្រើសទេ');
    }
    if (sub.status !== 'ACTIVE' && current?.subcategoryId !== subcategoryId) {
      throw new BadRequestException('ប្រភេទរងនេះមិនសកម្មទេ');
    }
  }
}
