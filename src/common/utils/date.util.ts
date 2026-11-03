/**
 * Date helpers. The process runs in APP_TIMEZONE (set in main.ts), so "local"
 * below means the business timezone.
 */
export function startOfDay(d: Date = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function parseDateStart(s?: string): Date | undefined {
  if (!s) return undefined;
  const d = s.length === 10 ? new Date(`${s}T00:00:00`) : new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function parseDateEnd(s?: string): Date | undefined {
  if (!s) return undefined;
  const d = s.length === 10 ? new Date(`${s}T23:59:59.999`) : new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function dateRange(from?: string, to?: string) {
  const gte = parseDateStart(from);
  const lte = parseDateEnd(to);
  if (!gte && !lte) return undefined;
  return { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) };
}

/** yyyy-mm-dd in the business timezone. */
export function formatYmd(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
