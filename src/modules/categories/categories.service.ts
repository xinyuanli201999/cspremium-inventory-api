import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { ReorderItemsDto } from '../../common/dto/reorder.dto';
import { Actor } from '../../common/types/auth.types';
import { toJson } from '../../common/utils/json.util';
import { slugify } from '../../common/utils/slugify.util';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import {
  CategoryQueryDto,
  CreateCategoryDto,
  UpdateCategoryDto,
} from './dto/category.dto';

const withChildren = {
  subcategories: {
    orderBy: { sortOrder: 'asc' },
    include: { _count: { select: { products: true } } },
  },
  _count: { select: { products: true, subcategories: true } },
} satisfies Prisma.CategoryInclude;

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogsService,
  ) {}

  /** All categories with their subcategories, ordered by sortOrder. */
  findAll(q: CategoryQueryDto = {}) {
    return this.prisma.category.findMany({
      where: {
        ...(q.status ? { status: q.status } : {}),
        ...(q.search
          ? {
              OR: [
                { name: { contains: q.search, mode: 'insensitive' } },
                { nameKh: { contains: q.search, mode: 'insensitive' } },
                { slug: { contains: q.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { sortOrder: 'asc' },
      include: withChildren,
    });
  }

  async findOne(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: withChildren,
    });
    if (!category) throw new NotFoundException('រកមិនឃើញប្រភេទទំនិញ');
    return category;
  }

  async create(dto: CreateCategoryDto, actor: Actor) {
    const slug = dto.slug ?? slugify(dto.name);
    if (!slug) throw new BadRequestException('សូមបញ្ចូល slug');

    const { _max } = await this.prisma.category.aggregate({
      _max: { sortOrder: true },
    });
    const category = await this.prisma.category.create({
      data: { ...dto, slug, sortOrder: (_max.sortOrder ?? 0) + 1 },
    });
    await this.audit.log({
      userId: actor.id,
      action: AuditAction.CREATE,
      module: 'category',
      recordId: category.id,
      newData: toJson(category),
      ipAddress: actor.ip,
    });
    return category;
  }

  async update(id: string, dto: UpdateCategoryDto, actor: Actor) {
    const before = await this.findOne(id);
    const { subcategories: _s, _count: _c, ...beforeData } = before;
    const category = await this.prisma.category.update({
      where: { id },
      data: dto,
    });
    await this.audit.log({
      userId: actor.id,
      action: AuditAction.UPDATE,
      module: 'category',
      recordId: id,
      oldData: toJson(beforeData),
      newData: toJson(category),
      ipAddress: actor.ip,
    });
    return category;
  }

  async remove(id: string, actor: Actor) {
    const category = await this.findOne(id);
    const { subcategories: subCount, products: productCount } = category._count;

    if (productCount > 0 || subCount > 0) {
      const parts = [
        subCount > 0 ? `${subCount} ប្រភេទរង` : null,
        productCount > 0 ? `${productCount} ទំនិញ` : null,
      ].filter(Boolean);
      throw new ConflictException(
        `មិនអាចលុបបានទេ ព្រោះមាន ${parts.join(' និង ')}។ សូមប្តូរស្ថានភាពទៅ "មិនសកម្ម" ជំនួស។`,
      );
    }

    const { subcategories: _s, _count: _c, ...data } = category;
    await this.prisma.category.delete({ where: { id } });
    await this.audit.log({
      userId: actor.id,
      action: AuditAction.DELETE,
      module: 'category',
      recordId: id,
      oldData: toJson(data),
      ipAddress: actor.ip,
    });
    return null;
  }

  async reorder(dto: ReorderItemsDto, actor: Actor) {
    const ids = dto.items.map((i) => i.id);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('មាន ID ស្ទួនក្នុងបញ្ជី');
    }

    await this.prisma.$transaction(async (tx) => {
      const found = await tx.category.count({ where: { id: { in: ids } } });
      if (found !== ids.length) throw new NotFoundException('រកមិនឃើញប្រភេទទំនិញមួយចំនួន');

      for (const item of dto.items) {
        await tx.category.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        });
      }
      await this.audit.log(
        {
          userId: actor.id,
          action: AuditAction.REORDER,
          module: 'category',
          newData: toJson(dto.items),
          ipAddress: actor.ip,
        },
        tx,
      );
    });
    return this.findAll();
  }
}
