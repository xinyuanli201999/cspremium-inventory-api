import { MovementType, PrismaClient, Role, Unit } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const CATEGORIES: {
  name: string;
  nameKh?: string;
  subs: { slug: string; name: string }[];
}[] = [
  {
    name: 'Business Solutions',
    nameKh: 'ដំណោះស្រាយអាជីវកម្ម',
    subs: [
      { slug: 'company-profile', name: 'Company Profile' },
      { slug: 'brand-design-media', name: 'Brand Design and Media' },
    ],
  },
  {
    name: 'Customize Gifts',
    nameKh: 'អំណោយតាមការកំណត់',
    subs: [
      { slug: 'bags', name: 'Bags' },
      { slug: 'book-gift-sets', name: 'Book Gift Sets' },
      { slug: 'bottles', name: 'Bottles' },
      { slug: 'eco-bags', name: 'Eco Bags' },
      { slug: 'keychains-pins', name: 'Keychains / Pins' },
      { slug: 'others', name: 'Others' },
    ],
  },
  {
    name: 'Premium Gifts',
    nameKh: 'អំណោយពិសេស',
    subs: [
      { slug: 'wooden-crafts', name: 'Wooden Crafts' },
      { slug: 'copper-crafts', name: 'Copper Crafts' },
      { slug: 'pearl', name: 'Pearl' },
      { slug: 'brass', name: 'Brass' },
      { slug: 'vip-gift-box', name: 'VIP-Gift Box' },
    ],
  },
  {
    name: 'Occasional Gifts',
    nameKh: 'អំណោយតាមឱកាស',
    subs: [
      { slug: 'healthy-gifts', name: 'Healthy Gifts' },
      { slug: 'gift-basket', name: 'Gift Basket' },
      { slug: 'other-event', name: 'Other Event' },
    ],
  },
];

async function seedAdmin() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';
  const name = process.env.SEED_ADMIN_NAME ?? 'Administrator';

  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name,
      role: Role.ADMIN,
      passwordHash: await bcrypt.hash(password, 12),
    },
  });
  console.log(`Admin ready: ${admin.email}`);
  return admin;
}

/** Idempotent: existing rows (and any ordering the user changed) are left untouched. */
async function seedCategories() {
  for (const [ci, c] of CATEGORIES.entries()) {
    const category = await prisma.category.findFirst({ where: { name: c.name } })
      ?? await prisma.category.create({
        data: { name: c.name, nameKh: c.nameKh, sortOrder: ci + 1 },
      });
    for (const [si, s] of c.subs.entries()) {
      await prisma.subcategory.upsert({
        where: { slug: s.slug },
        update: {},
        create: { slug: s.slug, name: s.name, categoryId: category.id, sortOrder: si + 1 },
      });
    }
  }
  console.log(`Categories ready: ${CATEGORIES.length}`);
}

/** Optional demo data (SEED_SAMPLE_DATA=true). Never enable in production. */
async function seedSample(adminId: string) {
  if (await prisma.product.count()) {
    console.log('Sample data skipped: products already exist');
    return;
  }
  const supplier = await prisma.supplier.create({
    data: {
      companyName: 'Angkor Craft Supply',
      contactPerson: 'Sok Dara',
      phone: '012 345 678',
      email: 'sales@angkorcraft.example',
      address: 'Phnom Penh',
    },
  });
  const cat = async (name: string) =>
    prisma.category.findFirstOrThrow({ where: { name }, include: { subcategories: true } });

  const custom = await cat('Customize Gifts');
  const premium = await cat('Premium Gifts');
  const sub = (c: typeof custom, slug: string) => c.subcategories.find((s) => s.slug === slug)?.id;

  const items = [
    { sku: 'BAG-001', name: 'Canvas Tote Bag', c: custom, s: sub(custom, 'eco-bags'), buy: 1.2, sell: 2.5, stock: 120, min: 30, unit: Unit.PIECE },
    { sku: 'BTL-001', name: 'Steel Water Bottle 500ml', c: custom, s: sub(custom, 'bottles'), buy: 3.4, sell: 6, stock: 8, min: 20, unit: Unit.PIECE },
    { sku: 'KEY-001', name: 'Metal Keychain', c: custom, s: sub(custom, 'keychains-pins'), buy: 0.4, sell: 1, stock: 0, min: 50, unit: Unit.PIECE },
    { sku: 'WOD-001', name: 'Carved Wooden Elephant', c: premium, s: sub(premium, 'wooden-crafts'), buy: 9, sell: 18, stock: 25, min: 5, unit: Unit.PIECE },
    { sku: 'VIP-001', name: 'VIP Gift Box Set', c: premium, s: sub(premium, 'vip-gift-box'), buy: 22, sell: 45, stock: 14, min: 10, unit: Unit.SET },
  ];

  for (const it of items) {
    const product = await prisma.product.create({
      data: {
        sku: it.sku,
        name: it.name,
        categoryId: it.c.id,
        subcategoryId: it.s ?? null,
        supplierId: supplier.id,
        purchasePrice: it.buy,
        sellingPrice: it.sell,
        currentStock: it.stock,
        minimumStock: it.min,
        unit: it.unit,
      },
    });
    if (it.stock > 0) {
      await prisma.stockMovement.create({
        data: {
          referenceNo: `OPEN-SEED-${it.sku}`,
          type: MovementType.STOCK_IN,
          productId: product.id,
          supplierId: supplier.id,
          quantity: it.stock,
          previousStock: 0,
          newStock: it.stock,
          unitCost: it.buy,
          totalCost: it.buy * it.stock,
          reason: 'Opening stock',
          createdById: adminId,
        },
      });
    }
  }
  console.log(`Sample data ready: 1 supplier, ${items.length} products`);
}

async function main() {
  const admin = await seedAdmin();
  await seedCategories();
  if (process.env.SEED_SAMPLE_DATA === 'true') await seedSample(admin.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
