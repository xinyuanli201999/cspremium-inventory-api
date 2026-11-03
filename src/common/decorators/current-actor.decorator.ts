import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { Actor, AuthUser } from '../types/auth.types';

/** Injects { id, role, ip } of the authenticated caller. */
export const CurrentActor = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Actor => {
    const req = ctx.switchToHttp().getRequest<Request & { user: AuthUser }>();
    return { id: req.user.id, role: req.user.role, ip: req.ip };
  },
);
