import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { AuditAction, Role, Status } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { sha256 } from '../../common/utils/hash.util';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';

// Keeps response time equal when the email does not exist
const DUMMY_HASH = bcrypt.hashSync('dummy-password', 12);
const SESSION_EXPIRED = 'Session បានផុតកំណត់ សូម Login ម្តងទៀត';
const REUSE_GRACE_MS = 10_000;

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: Role;
}

const toPublicUser = (u: UserRow) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
});

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditLogsService,
  ) {}

  async login(dto: LoginDto, ip?: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    const passwordOk = await bcrypt.compare(
      dto.password,
      user?.passwordHash ?? DUMMY_HASH,
    );
    if (!user || !passwordOk || user.status !== Status.ACTIVE) {
      throw new UnauthorizedException('អ៊ីមែល ឬពាក្យសម្ងាត់មិនត្រឹមត្រូវ');
    }

    const tokens = await this.issueTokens(user);
    await this.audit.log({
      userId: user.id,
      action: AuditAction.LOGIN,
      module: 'auth',
      recordId: user.id,
      ipAddress: ip,
    });

    return { ...tokens, user: toPublicUser(user) };
  }

  async refresh(token?: string) {
    if (!token) throw new UnauthorizedException(SESSION_EXPIRED);

    try {
      await this.jwt.verifyAsync(token, {
        secret: this.config.getOrThrow<string>('auth.jwtRefreshSecret'),
      });
    } catch {
      throw new UnauthorizedException(SESSION_EXPIRED);
    }

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(token) },
    });
    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException(SESSION_EXPIRED);
    }

    if (stored.revokedAt) {
      // A rotated token was used again. A short grace window covers two tabs
      // refreshing at the same moment; anything later is treated as theft.
      if (Date.now() - stored.revokedAt.getTime() > REUSE_GRACE_MS) {
        await this.revokeAllForUser(stored.userId);
      }
      throw new UnauthorizedException(SESSION_EXPIRED);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: stored.userId },
    });
    if (!user || user.status !== Status.ACTIVE) {
      throw new UnauthorizedException(SESSION_EXPIRED);
    }

    // Atomic rotate: only one concurrent request can revoke the token
    const rotated = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (rotated.count === 0) throw new UnauthorizedException(SESSION_EXPIRED);

    const tokens = await this.issueTokens(user);
    return { ...tokens, user: toPublicUser(user) };
  }

  async logout(token?: string) {
    if (!token) return;
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  me(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true },
    });
  }

  async changePassword(userId: string, dto: ChangePasswordDto, ip?: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (!(await bcrypt.compare(dto.currentPassword, user.passwordHash))) {
      throw new BadRequestException('ពាក្យសម្ងាត់បច្ចុប្បន្នមិនត្រឹមត្រូវ');
    }
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('ពាក្យសម្ងាត់ថ្មីត្រូវខុសពីពាក្យសម្ងាត់ចាស់');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(dto.newPassword, 12) },
    });
    await this.revokeAllForUser(userId); // sign out everywhere
    await this.audit.log({
      userId,
      action: AuditAction.UPDATE,
      module: 'auth',
      recordId: userId,
      newData: { event: 'password-changed' },
      ipAddress: ip,
    });
    return null;
  }

  private revokeAllForUser(userId: string) {
    return this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokens(user: UserRow) {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email, role: user.role },
      {
        secret: this.config.getOrThrow<string>('auth.jwtSecret'),
        expiresIn: this.config.getOrThrow<string>(
          'auth.accessExpiresIn',
        ) as JwtSignOptions['expiresIn'],
      },
    );

    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, jti: randomUUID() },
      {
        secret: this.config.getOrThrow<string>('auth.jwtRefreshSecret'),
        expiresIn: this.config.getOrThrow<string>(
          'auth.refreshExpiresIn',
        ) as JwtSignOptions['expiresIn'],
      },
    );

    const { exp } = this.jwt.decode<{ exp: number }>(refreshToken);
    const expiresAt = new Date(exp * 1000);

    await this.prisma.refreshToken.create({
      data: { userId: user.id, tokenHash: sha256(refreshToken), expiresAt },
    });

    return { accessToken, refreshToken, expiresAt };
  }
}
