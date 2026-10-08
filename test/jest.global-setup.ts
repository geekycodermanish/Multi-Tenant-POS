import * as dotenv from 'dotenv';
import * as path from 'path';

export default async function globalSetup(): Promise<void> {
  dotenv.config({ path: path.resolve(process.cwd(), '.env.test') });
  process.env.NODE_ENV = 'test';

  const dbName = process.env.DB_NAME ?? '';
  if (!dbName.endsWith('_test')) {
    throw new Error(
      `Test DB guard failed: DB_NAME="${dbName}". Set DB_NAME to a *_test database name in .env.test and do not override it.`,
    );
  }

  let sequelize: import('sequelize').Sequelize | undefined;
  let failure: unknown;
  try {
    const { umzug } = await import('../data-source');
    umzug.options.logger = undefined;
    const migrationContext = umzug.options.context;
    if (typeof migrationContext === 'function') {
      throw new Error('The project migration runner must use a concrete Sequelize QueryInterface');
    }
    sequelize = migrationContext.sequelize;

    await sequelize.authenticate();
    await sequelize.query('DROP SCHEMA public CASCADE;');
    await sequelize.query('CREATE SCHEMA public;');
    await umzug.up();
  } catch (error) {
    failure = error;
  } finally {
    if (sequelize) {
      try {
        await sequelize.close();
      } catch (error) {
        failure ??= error;
      }
    }
  }

  if (failure) {
    const message = failure instanceof Error ? failure.message : String(failure);
    throw new Error(`Integration test database setup failed for "${dbName}": ${message}`);
  }
}
