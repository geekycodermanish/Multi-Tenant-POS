import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Sequelize } from 'sequelize-typescript';
import request = require('supertest');
import { AppModule } from '../../src/app.module';
import { applyAppSetup } from '../../src/app.setup';
import { PAYMENT_PROVIDER } from '../../src/modules/payments/payment-provider.interface';

export class FakeCache {
  failing = false;
  private readonly map = new Map<string, unknown>();

  get = jest.fn(async (key: string) => {
    if (this.failing) throw new Error('cache unavailable');
    return this.map.get(key);
  });

  set = jest.fn(async (key: string, value: unknown) => {
    if (this.failing) throw new Error('cache unavailable');
    this.map.set(key, value);
    return value;
  });

  del = jest.fn(async (key: string) => {
    if (this.failing) throw new Error('cache unavailable');
    this.map.delete(key);
  });

  reset = jest.fn(async () => {
    this.map.clear();
  });
}

export class FakePaymentProvider {
  nextResult: 'SUCCESS' | 'FAILED' = 'SUCCESS';
  calls = 0;

  charge = jest.fn(async () => {
    this.calls += 1;
    if (this.nextResult === 'FAILED') {
      return {
        success: false,
        providerReference: 'PAY_FAIL',
        failureReason: 'Mock payment declined',
      };
    }
    return {
      success: true,
      providerReference: 'PAY_OK',
    };
  });

  setNextResult(result: 'SUCCESS' | 'FAILED') {
    this.nextResult = result;
  }

  reset() {
    this.calls = 0;
    this.nextResult = 'SUCCESS';
  }
}

export async function createTestApp() {
  const cache = new FakeCache();
  const paymentProvider = new FakePaymentProvider();

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(CACHE_MANAGER)
    .useValue(cache)
    .overrideProvider(PAYMENT_PROVIDER)
    .useValue(paymentProvider)
    .compile();

  const app = moduleRef.createNestApplication();
  applyAppSetup(app);
  await app.listen(0);
  if (app.get(CACHE_MANAGER, { strict: false }) !== cache) {
    await app.close();
    throw new Error('Test cache override did not replace CACHE_MANAGER');
  }

  return {
    app,
    cache,
    paymentProvider,
    request: request(app.getHttpServer()),
    close: async () => {
      await app.close();
      const sequelize = app.get(Sequelize, { strict: false });
      if (sequelize && typeof sequelize.close === 'function') {
        await sequelize.close();
      }
    },
  };
}
