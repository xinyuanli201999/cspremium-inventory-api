import { randomBytes } from 'crypto';
import { formatYmd } from './date.util';

export type ReferencePrefix = 'SI' | 'SO' | 'ADJ' | 'OPEN';

/** e.g. SI-20260929-A1B2C3 */
export function generateReference(
  prefix: ReferencePrefix,
  date: Date = new Date(),
): string {
  const ymd = formatYmd(date).replaceAll('-', '');
  return `${prefix}-${ymd}-${randomBytes(3).toString('hex').toUpperCase()}`;
}
