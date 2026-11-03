import { Prisma } from '@prisma/client';

/** Convert Prisma results (Decimal, Date) into plain JSON for audit logs. */
export function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}
