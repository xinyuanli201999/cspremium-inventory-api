import { BadRequestException } from '@nestjs/common';
import { Role, Status } from '@prisma/client';
import { InventoryService } from './inventory.service';

const actor = { id: 'user-1', role: Role.STAFF } as const;
const product = {
  id: 'p1',
  status: Status.ACTIVE,
  unit: 'PIECE',
  purchasePrice: 2,
  currentStock: 10,
};

/** Minimal Prisma double: $transaction just runs the callback with a fake tx. */
function makeService(tx: Record<string, unknown>) {
  const prisma = { $transaction: (fn: (t: unknown) => unknown) => fn(tx) };
  const audit = { log: jest.fn() };
  return {
    service: new InventoryService(prisma as never, audit as never),
    audit,
  };
}

describe('InventoryService', () => {
  it('rejects stock out that exceeds current stock', async () => {
    const tx = {
      product: {
        findUnique: jest.fn().mockResolvedValue(product),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }), // guarded decrement failed
        findUniqueOrThrow: jest.fn().mockResolvedValue({ currentStock: 10 }),
      },
      stockMovement: { create: jest.fn() },
    };
    const { service, audit } = makeService(tx);

    await expect(
      service.stockOut({ productId: 'p1', quantity: 11, reason: 'Sale' }, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('records movement and audit log on a valid stock out', async () => {
    const tx = {
      product: {
        findUnique: jest.fn().mockResolvedValue(product),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ currentStock: 6 }),
      },
      stockMovement: { create: jest.fn().mockResolvedValue({ id: 'm1' }) },
    };
    const { service, audit } = makeService(tx);

    await service.stockOut({ productId: 'p1', quantity: 4, reason: 'Sale' }, actor);

    const data = tx.stockMovement.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ type: 'STOCK_OUT', quantity: 4, previousStock: 10, newStock: 6 });
    expect(audit.log).toHaveBeenCalledTimes(1);
  });

  it('refuses stock movements for inactive products', async () => {
    const tx = {
      product: {
        findUnique: jest.fn().mockResolvedValue({ ...product, status: Status.INACTIVE }),
      },
    };
    const { service } = makeService(tx);
    await expect(
      service.stockIn({ productId: 'p1', quantity: 1 }, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an adjustment that changes nothing', async () => {
    const tx = {
      product: { findUnique: jest.fn().mockResolvedValue(product) },
      $queryRaw: jest.fn().mockResolvedValue([{ currentStock: 10 }]),
    };
    const { service } = makeService(tx);
    await expect(
      service.adjust({ productId: 'p1', newQuantity: 10, reason: 'Count' }, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('stores the signed difference for adjustments', async () => {
    const tx = {
      product: {
        findUnique: jest.fn().mockResolvedValue(product),
        update: jest.fn(),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ currentStock: 10 }]),
      stockMovement: { create: jest.fn().mockResolvedValue({ id: 'm1' }) },
    };
    const { service } = makeService(tx);

    await service.adjust({ productId: 'p1', newQuantity: 7, reason: 'Damaged' }, {
      id: 'admin',
      role: Role.ADMIN,
    });

    const data = tx.stockMovement.create.mock.calls[0][0].data;
    expect(data.quantity).toBe(3);
    expect(data.adjustment.create).toMatchObject({ oldQuantity: 10, newQuantity: 7, difference: -3 });
  });
});
