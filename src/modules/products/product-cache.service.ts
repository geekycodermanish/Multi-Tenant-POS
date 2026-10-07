import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cache } from 'cache-manager';
import { randomUUID } from 'crypto';

const VERSION_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_TIMEOUT_MS = 500;

@Injectable()
export class ProductCacheService {
  private readonly logger = new Logger(ProductCacheService.name);

  constructor(@Inject(CACHE_MANAGER) private readonly cacheManager: Cache) {}

  buildKey(storeId: string, version: string, suffix: string): string {
    return `products:${storeId}:${version}:${suffix}`;
  }

  async getVersion(storeId: string): Promise<string> {
    try {
      const key = `products:ver:${storeId}`;
      const version = await this.withTimeout(() => this.cacheManager.get<string>(key));
      if (typeof version === 'string' && version.length > 0) return version;

      const nextVersion = randomUUID();
      await this.withTimeout(() =>
        this.cacheManager.set(key, nextVersion, VERSION_TTL_MS),
      );
      return nextVersion;
    } catch (_error) {
      this.logger.warn('Product cache version lookup failed');
      return randomUUID();
    }
  }

  async get<T>(storeId: string, suffix: string): Promise<T | undefined> {
    try {
      const version = await this.getVersion(storeId);
      return await this.withTimeout(() =>
        this.cacheManager.get<T>(this.buildKey(storeId, version, suffix)),
      );
    } catch (_error) {
      this.logger.warn('Product cache read failed');
      return undefined;
    }
  }

  async set<T>(
    storeId: string,
    suffix: string,
    value: T,
    ttl: number,
  ): Promise<void> {
    try {
      const version = await this.getVersion(storeId);
      await this.withTimeout(() =>
        this.cacheManager.set(this.buildKey(storeId, version, suffix), value, ttl),
      );
    } catch (_error) {
      this.logger.warn('Product cache write failed');
    }
  }

  async invalidateStore(storeId: string): Promise<void> {
    try {
      await this.withTimeout(() =>
        this.cacheManager.set(
          `products:ver:${storeId}`,
          randomUUID(),
          VERSION_TTL_MS,
        ),
      );
    } catch (_error) {
      this.logger.warn('Product cache invalidation failed');
    }
  }

  private async withTimeout<T>(cacheCall: () => Promise<T>): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        cacheCall(),
        new Promise<T>((_resolve, reject) => {
          timeout = setTimeout(() => reject(new Error('Product cache operation timed out')), CACHE_TIMEOUT_MS);
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}
