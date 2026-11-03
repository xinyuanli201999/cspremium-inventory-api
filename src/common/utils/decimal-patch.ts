import { Prisma } from '@prisma/client';

/**
 * Prisma serialises Decimal as a string. The frontend works with numbers, and
 * our Decimal(12,2) columns are safe as doubles, so serialise as number.
 */
(Prisma.Decimal.prototype as unknown as { toJSON: () => number }).toJSON =
  function toJSON(this: Prisma.Decimal) {
    return this.toNumber();
  };
