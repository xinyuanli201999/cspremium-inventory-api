import { Injectable } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { dateRange } from '../../common/utils/date.util';
import { buildMeta, skipTake } from '../../common/utils/pagination.util';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';

export interface AuditEntry {
  userId?: string | null;
  action: AuditAction;
  module: string;
  recordId?: string;
  oldData?: Prisma.InputJsonValue;
  newData?: Prisma.InputJsonValue;
  ipAddress?: string;
}

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Pass `tx` to write the log inside the caller's transaction. */
  async log(entry: AuditEntry, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    await client.auditLog.create({ data: entry });
  }

  async findAll(q: AuditLogQueryDto) {
    const where: Prisma.AuditLogWhereInput = {
      ...(q.module ? { module: q.module } : {}),
      ...(q.action ? { action: q.action } : {}),
      ...(q.userId ? { userId: q.userId } : {}),
      ...(q.recordId ? { recordId: q.recordId } : {}),
    };
    const createdAt = dateRange(q.dateFrom, q.dateTo);
    if (createdAt) where.createdAt = createdAt;
    if (q.search) {
      where.OR = [
        { module: { contains: q.search, mode: 'insensitive' } },
        { recordId: { contains: q.search, mode: 'insensitive' } },
        { user: { name: { contains: q.search, mode: 'insensitive' } } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, name: true, email: true } } },
        ...skipTake(q.page, q.limit),
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { data, meta: buildMeta(q.page, q.limit, total) };
  }
}
