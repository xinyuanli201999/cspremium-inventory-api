import { Prisma } from '@prisma/client';

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const toNum = (d: Prisma.Decimal | number | null | undefined) =>
  d == null ? 0 : Number(d);

export const displayName = (p: { name: string; nameKh?: string | null }) =>
  p.nameKh ? `${p.name} (${p.nameKh})` : p.name;

export const stockState = (stock: number, min: number) =>
  stock <= 0 ? 'អស់ស្តុក' : stock <= min ? 'ស្តុកទាប' : 'ធម្មតា';
