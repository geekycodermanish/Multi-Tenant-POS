import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Cache } from 'cache-manager';
import { Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    @InjectConnection() private readonly sequelize: Sequelize,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async checkDatabaseConnection(): Promise<{ status: string; message: string }> {
    try {
      // Verify the connection is alive with a trivial query
      await this.sequelize.query('SELECT 1');
      return { status: 'connected', message: 'PostgreSQL connection successful' };
    } catch (error) {
      this.logger.error('Database connection failed:', error.message);
      return { status: 'error', message: `Database connection failed: ${error.message}` };
    }
  }

  async checkRedisConnection(): Promise<{ status: string; message: string }> {
    try {
      const testKey = 'health-check';
      const testValue = 'ok';

      await this.cacheManager.set(testKey, testValue, 1000); // 1 second TTL
      const result = await this.cacheManager.get(testKey);

      if (result === testValue) {
        return { status: 'connected', message: 'Redis connection successful' };
      } else {
        return { status: 'error', message: 'Redis test failed - value mismatch' };
      }
    } catch (error) {
      if (error.message?.includes('redis') || error.code === 'ECONNREFUSED') {
        return { status: 'fallback', message: 'Using memory cache (Redis unavailable)' };
      }

      this.logger.warn('Cache connection check failed:', error.message);
      return { status: 'fallback', message: 'Using memory cache fallback' };
    }
  }

  async checkAllConnections(): Promise<{
    database: { status: string; message: string };
    redis: { status: string; message: string };
    overall: string;
  }> {
    const database = await this.checkDatabaseConnection();
    const redis = await this.checkRedisConnection();

    const overall = database.status === 'connected' ? 'healthy' : 'degraded';

    return { database, redis, overall };
  }

  logConnectionStatus(): void {
    this.checkAllConnections()
      .then(({ database, redis, overall }) => {
        this.logger.log('='.repeat(60));
        this.logger.log('🔍 CONNECTION STATUS');
        this.logger.log('='.repeat(60));

        const dbIcon = database.status === 'connected' ? '✅' : '❌';
        this.logger.log(`${dbIcon} Database: ${database.message}`);

        const redisIcon =
          redis.status === 'connected' ? '✅' : redis.status === 'fallback' ? '⚠️' : '❌';
        this.logger.log(`${redisIcon} Cache: ${redis.message}`);

        const overallIcon = overall === 'healthy' ? '🟢' : '🟡';
        this.logger.log(`${overallIcon} Overall Status: ${overall.toUpperCase()}`);

        this.logger.log('='.repeat(60));
      })
      .catch((error) => {
        this.logger.error('Failed to check connection status:', error);
      });
  }
}
