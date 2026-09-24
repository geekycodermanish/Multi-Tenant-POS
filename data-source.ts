/**
 * Sequelize + Umzug migration runner.
 *
 * Usage (via npm scripts):
 *   npm run migration:run     — runs all pending migrations
 *   npm run migration:revert  — reverts the last applied migration
 *   npm run migration:create  — creates a new empty migration file
 */
import 'reflect-metadata';
import { Sequelize } from 'sequelize-typescript';
import { Umzug, SequelizeStorage } from 'umzug';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config();

const sequelize = new Sequelize({
  dialect: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'swazei_pos',
  logging: false,
});

export const umzug = new Umzug({
  migrations: {
    glob: path.join(__dirname, 'src/database/migrations/*.ts'),
    resolve: ({ name, path: migPath, context }) => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const migration = require(migPath!);
      return {
        name,
        up: async () => migration.up(context),
        down: async () => migration.down(context),
      };
    },
  },
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({ sequelize }),
  logger: console,
});

// Export the type so migrations can be typed
export type MigrationFn = (queryInterface: typeof sequelize.getQueryInterface extends () => infer R ? R : never) => Promise<void>;

// ── CLI entrypoint ─────────────────────────────────────────────────────────────
if (require.main === module) {
  const command = process.argv[2];

  (async () => {
    await sequelize.authenticate();

    if (command === 'up') {
      await umzug.up();
      console.log('✅ All pending migrations applied.');
    } else if (command === 'down') {
      await umzug.down();
      console.log('✅ Last migration reverted.');
    } else {
      console.error('Usage: ts-node data-source.ts [up|down]');
      process.exit(1);
    }

    await sequelize.close();
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
