import { QueryInterface } from 'sequelize';

/**
 * Initial schema migration — creates all tables, enums, indexes, and constraints.
 * Runs via Umzug: npm run migration:run
 */

export async function up(queryInterface: QueryInterface): Promise<void> {
  // ENUMS
  await queryInterface.sequelize.query(
    `CREATE TYPE "user_role_enum" AS ENUM('merchant_admin','store_staff')`,
  );
  await queryInterface.sequelize.query(
    `CREATE TYPE "sale_status_enum" AS ENUM('pending','completed','failed','cancelled')`,
  );
  await queryInterface.sequelize.query(
    `CREATE TYPE "payment_status_enum" AS ENUM('pending','success','failed')`,
  );
  await queryInterface.sequelize.query(
    `CREATE TYPE "payment_method_enum" AS ENUM('cash','card','upi')`,
  );

  // merchants
  await queryInterface.sequelize.query(`
    CREATE TABLE "merchants" (
      "id"        UUID NOT NULL DEFAULT gen_random_uuid(),
      "name"      VARCHAR NOT NULL,
      "email"     VARCHAR NOT NULL,
      "isActive"  BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_merchants" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_merchants_name"  UNIQUE ("name"),
      CONSTRAINT "UQ_merchants_email" UNIQUE ("email")
    )
  `);

  // stores
  await queryInterface.sequelize.query(`
    CREATE TABLE "stores" (
      "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
      "name"       VARCHAR NOT NULL,
      "address"    VARCHAR,
      "isActive"   BOOLEAN NOT NULL DEFAULT true,
      "merchantId" UUID NOT NULL,
      "createdAt"  TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt"  TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_stores" PRIMARY KEY ("id"),
      CONSTRAINT "FK_stores_merchant" FOREIGN KEY ("merchantId")
        REFERENCES "merchants"("id") ON DELETE CASCADE
    )
  `);
  await queryInterface.sequelize.query(
    `CREATE INDEX "IDX_stores_merchantId" ON "stores"("merchantId")`,
  );

  // users
  await queryInterface.sequelize.query(`
    CREATE TABLE "users" (
      "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
      "name"       VARCHAR NOT NULL,
      "email"      VARCHAR NOT NULL,
      "password"   VARCHAR NOT NULL,
      "role"       "user_role_enum" NOT NULL DEFAULT 'store_staff',
      "isActive"   BOOLEAN NOT NULL DEFAULT true,
      "merchantId" UUID NOT NULL,
      "storeId"    UUID,
      "createdAt"  TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt"  TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_users" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_users_email" UNIQUE ("email"),
      CONSTRAINT "FK_users_merchant" FOREIGN KEY ("merchantId")
        REFERENCES "merchants"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_users_store" FOREIGN KEY ("storeId")
        REFERENCES "stores"("id") ON DELETE SET NULL
    )
  `);
  await queryInterface.sequelize.query(
    `CREATE INDEX "IDX_users_email"      ON "users"("email")`,
  );
  await queryInterface.sequelize.query(
    `CREATE INDEX "IDX_users_merchantId" ON "users"("merchantId")`,
  );
  await queryInterface.sequelize.query(
    `CREATE INDEX "IDX_users_storeId"    ON "users"("storeId")`,
  );

  // products
  await queryInterface.sequelize.query(`
    CREATE TABLE "products" (
      "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
      "name"        VARCHAR NOT NULL,
      "description" VARCHAR,
      "sku"         VARCHAR,
      "priceCents"  BIGINT NOT NULL,
      "isActive"    BOOLEAN NOT NULL DEFAULT true,
      "storeId"     UUID NOT NULL,
      "createdAt"   TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt"   TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_products" PRIMARY KEY ("id"),
      CONSTRAINT "FK_products_store" FOREIGN KEY ("storeId")
        REFERENCES "stores"("id") ON DELETE CASCADE
    )
  `);
  await queryInterface.sequelize.query(
    `CREATE INDEX "IDX_products_storeId" ON "products"("storeId")`,
  );

  // inventories
  await queryInterface.sequelize.query(`
    CREATE TABLE "inventories" (
      "id"               UUID NOT NULL DEFAULT gen_random_uuid(),
      "productId"        UUID NOT NULL,
      "storeId"          UUID NOT NULL,
      "quantity"         INTEGER NOT NULL DEFAULT 0,
      "reservedQuantity" INTEGER NOT NULL DEFAULT 0,
      "updatedAt"        TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_inventories"          PRIMARY KEY ("id"),
      CONSTRAINT "UQ_inventories_product"  UNIQUE ("productId"),
      CONSTRAINT "CHK_inventory_qty"       CHECK ("quantity" >= 0),
      CONSTRAINT "FK_inventories_product"  FOREIGN KEY ("productId")
        REFERENCES "products"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_inventories_store"    FOREIGN KEY ("storeId")
        REFERENCES "stores"("id") ON DELETE CASCADE
    )
  `);
  await queryInterface.sequelize.query(
    `CREATE INDEX "IDX_inventories_storeId" ON "inventories"("storeId")`,
  );

  // sales
  await queryInterface.sequelize.query(`
    CREATE TABLE "sales" (
      "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
      "storeId"        UUID NOT NULL,
      "createdById"    UUID,
      "totalCents"     BIGINT NOT NULL DEFAULT 0,
      "status"         "sale_status_enum" NOT NULL DEFAULT 'pending',
      "idempotencyKey" VARCHAR NOT NULL,
      "notes"          VARCHAR,
      "createdAt"      TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt"      TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_sales"                PRIMARY KEY ("id"),
      CONSTRAINT "UQ_sales_idempotencyKey" UNIQUE ("idempotencyKey"),
      CONSTRAINT "FK_sales_store"          FOREIGN KEY ("storeId")
        REFERENCES "stores"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_sales_user"           FOREIGN KEY ("createdById")
        REFERENCES "users"("id") ON DELETE SET NULL
    )
  `);
  await queryInterface.sequelize.query(
    `CREATE INDEX "IDX_sales_storeId" ON "sales"("storeId")`,
  );

  // sale_items
  await queryInterface.sequelize.query(`
    CREATE TABLE "sale_items" (
      "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
      "saleId"         UUID NOT NULL,
      "productId"      UUID NOT NULL,
      "quantity"       INTEGER NOT NULL,
      "unitPriceCents" BIGINT NOT NULL,
      "subtotalCents"  BIGINT NOT NULL,
      CONSTRAINT "PK_sale_items"          PRIMARY KEY ("id"),
      CONSTRAINT "FK_sale_items_sale"     FOREIGN KEY ("saleId")
        REFERENCES "sales"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_sale_items_product"  FOREIGN KEY ("productId")
        REFERENCES "products"("id") ON DELETE RESTRICT
    )
  `);

  // payments
  await queryInterface.sequelize.query(`
    CREATE TABLE "payments" (
      "id"                UUID NOT NULL DEFAULT gen_random_uuid(),
      "saleId"            UUID NOT NULL,
      "amountCents"       BIGINT NOT NULL,
      "method"            "payment_method_enum" NOT NULL DEFAULT 'cash',
      "status"            "payment_status_enum" NOT NULL DEFAULT 'pending',
      "providerReference" VARCHAR,
      "failureReason"     VARCHAR,
      "createdAt"         TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_payments"      PRIMARY KEY ("id"),
      CONSTRAINT "UQ_payments_saleId" UNIQUE ("saleId"),
      CONSTRAINT "FK_payments_sale" FOREIGN KEY ("saleId")
        REFERENCES "sales"("id") ON DELETE CASCADE
    )
  `);

  // idempotency_keys
  await queryInterface.sequelize.query(`
    CREATE TABLE "idempotency_keys" (
      "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
      "key"          VARCHAR NOT NULL,
      "storeId"      VARCHAR NOT NULL,
      "saleId"       UUID,
      "responseBody" JSONB,
      "createdAt"    TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_idempotency_keys"     PRIMARY KEY ("id"),
      CONSTRAINT "UQ_idempotency_key_store" UNIQUE ("key", "storeId")
    )
  `);
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(`DROP TABLE IF EXISTS "idempotency_keys"`);
  await queryInterface.sequelize.query(`DROP TABLE IF EXISTS "payments"`);
  await queryInterface.sequelize.query(`DROP TABLE IF EXISTS "sale_items"`);
  await queryInterface.sequelize.query(`DROP TABLE IF EXISTS "sales"`);
  await queryInterface.sequelize.query(`DROP TABLE IF EXISTS "inventories"`);
  await queryInterface.sequelize.query(`DROP TABLE IF EXISTS "products"`);
  await queryInterface.sequelize.query(`DROP TABLE IF EXISTS "users"`);
  await queryInterface.sequelize.query(`DROP TABLE IF EXISTS "stores"`);
  await queryInterface.sequelize.query(`DROP TABLE IF EXISTS "merchants"`);
  await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "payment_method_enum"`);
  await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "payment_status_enum"`);
  await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "sale_status_enum"`);
  await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "user_role_enum"`);
}
