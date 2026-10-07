import { MigrationFn } from '../../../data-source';

export const up: MigrationFn = async (queryInterface) => {
  await queryInterface.sequelize.query(
    `ALTER TABLE "sales" DROP CONSTRAINT "UQ_sales_idempotencyKey"`,
  );
  await queryInterface.sequelize.query(
    `CREATE UNIQUE INDEX "IDX_sales_storeId_idempotencyKey" ON "sales"("storeId", "idempotencyKey")`,
  );

  await queryInterface.sequelize.query(
    `ALTER TABLE "idempotency_keys" ADD COLUMN "requestHash" VARCHAR(64)`,
  );
  await queryInterface.sequelize.query(
    `UPDATE "idempotency_keys" SET "requestHash" = '' WHERE "requestHash" IS NULL`,
  );
  await queryInterface.sequelize.query(
    `ALTER TABLE "idempotency_keys" ALTER COLUMN "requestHash" SET NOT NULL`,
  );
  await queryInterface.sequelize.query(
    `ALTER TABLE "idempotency_keys" ALTER COLUMN "saleId" DROP NOT NULL`,
  );
  await queryInterface.sequelize.query(`
    ALTER TABLE "idempotency_keys"
    ADD CONSTRAINT "FK_idempotency_keys_sale" FOREIGN KEY ("saleId")
    REFERENCES "sales"("id") ON DELETE CASCADE
  `);
};

export const down: MigrationFn = async (queryInterface) => {
  await queryInterface.sequelize.query(
    `ALTER TABLE "idempotency_keys" DROP CONSTRAINT "FK_idempotency_keys_sale"`,
  );
  await queryInterface.sequelize.query(
    `ALTER TABLE "idempotency_keys" DROP COLUMN "requestHash"`,
  );
  await queryInterface.sequelize.query(
    `DROP INDEX "IDX_sales_storeId_idempotencyKey"`,
  );
  await queryInterface.sequelize.query(`
    ALTER TABLE "sales"
    ADD CONSTRAINT "UQ_sales_idempotencyKey" UNIQUE ("idempotencyKey")
  `);
};
