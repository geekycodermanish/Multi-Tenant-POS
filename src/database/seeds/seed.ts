/**
 * Seed script — creates two sample merchants, their stores, admin/staff users,
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
  Merchant, Store, User, Product, Inventory, Sale, SaleItem, Payment,
  IdempotencyKey, UserRole,
} from '../entities';

const sequelize = new Sequelize({
  dialect: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'swazei_pos',
  models: [Merchant, Store, User, Product, Inventory, Sale, SaleItem, Payment, IdempotencyKey],
  logging: false,
});

const hash = (pw: string) => bcrypt.hash(pw, 10);
const demoPassword = 'password321';

async function seed() {
  const platformAdminEmail = process.env.PLATFORM_ADMIN_EMAIL?.trim();
  const platformAdminPassword = process.env.PLATFORM_ADMIN_PASSWORD;
  if (!platformAdminEmail || !platformAdminPassword || platformAdminPassword.length < 8) {
    throw new Error(
      'Set PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD (at least 8 characters) before running the seed.',
    );
  }

  await sequelize.authenticate();
  console.log('Connected to DB');

  const existingPlatformAdmin = await User.findOne({
    where: { email: platformAdminEmail },
  });
  if (existingPlatformAdmin) {
    if (existingPlatformAdmin.role !== UserRole.PLATFORM_ADMIN) {
      throw new Error('PLATFORM_ADMIN_EMAIL is already assigned to a non-platform user.');
    }
  } else {
    await User.create({
      name: 'Platform Admin',
      email: platformAdminEmail,
      password: await hash(platformAdminPassword),
      role: UserRole.PLATFORM_ADMIN,
      merchantId: null,
    });
  }

  const existingDemoMerchant = await Merchant.findOne({
    where: { name: 'Zodio' },
  });
  if (existingDemoMerchant) {
    console.log('Platform admin ready; demo merchant fixtures already exist, skipping them.');
    await sequelize.close();
    return;
  }

  // ── Zodio ─────────────────────────────────────────────────────────────────
  const zodio = await Merchant.create({
    name: 'Zodio',
    email: 'contact@zodio.example.com',
  } as any);

  const zodioSector86 = await Store.create({
    name: 'Zodio Sector 86',
    address: 'Sector 86, Noida',
    merchantId: zodio.id,
  } as any);

  await User.create({
    name: 'Zodio Admin',
    email: 'admin@zodio.example.com',
    password: await hash(demoPassword),
    role: UserRole.MERCHANT_ADMIN,
    merchantId: zodio.id,
  } as any);

  await User.create({
    name: 'Rahul',
    email: 'rahul@zodio.example.com',
    password: await hash(demoPassword),
    role: UserRole.STORE_STAFF,
    merchantId: zodio.id,
    storeId: zodioSector86.id,
  } as any);

  await User.create({
    name: 'Manish',
    email: 'manish@zodio.example.com',
    password: await hash(demoPassword),
    role: UserRole.STORE_STAFF,
    merchantId: zodio.id,
    storeId: zodioSector86.id,
  } as any);

  // Products for Zodio Sector 86
  const productsData = [
    { name: 'Cotton T-Shirt', priceCents: 49900, stock: 100 },
    { name: 'Casual Shirt', priceCents: 89900, stock: 50 },
    { name: 'Denim Jeans', priceCents: 129900, stock: 30 },
    { name: 'Low Stock Kurta', priceCents: 79900, stock: 2 },
  ];

  for (const p of productsData) {
    const product = await Product.create({
      name: p.name,
      priceCents: p.priceCents,
      storeId: zodioSector86.id,
    } as any);

    await Inventory.create({
      productId: product.id,
      storeId: zodioSector86.id,
      quantity: p.stock,
    } as any);
  }

  // ── Urban Pantry ──────────────────────────────────────────────────────────
  const urbanPantry = await Merchant.create({
    name: 'Urban Pantry',
    email: 'contact@urbanpantry.example.com',
  } as any);

  const urbanPantryNoida = await Store.create({
    name: 'Urban Pantry Noida',
    address: 'Sector 18, Noida',
    merchantId: urbanPantry.id,
  } as any);

  await User.create({
    name: 'Urban Pantry Admin',
    email: 'admin@urbanpantry.example.com',
    password: await hash(demoPassword),
    role: UserRole.MERCHANT_ADMIN,
    merchantId: urbanPantry.id,
  } as any);

  await User.create({
    name: 'John',
    email: 'john@urbanpantry.example.com',
    password: await hash(demoPassword),
    role: UserRole.STORE_STAFF,
    merchantId: urbanPantry.id,
    storeId: urbanPantryNoida.id,
  } as any);

  const productB = await Product.create({
    name: 'Organic Rice 5kg',
    priceCents: 64900,
    storeId: urbanPantryNoida.id,
  } as any);

  await Inventory.create({
    productId: productB.id,
    storeId: urbanPantryNoida.id,
    quantity: 20,
  } as any);

  console.log(`
Seed complete!

Zodio
  Admin:  admin@zodio.example.com / ${demoPassword}
  Staff:  rahul@zodio.example.com / ${demoPassword}
          manish@zodio.example.com / ${demoPassword}
  Store:  Zodio Sector 86 (ID: ${zodioSector86.id})

Urban Pantry
  Admin:  admin@urbanpantry.example.com / ${demoPassword}
  Staff:  john@urbanpantry.example.com / ${demoPassword}
  Store:  Urban Pantry Noida (ID: ${urbanPantryNoida.id})

Platform admin
  Admin: ${platformAdminEmail} / password supplied through PLATFORM_ADMIN_PASSWORD

Demo merchant and staff password: ${demoPassword}
`);

  await sequelize.close();
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
