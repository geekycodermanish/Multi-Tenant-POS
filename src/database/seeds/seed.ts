/**
 * Seed script — creates two merchants, their stores, admin/staff users,
 * products, and inventory so you can test the API immediately.
 *
 * Run with:  npm run seed
 */
import 'reflect-metadata';
import { Sequelize } from 'sequelize-typescript';
import * as bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config();

import {
  Merchant, Store, User, Product, Inventory, UserRole,
} from '../entities';

const sequelize = new Sequelize({
  dialect: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'swazei_pos',
  models: [Merchant, Store, User, Product, Inventory],
  logging: false,
});

const hash = (pw: string) => bcrypt.hash(pw, 10);

async function seed() {
  await sequelize.authenticate();
  console.log('Connected to DB');

  // ── Merchant A ────────────────────────────────────────────────────────────
  const merchantA = await Merchant.create({
    name: 'Merchant A',
    email: 'merchantA@example.com',
  } as any);

  const storeA1 = await Store.create({
    name: 'Store A1',
    address: '123 Main St',
    merchantId: merchantA.id,
  } as any);

  const storeA2 = await Store.create({
    name: 'Store A2',
    address: '456 Oak Ave',
    merchantId: merchantA.id,
  } as any);

  await User.create({
    name: 'Admin A',
    email: 'admin.a@example.com',
    password: await hash('password123'),
    role: UserRole.MERCHANT_ADMIN,
    merchantId: merchantA.id,
  } as any);

  await User.create({
    name: 'Staff A1',
    email: 'staff.a1@example.com',
    password: await hash('password123'),
    role: UserRole.STORE_STAFF,
    merchantId: merchantA.id,
    storeId: storeA1.id,
  } as any);

  // Products for Store A1
  const productsData = [
    { name: 'Coffee',         priceCents: 250,  stock: 100 },
    { name: 'Tea',            priceCents: 150,  stock: 50  },
    { name: 'Sandwich',       priceCents: 850,  stock: 30  },
    { name: 'Low Stock Item', priceCents: 500,  stock: 2   },
  ];

  for (const p of productsData) {
    const product = await Product.create({
      name: p.name,
      priceCents: p.priceCents,
      storeId: storeA1.id,
    } as any);

    await Inventory.create({
      productId: product.id,
      storeId: storeA1.id,
      quantity: p.stock,
    } as any);
  }

  // ── Merchant B ────────────────────────────────────────────────────────────
  const merchantB = await Merchant.create({
    name: 'Merchant B',
    email: 'merchantB@example.com',
  } as any);

  const storeB1 = await Store.create({
    name: 'Store B1',
    address: '789 Pine Rd',
    merchantId: merchantB.id,
  } as any);

  await User.create({
    name: 'Admin B',
    email: 'admin.b@example.com',
    password: await hash('password123'),
    role: UserRole.MERCHANT_ADMIN,
    merchantId: merchantB.id,
  } as any);

  await User.create({
    name: 'Staff B1',
    email: 'staff.b1@example.com',
    password: await hash('password123'),
    role: UserRole.STORE_STAFF,
    merchantId: merchantB.id,
    storeId: storeB1.id,
  } as any);

  const productB = await Product.create({
    name: 'Widget',
    priceCents: 1200,
    storeId: storeB1.id,
  } as any);

  await Inventory.create({
    productId: productB.id,
    storeId: storeB1.id,
    quantity: 20,
  } as any);

  console.log(`
Seed complete!

Merchant A
  Admin:  admin.a@example.com  / password123
  Staff:  staff.a1@example.com / password123
  Store A1 ID: ${storeA1.id}
  Store A2 ID: ${storeA2.id}

Merchant B
  Admin:  admin.b@example.com  / password123
  Staff:  staff.b1@example.com / password123
  Store B1 ID: ${storeB1.id}
`);

  await sequelize.close();
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
