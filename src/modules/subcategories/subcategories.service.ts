import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction } from '@prisma/client';
import { Actor } from '../../common/types/auth.types';
import { toJson } from '../../common/utils/json.util';
import { slugify } from '../../common/utils/slugify.util';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import {
  CreateSubcategoryDto,
  ReorderSubcategoriesDto,
  UpdateSubcategoryDto,
} from './dto/subcategory.dto';

@Injectable()
export class SubcategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogsService,
  ) {}

  async findByCategory(categoryId: string) {
    await this.assertCategory(categoryId);
    return this.prisma.subcategory.findMany({
      where: { categoryId },
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { products: true } } },
    });
  }

  async create(categoryId: string, dto: CreateSubcategoryDto, actor: Actor) {
    await this.assertCategory(categoryId);
    const slug = dto.slug ?? slugify(dto.name);
    if (!slug) throw new BadRequestException('សូមបញ្ចូល slug');

    const { _max } = await this.prisma.subcategory.aggregate({
      where: { categoryId },
      _max: { sortOrder: true },
    });
    const sub = await this.prisma.subcategory.create({
      data: { ...dto, slug, categoryId, sortOrder: (_max.sortOrder ?? 0) + 1 },
    });
    await this.audit.log({
      userId: actor.id,
      action: AuditAction.CREATE,
      module: 'subcategory',
      recordId: sub.id,
      newData: toJson(sub),
      ipAddress: actor.ip,
    });
    return sub;
  }

  async update(id: string, dto: UpdateSubcategoryDto, actor: Actor) {
    const before = await this.getOrThrow(id);
    const sub = await this.prisma.subcategory.update({ where: { id }, data: dto });
    await this.audit.log({
      userId: actor.id,
      action: AuditAction.UPDATE,
      module: 'subcategory',
      recordId: id,
      oldData: toJson(before),
      newData: toJson(sub),
      ipAddress: actor.ip,
    });
    return sub;
  }

  async remove(id: string, actor: Actor) {
    const before = await this.getOrThrow(id);
    const products = await this.prisma.product.count({ where: { subcategoryId: id } });
    if (products > 0) {
      throw new ConflictException(
        `មិនអាចលុបបានទេ ព្រោះមាន ${products} ទំនិញ។ សូមប្តូរស្ថានភាពទៅ "មិនសកម្ម" ជំនួស។`,
      );
    }
    await this.prisma.subcategory.delete({ where: { id } });
    await this.audit.log({
      userId: actor.id,
      action: AuditAction.DELETE,
      module: 'subcategory',
      recordId: id,
      oldData: toJson(before),
      ipAddress: actor.ip,
    });
    return null;
  }

  async reorder(dto: ReorderSubcategoriesDto, actor: Actor) {
    await this.assertCategory(dto.categoryId);
    const ids = dto.items.map((i) => i.id);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('មាន ID ស្ទួនក្នុងបញ្ជី');
    }

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.subcategory.findMany({
        where: { id: { in: ids } },
        select: { id: true, categoryId: true },
      });
      if (existing.length !== ids.length) {
        throw new NotFoundException('រកមិនឃើញប្រភេទរងមួយចំនួន');
      }

      // Subcategories moved to another category: keep their products in sync
      const moved = existing.filter((s) => s.categoryId !== dto.categoryId);
      if (moved.length) {
        await tx.product.updateMany({
          where: { subcategoryId: { in: moved.map((m) => m.id) } },
          data: { categoryId: dto.categoryId },
        });
      }

      for (const item of dto.items) {
        await tx.subcategory.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder, categoryId: dto.categoryId },
        });
      }

      await this.audit.log(
        {
          userId: actor.id,
          action: AuditAction.REORDER,
          module: 'subcategory',
          recordId: dto.categoryId,
          oldData: toJson(existing),
          newData: toJson(dto),
          ipAddress: actor.ip,
        },
        tx,
      );
    });

    return this.findByCategory(dto.categoryId);
  }

  private async getOrThrow(id: string) {
    const sub = await this.prisma.subcategory.findUnique({ where: { id } });
    if (!sub) throw new NotFoundException('រកមិនឃើញប្រភេទរង');
    return sub;
  }

  private async assertCategory(id: string) {
    const exists = await this.prisma.category.count({ where: { id } });
    if (!exists) throw new NotFoundException('រកមិនឃើញប្រភេទទំនិញ');
  }
}
