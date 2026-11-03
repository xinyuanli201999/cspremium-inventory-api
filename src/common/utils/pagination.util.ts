import { PaginationMeta } from '../interceptors/response.interceptor';

export function buildMeta(
  page: number,
  limit: number,
  total: number,
  totals?: Record<string, number>,
): PaginationMeta {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    ...(totals ? { totals } : {}),
  };
}

export const skipTake = (page: number, limit: number) => ({
  skip: (page - 1) * limit,
  take: limit,
});
