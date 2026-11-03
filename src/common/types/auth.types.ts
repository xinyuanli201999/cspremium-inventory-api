import { Role } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}

/** Who is performing an action, plus where from (for audit logs). */
export interface Actor {
  id: string;
  role: Role;
  ip?: string;
}
