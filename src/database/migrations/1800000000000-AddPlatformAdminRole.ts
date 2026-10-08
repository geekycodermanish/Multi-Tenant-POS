import { MigrationFn } from '../../../data-source';

export const up: MigrationFn = async (queryInterface) => {
  await queryInterface.sequelize.query(
    `ALTER TYPE "user_role_enum" ADD VALUE IF NOT EXISTS 'platform_admin'`,
  );
  await queryInterface.sequelize.query(
    `ALTER TABLE "users" ALTER COLUMN "merchantId" DROP NOT NULL`,
  );
};

export const down: MigrationFn = async (queryInterface) => {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT COUNT(*)::int AS count FROM "users" WHERE "role" = 'platform_admin'`,
  );
  if (Number((rows as Array<{ count: number }>)[0].count) > 0) {
    throw new Error('Cannot revert platform admin migration while platform admin users exist');
  }

  await queryInterface.sequelize.query(
    `ALTER TABLE "users" ALTER COLUMN "merchantId" SET NOT NULL`,
  );
  await queryInterface.sequelize.query(
    `ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT`,
  );
  await queryInterface.sequelize.query(
    `ALTER TYPE "user_role_enum" RENAME TO "user_role_enum_with_platform_admin"`,
  );
  await queryInterface.sequelize.query(
    `CREATE TYPE "user_role_enum" AS ENUM('merchant_admin','store_staff')`,
  );
  await queryInterface.sequelize.query(`
    ALTER TABLE "users"
    ALTER COLUMN "role" TYPE "user_role_enum"
    USING "role"::text::"user_role_enum"
  `);
  await queryInterface.sequelize.query(
    `ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'store_staff'`,
  );
  await queryInterface.sequelize.query(
    `DROP TYPE "user_role_enum_with_platform_admin"`,
  );
};
