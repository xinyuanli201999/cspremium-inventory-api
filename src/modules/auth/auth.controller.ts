import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { CurrentActor } from '../../common/decorators/current-actor.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Actor, AuthUser } from '../../common/types/auth.types';
import { REFRESH_COOKIE, REFRESH_COOKIE_PATH } from './auth.constants';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken, expiresAt, user } =
      await this.auth.login(dto, req.ip);
    this.setRefreshCookie(res, refreshToken, expiresAt);
    return { accessToken, user };
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(200)
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookies = (req.cookies ?? {}) as Record<string, string | undefined>;
    try {
      const { accessToken, refreshToken, expiresAt, user } =
        await this.auth.refresh(cookies[REFRESH_COOKIE]);
      this.setRefreshCookie(res, refreshToken, expiresAt);
      return { accessToken, user };
    } catch (err) {
      res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
      throw err;
    }
  }

  @Public()
  @HttpCode(200)
  @Post('logout')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookies = (req.cookies ?? {}) as Record<string, string | undefined>;
    await this.auth.logout(cookies[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
    return null;
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  @HttpCode(200)
  @Post('change-password')
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentActor() actor: Actor,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.changePassword(actor.id, dto, actor.ip);
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
    return { message: 'ប្តូរពាក្យសម្ងាត់ជោគជ័យ សូម Login ម្តងទៀត', data: null };
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get('app.env') === 'production',
      sameSite: 'none',
      path: REFRESH_COOKIE_PATH,
    };
  }

  private setRefreshCookie(res: Response, token: string, expiresAt: Date) {
    res.cookie(REFRESH_COOKIE, token, {
      ...this.cookieOptions(),
      maxAge: expiresAt.getTime() - Date.now(),
    });
  }
}
