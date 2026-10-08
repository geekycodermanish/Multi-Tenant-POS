import * as bcrypt from 'bcryptjs';
import request = require('supertest');
import { Sequelize } from 'sequelize-typescript';
import { INestApplication } from '@nestjs/common';
import {
  Inventory,
  Merchant,
  Payment,
  Product,
  Sale,
  SaleItem,
  Store,
  User,
  UserRole,
} from '../../src/database/entities';

export type ProductFixture = {
  id: string;
  name: string;
  priceCents: number;
  storeId: string;
};

export type FixtureSet = {
  merchantA: Merchant;
  merchantB: Merchant;
  storeA1: Store;
  storeA2: Store;
  storeB1: Store;
  adminA: User;
  staffA1: User;
  staffA2: User;
  adminB: User;
  staffB1: User;
  products: {
    coffee: ProductFixture;
    tea: ProductFixture;
    sandwich: ProductFixture;
    widget: ProductFixture;
  };
};

function getBaseConnection() {
  return new Sequelize({
    dialect: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'swazei_pos_test',
    logging: false,
  });
}

export async function resetDatabase(): Promise<void> {
  const sequelize = getBaseConnection();
  try {
    await sequelize.authenticate();
    const rows = (await sequelize.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT IN ('SequelizeMeta') ORDER BY tablename;`,
    )) as [Array<{ tablename: string }>, unknown];
    const tables = rows[0].map((row) => row.tablename).filter(Boolean);
    if (tables.length > 0) {
      await sequelize.query(`TRUNCATE TABLE ${tables.map((name) => `"${name}"`).join(', ')} RESTART IDENTITY CASCADE;`);
    }
  } finally {
    await sequelize.close();
  }
}

async function hashPassword(password: string) {
  return bcrypt.hash(password, 1);
}

export async function createFixtures(): Promise<FixtureSet> {
  const sequelize = getBaseConnection();

  try {
    await sequelize.authenticate();

    const merchantA = await Merchant.create({ name: 'Merchant A', email: 'merchantA@example.com' } as any);
    const merchantB = await Merchant.create({ name: 'Merchant B', email: 'merchantB@example.com' } as any);

    const storeA1 = await Store.create({ name: 'Store A1', address: '123 A St', merchantId: merchantA.id } as any);
    const storeA2 = await Store.create({ name: 'Store A2', address: '456 B Ave', merchantId: merchantA.id } as any);
    const storeB1 = await Store.create({ name: 'Store B1', address: '789 C Rd', merchantId: merchantB.id } as any);

    const adminA = await User.create({
      name: 'Admin A',
      email: 'admin.a@example.com',
      password: await hashPassword('password123'),
      role: UserRole.MERCHANT_ADMIN,
      merchantId: merchantA.id,
    } as any);

    const staffA1 = await User.create({
      name: 'Staff A1',
      email: 'staff.a1@example.com',
      password: await hashPassword('password123'),
      role: UserRole.STORE_STAFF,
      merchantId: merchantA.id,
      storeId: storeA1.id,
    } as any);

    const staffA2 = await User.create({
      name: 'Staff A2',
      email: 'staff.a2@example.com',
      password: await hashPassword('password123'),
      role: UserRole.STORE_STAFF,
      merchantId: merchantA.id,
      storeId: storeA2.id,
    } as any);

    const adminB = await User.create({
      name: 'Admin B',
      email: 'admin.b@example.com',
      password: await hashPassword('password123'),
      role: UserRole.MERCHANT_ADMIN,
      merchantId: merchantB.id,
    } as any);

    const staffB1 = await User.create({
      name: 'Staff B1',
      email: 'staff.b1@example.com',
      password: await hashPassword('password123'),
      role: UserRole.STORE_STAFF,
      merchantId: merchantB.id,
      storeId: storeB1.id,
    } as any);

    const coffee = await Product.create({ name: 'Coffee', priceCents: 250, storeId: storeA1.id } as any);
    const tea = await Product.create({ name: 'Tea', priceCents: 180, storeId: storeA1.id } as any);
    const sandwich = await Product.create({ name: 'Sandwich', priceCents: 850, storeId: storeA1.id } as any);
    const widget = await Product.create({ name: 'Widget', priceCents: 1200, storeId: storeB1.id } as any);

    await Inventory.create({ productId: coffee.id, storeId: storeA1.id, quantity: 10 } as any);
    await Inventory.create({ productId: tea.id, storeId: storeA1.id, quantity: 8 } as any);
    await Inventory.create({ productId: sandwich.id, storeId: storeA1.id, quantity: 6 } as any);
    await Inventory.create({ productId: widget.id, storeId: storeB1.id, quantity: 12 } as any);

    await Product.create({ name: 'A2 item', priceCents: 330, storeId: storeA2.id } as any);
    const a2Prod = await Product.findOne({ where: { storeId: storeA2.id, name: 'A2 item' } });
    if (a2Prod) {
      await Inventory.create({ productId: a2Prod.id, storeId: storeA2.id, quantity: 9 } as any);
    }

    return {
      merchantA,
      merchantB,
      storeA1,
      storeA2,
      storeB1,
      adminA,
      staffA1,
      staffA2,
      adminB,
      staffB1,
      products: {
        coffee: { id: coffee.id, name: coffee.name, priceCents: Number(coffee.priceCents), storeId: coffee.storeId },
        tea: { id: tea.id, name: tea.name, priceCents: Number(tea.priceCents), storeId: tea.storeId },
        sandwich: { id: sandwich.id, name: sandwich.name, priceCents: Number(sandwich.priceCents), storeId: sandwich.storeId },
        widget: { id: widget.id, name: widget.name, priceCents: Number(widget.priceCents), storeId: widget.storeId },
      },
    };
  } finally {
    await sequelize.close();
  }
}

export async function login(app: INestApplication, email: string, password: string) {
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password })
    .expect(200);
  return {
    token: res.body.accessToken as string,
    user: res.body.user,
    response: res,
  };
}

export async function setStock(storeId: string, productId: string, quantity: number): Promise<number> {
  const inventory = await Inventory.findOne({ where: { storeId, productId } });
  if (!inventory) throw new Error(`Inventory missing for store ${storeId} product ${productId}`);
  await inventory.update({ quantity });
  return Number(inventory.quantity);
}

export async function getStock(storeId: string, productId: string): Promise<number> {
  const inventory = await Inventory.findOne({ where: { storeId, productId } });
  if (!inventory) throw new Error(`Inventory missing for store ${storeId} product ${productId}`);
  return Number(inventory.quantity);
}

export async function countSales(storeId?: string): Promise<number> {
  const where = storeId ? { storeId } : {};
  return Sale.count({ where });
}

export async function countPayments(): Promise<number> {
  return Payment.count();
}

export async function makeSale(
  app: INestApplication,
  token: string,
  storeId: string,
  items: Array<{ productId: string; quantity: number }>,
  key: string,
  overrides: Record<string, unknown> = {},
) {
  return request(app.getHttpServer())
    .post(`/stores/${storeId}/sales`)
    .set('Authorization', `Bearer ${token}`)
    .set('idempotency-key', key)
    .send({
      items,
      paymentMethod: 'cash',
      ...overrides,
    });
}
