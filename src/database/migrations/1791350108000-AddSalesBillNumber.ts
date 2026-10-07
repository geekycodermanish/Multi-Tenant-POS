import { MigrationFn } from '../../../data-source';

export const up: MigrationFn = async (queryInterface) => {
  await queryInterface.sequelize.query(
    `CREATE SEQUENCE "sales_bill_seq" START WITH 1`,
  );

  await queryInterface.sequelize.query(
    `ALTER TABLE "sales" ADD COLUMN "billNumber" VARCHAR(32)`,
  );

  await queryInterface.sequelize.query(`
    DO $$
    DECLARE
      sale_row RECORD;
    BEGIN
      FOR sale_row IN
        SELECT "id" FROM "sales" ORDER BY "createdAt", "id"
      LOOP
        UPDATE "sales"
        SET "billNumber" = 'BILL-' || lpad(nextval('"sales_bill_seq"')::text, 8, '0')
        WHERE "id" = sale_row."id";
      END LOOP;
    END
    $$;
  `);

  await queryInterface.sequelize.query(
    `ALTER TABLE "sales" ALTER COLUMN "billNumber" SET NOT NULL`,
  );

  await queryInterface.sequelize.query(
    `CREATE UNIQUE INDEX "IDX_sales_storeId_billNumber" ON "sales"("storeId", "billNumber")`,
  );
};

export const down: MigrationFn = async (queryInterface) => {
  await queryInterface.sequelize.query(
    `DROP INDEX IF EXISTS "IDX_sales_storeId_billNumber"`,
  );
  await queryInterface.sequelize.query(
    `ALTER TABLE "sales" DROP COLUMN IF EXISTS "billNumber"`,
  );
  await queryInterface.sequelize.query(
    `DROP SEQUENCE IF EXISTS "sales_bill_seq"`,
  );
};
