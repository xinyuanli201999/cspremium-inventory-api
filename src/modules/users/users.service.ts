import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, Prisma, Status } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { Actor } from '../../common/types/auth.types';
import { toJson } from '../../common/utils/json.util';
import { buildMeta, skipTake } from '../../common/utils/pagination.util';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CreateUserDto, UpdateUserDto, UserQueryDto } from './dto/user.dto';

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogsService,
  ) {}

  async findAll(q: UserQueryDto) {
    const where: Prisma.UserWhereInput = {
      ...(q.role ? { role: q.role } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.search
        ? {
            OR: [
              { name: { contains: q.search, mode: 'insensitive' } },
              { email: { contains: q.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: userSelect,
        orderBy: { createdAt: 'desc' },
        ...skipTake(q.page, q.limit),
      }),
      this.prisma.user.count({ where }),
    ]);
    return { data, meta: buildMeta(q.page, q.limit, total) };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: userSelect,
    });
    if (!user) throw new NotFoundException('រកមិនឃើញអ្នកប្រើប្រាស់');
    return user;
  }

  async create(dto: CreateUserDto, actor: Actor) {
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        role: dto.role,
        status: dto.status ?? Status.ACTIVE,
        passwordHash: await bcrypt.hash(dto.password, 12),
      },
      select: userSelect,
    });
    await this.audit.log({
      userId: actor.id,
      action: AuditAction.CREATE,
      module: 'user',
      recordId: user.id,
      newData: toJson(user),
      ipAddress: actor.ip,
    });
    return user;
  }

  async update(id: string, dto: UpdateUserDto, actor: Actor) {
    const before = await this.findOne(id);

    if (id === actor.id) {
      if (dto.role && dto.role !== before.role) {
        throw new BadRequestException('មិនអាចប្តូរ Role របស់ខ្លួនឯងបានទេ');
      }
      if (dto.status === Status.INACTIVE) {
        throw new BadRequestException('មិនអាចបិទគណនីរបស់ខ្លួនឯងបានទេ');
      }
    }

    const { password, ...rest } = dto;
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...rest,
        ...(password ? { passwordHash: await bcrypt.hash(password, 12) } : {}),
      },
      select: userSelect,
    });

    // Password reset or deactivation must end existing sessions
    if (password || dto.status === Status.INACTIVE) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    await this.audit.log({
      userId: actor.id,
      action: AuditAction.UPDATE,
      module: 'user',
      recordId: id,
      oldData: toJson(before),
      newData: toJson({ ...user, ...(password ? { passwordChanged: true } : {}) }),
      ipAddress: actor.ip,
    });
    return user;
  }
}
