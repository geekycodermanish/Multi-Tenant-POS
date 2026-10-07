import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SequelizeModule } from '@nestjs/sequelize';
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-yet';

import databaseConfig from './config/database.config';
import jwtConfig from './config/jwt.config';
import redisConfig from './config/redis.config';

import {
  Merchant, Store, User, Product,
  Inventory, Sale, SaleItem, Payment, IdempotencyKey,
} from './database/entities';

import { HealthModule } from './common/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { MerchantsModule } from './modules/merchants/merchants.module';
import { StoresModule } from './modules/stores/stores.module';
import { UsersModule } from './modules/users/users.module';
import { ProductsModule } from './modules/products/products.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { SalesModule } from './modules/sales/sales.module';
import { PaymentsModule } from './modules/payments/payments.module';

@Module({
  imports: [
    // Config — load env variables and typed configs
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, jwtConfig, redisConfig],
    }),

    // Database
    SequelizeModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const host = cfg.get<string>('database.host');
        const port = cfg.get<number>('database.port');
        const database = cfg.get<string>('database.database');

        console.log(`🔌 Connecting to PostgreSQL: ${host}:${port}/${database}`);

        return {
          dialect: 'postgres',
          host,
          port,
          username: cfg.get<string>('database.username'),
          password: cfg.get<string>('database.password'),
          database,
          models: [
            Merchant, Store, User, Product,
            Inventory, Sale, SaleItem, Payment, IdempotencyKey,
          ],
          autoLoadModels: false,
          synchronize: false,
          logging: process.env.NODE_ENV === 'development' ? console.log : false,
          retryAttempts: 3,
          retryDelay: 3000,
          dialectOptions: {
            // needed so BIGINT columns come back as JS numbers, not strings
            bigNumberStrings: false,
          },
        };
      },
    }),

    // Redis cache — used for product listings (read-heavy)
    // Falls back to memory cache if Redis is unavailable
    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: async (cfg: ConfigService) => {
        const redisHost = cfg.get<string>('redis.host');
        const redisPort = cfg.get<number>('redis.port');
        const ttl = cfg.get<number>('redis.ttl') * 1000;

        try {
          const store = await redisStore({
            socket: {
              host: redisHost,
              port: redisPort,
              connectTimeout: 5000,
            },
          });
          console.log(`✅ Redis connected: ${redisHost}:${redisPort}`);
          return { store, ttl };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`❌ Redis connection failed (${redisHost}:${redisPort}): ${message}`);
          console.warn('⚠️  Using memory cache fallback.');
          return { ttl };
        }
      },
    }),

    // Application modules
    HealthModule,
    AuthModule,
    MerchantsModule,
    StoresModule,
    UsersModule,
    ProductsModule,
    InventoryModule,
    SalesModule,
    PaymentsModule,
  ],
})
export class AppModule {}

