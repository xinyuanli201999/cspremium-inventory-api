import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, MovementType, Prisma } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { Actor } from '../../common/types/auth.types';
import { toJson } from '../../common/utils/json.util';
import { buildMeta, skipTake } from '../../common/utils/pagination.util';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { movementInclude } from '../inventory/movement-filters';
import {
  CreateSupplierDto,
  SupplierQueryDto,
  UpdateSupplierDto,
} from './dto/supplier.dto';

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogsService,
  ) {}

  async findAll(q: SupplierQueryDto) {
    const where: Prisma.SupplierWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.search
        ? {
            OR: [
              { companyName: { contains: q.search, mode: 'insensitive' } },
              { contactPerson: { contains: q.search, mode: 'insensitive' } },
              { phone: { contains: q.search, mode: 'insensitive' } },
              { email: { contains: q.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.supplier.findMany({
        where,
        orderBy: { companyName: 'asc' },
        include: { _count: { select: { products: true } } },
        ...skipTake(q.page, q.limit),
      }),
      this.prisma.supplier.count({ where }),
    ]);
    return { data, meta: buildMeta(q.page, q.limit, total) };
  }

  async findOne(id: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id },
      include: { _count: { select: { products: true, movements: true } } },
    });
    if (!supplier) throw new NotFoundException('រកមិនឃើញអ្នកផ្គត់ផ្គង់');
    return supplier;
  }

  async products(id: string, q: PaginationQueryDto) {
    await this.findOne(id);
    const where: Prisma.ProductWhereInput = {
      supplierId: id,
      ...(q.search
        ? {
            OR: [
              { name: { contains: q.search, mode: 'insensitive' } },
              { sku: { contains: q.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy: { name: 'asc' },
        include: { category: { select: { id: true, name: true, nameKh: true } } },
        ...skipTake(q.page, q.limit),
      }),
      this.prisma.product.count({ where }),
    ]);
    return { data, meta: buildMeta(q.page, q.limit, total) };
  }

  async stockInHistory(id: string, q: PaginationQueryDto) {
    await this.findOne(id);
    const where: Prisma.StockMovementWhereInput = {
      supplierId: id,
      type: MovementType.STOCK_IN,
    };
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

  async create(dto: CreateSupplierDto, actor: Actor) {
    const supplier = await this.prisma.supplier.create({ data: dto });
    await this.audit.log({
      userId: actor.id,
      action: AuditAction.CREATE,
      module: 'supplier',
      recordId: supplier.id,
      newData: toJson(supplier),
      ipAddress: actor.ip,
    });
    return supplier;
  }

  async update(id: string, dto: UpdateSupplierDto, actor: Actor) {
    const before = await this.prisma.supplier.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('រកមិនឃើញអ្នកផ្គត់ផ្គង់');
    const supplier = await this.prisma.supplier.update({ where: { id }, data: dto });
    await this.audit.log({
      userId: actor.id,
      action: AuditAction.UPDATE,
      module: 'supplier',
      recordId: id,
      oldData: toJson(before),
      newData: toJson(supplier),
      ipAddress: actor.ip,
    });
    return supplier;
  }

  async remove(id: string, actor: Actor) {
    const supplier = await this.findOne(id);
    if (supplier._count.products > 0 || supplier._count.movements > 0) {
      throw new ConflictException(
        'អ្នកផ្គត់ផ្គង់នេះមានទំនិញ ឬប្រវត្តិទំនិញចូល មិនអាចលុបបានទេ។ សូមប្តូរស្ថានភាពទៅ "មិនសកម្ម" ជំនួស។',
      );
    }
    const { _count, ...data } = supplier;
    await this.prisma.supplier.delete({ where: { id } });
    await this.audit.log({
      userId: actor.id,
      action: AuditAction.DELETE,
      module: 'supplier',
      recordId: id,
      oldData: toJson(data),
      ipAddress: actor.ip,
    });
    return null;
  }
}
