import {
  BadRequestException,
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
import {
  MovementQueryDto,
  StockAdjustmentDto,
  StockInDto,
  StockOutDto,
} from './dto/inventory.dto';
import { buildMovementWhere, movementInclude } from './movement-filters';

/**
 * The ONLY place where Product.currentStock is changed.
 * Every operation runs in one transaction: update stock + write movement + write audit log.
 */
@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogsService,
  ) {}

  async stockIn(dto: StockInDto, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const product = await this.getProduct(tx, dto.productId, { requireActive: true });

      if (dto.supplierId) {
        const supplier = await tx.supplier.count({ where: { id: dto.supplierId } });
        if (!supplier) throw new BadRequestException('រកមិនឃើញអ្នកផ្គត់ផ្គង់');
      }

      const unitCost = new Prisma.Decimal(dto.unitCost ?? product.purchasePrice);
      const totalCost = unitCost.mul(dto.quantity);

      // Atomic increment; latest purchase price becomes the product's cost price
      const updated = await tx.product.update({
        where: { id: product.id },
        data: { currentStock: { increment: dto.quantity }, purchasePrice: unitCost },
        select: { currentStock: true },
      });
      const newStock = updated.currentStock;

      const movement = await tx.stockMovement.create({
        data: {
          referenceNo: dto.referenceNo || generateReference('SI'),
          type: MovementType.STOCK_IN,
          productId: product.id,
          supplierId: dto.supplierId ?? null,
          quantity: dto.quantity,
          previousStock: newStock - dto.quantity,
          newStock,
          unitCost,
          totalCost,
          note: dto.note ?? null,
          movementDate: dto.date ? new Date(dto.date) : new Date(),
          createdById: actor.id,
        },
        include: movementInclude,
      });

      await this.audit.log(
        {
          userId: actor.id,
          action: AuditAction.STOCK_IN,
          module: 'inventory',
          recordId: movement.id,
          oldData: { productId: product.id, stock: newStock - dto.quantity },
          newData: toJson(movement),
          ipAddress: actor.ip,
        },
        tx,
      );
      return movement;
    });
  }

  async stockOut(dto: StockOutDto, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const product = await this.getProduct(tx, dto.productId, { requireActive: true });

      // Guarded decrement: succeeds only if enough stock is left, even under concurrency
      const result = await tx.product.updateMany({
        where: { id: product.id, currentStock: { gte: dto.quantity } },
        data: { currentStock: { decrement: dto.quantity } },
      });
      if (result.count === 0) {
        const fresh = await tx.product.findUniqueOrThrow({
          where: { id: product.id },
          select: { currentStock: true },
        });
        throw new BadRequestException(
          `ស្តុកមិនគ្រប់គ្រាន់ — មានតែ ${fresh.currentStock} ${product.unit.toLowerCase()} ប៉ុណ្ណោះ (ស្នើ ${dto.quantity})`,
        );
      }

      const { currentStock: newStock } = await tx.product.findUniqueOrThrow({
        where: { id: product.id },
        select: { currentStock: true },
      });

      const movement = await tx.stockMovement.create({
        data: {
          referenceNo: dto.referenceNo || generateReference('SO'),
          type: MovementType.STOCK_OUT,
          productId: product.id,
          quantity: dto.quantity,
          previousStock: newStock + dto.quantity,
          newStock,
          reason: dto.reason,
          party: dto.party ?? null,
          note: dto.note ?? null,
          movementDate: dto.date ? new Date(dto.date) : new Date(),
          createdById: actor.id,
        },
        include: movementInclude,
      });

      await this.audit.log(
        {
          userId: actor.id,
          action: AuditAction.STOCK_OUT,
          module: 'inventory',
          recordId: movement.id,
          oldData: { productId: product.id, stock: newStock + dto.quantity },
          newData: toJson(movement),
          ipAddress: actor.ip,
        },
        tx,
      );
      return movement;
    });
  }

  async adjust(dto: StockAdjustmentDto, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      await this.getProduct(tx, dto.productId, { requireActive: false });

      // Lock the row so the "old quantity" we record cannot change underneath us
      const rows = await tx.$queryRaw<{ currentStock: number }[]>`
        SELECT "currentStock" FROM "Product" WHERE "id" = ${dto.productId} FOR UPDATE`;
      const oldQuantity = rows[0].currentStock;
      const difference = dto.newQuantity - oldQuantity;

      if (difference === 0) {
        throw new BadRequestException('ចំនួនថ្មីដូចចំនួនបច្ចុប្បន្ន មិនចាំបាច់កែសម្រួលទេ');
      }

      await tx.product.update({
        where: { id: dto.productId },
        data: { currentStock: dto.newQuantity },
      });

      const when = dto.date ? new Date(dto.date) : new Date();
      const movement = await tx.stockMovement.create({
        data: {
          referenceNo: generateReference('ADJ'),
          type: MovementType.ADJUSTMENT,
          productId: dto.productId,
          quantity: Math.abs(difference),
          previousStock: oldQuantity,
          newStock: dto.newQuantity,
          reason: dto.reason,
          note: dto.note ?? null,
          movementDate: when,
          createdById: actor.id,
          adjustment: {
            create: {
              productId: dto.productId,
              oldQuantity,
              newQuantity: dto.newQuantity,
              difference,
              reason: dto.reason,
              note: dto.note ?? null,
              adjustedById: actor.id,
              adjustedAt: when,
            },
          },
        },
        include: movementInclude,
      });

      await this.audit.log(
        {
          userId: actor.id,
          action: AuditAction.ADJUSTMENT,
          module: 'inventory',
          recordId: movement.id,
          oldData: { productId: dto.productId, stock: oldQuantity },
          newData: toJson(movement),
          ipAddress: actor.ip,
        },
        tx,
      );
      return movement;
    });
  }

  async findMovements(q: MovementQueryDto) {
    const where = buildMovementWhere(q);
    const [data, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        include: movementInclude,
        orderBy: [{ movementDate: 'desc' }, { createdAt: 'desc' }],
        ...skipTake(q.page, q.limit),
      }),
      this.prisma.stockMovement.count({ where }),
    ]);
    return { data, meta: buildMeta(q.page, q.limit, total) };
  }

  private async getProduct(
    tx: Prisma.TransactionClient,
    id: string,
    opts: { requireActive: boolean },
  ) {
    const product = await tx.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('រកមិនឃើញទំនិញ');
    if (opts.requireActive && product.status !== Status.ACTIVE) {
      throw new BadRequestException('ទំនិញនេះមិនសកម្ម មិនអាចធ្វើប្រតិបត្តិការស្តុកបានទេ');
    }
    return product;
  }
}
