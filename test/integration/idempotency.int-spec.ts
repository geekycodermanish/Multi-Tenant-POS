import { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { createFixtures, countPayments, countSales, getStock, login, makeSale, resetDatabase } from '../helpers/fixtures';
import { createTestApp } from '../helpers/test-app';

describe('idempotency', () => {
  let app: INestApplication;
  let appState: Awaited<ReturnType<typeof createTestApp>>;
  let fixtures: Awaited<ReturnType<typeof createFixtures>>;
  let token: string;
  let paymentProvider: { calls: number; setNextResult: (result: 'SUCCESS' | 'FAILED') => void };

  beforeAll(async () => {
    appState = await createTestApp();
    app = appState.app;
  });

  beforeEach(async () => {
    await resetDatabase();
    fixtures = await createFixtures();
    await appState.cache.reset();
    appState.paymentProvider.reset();
    paymentProvider = appState.paymentProvider;
    ({ token } = await login(app, 'staff.a1@example.com', 'password123'));
  });

  afterAll(async () => {
    await appState.close();
  });

  it('replays the same key and same body sequentially without creating another sale', async () => {
    const first = await makeSale(app, token, fixtures.storeA1.id, [{ productId: fixtures.products.coffee.id, quantity: 1 }], 'seq-key-1');
    const second = await makeSale(app, token, fixtures.storeA1.id, [{ productId: fixtures.products.coffee.id, quantity: 1 }], 'seq-key-1');

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.billNumber).toBe(second.body.billNumber);
    expect(first.body.total).toBe(second.body.total);
    expect(await countSales(fixtures.storeA1.id)).toBe(1);
    expect(await countPayments()).toBe(1);
    expect(paymentProvider.calls).toBe(1);
    expect(await getStock(fixtures.storeA1.id, fixtures.products.coffee.id)).toBe(9);
  });

  it('handles the same key and same body for parallel requests without duplicates', async () => {
    const requests = Array.from({ length: 5 }, (_, index) =>
      makeSale(app, token, fixtures.storeA1.id, [{ productId: fixtures.products.coffee.id, quantity: 1 }], `parallel-key-${index}`),
    );

    const responses = await Promise.all(requests);
    const success = responses.filter((res) => res.status === 201);
    expect(success).toHaveLength(5);
    const billNumbers = new Set(success.map((res) => res.body.billNumber));
    expect(billNumbers.size).toBe(1);
    expect(await countSales(fixtures.storeA1.id)).toBe(1);
    expect(await countPayments()).toBe(1);
    expect(paymentProvider.calls).toBe(1);
  });

  it('returns 422 when the same key is reused with different quantity', async () => {
    const first = await makeSale(app, token, fixtures.storeA1.id, [{ productId: fixtures.products.coffee.id, quantity: 1 }], 'mismatch-key');
    const second = await makeSale(app, token, fixtures.storeA1.id, [{ productId: fixtures.products.coffee.id, quantity: 2 }], 'mismatch-key');

    expect(first.status).toBe(201);
    expect(second.status).toBe(422);
    expect(await countSales(fixtures.storeA1.id)).toBe(1);
  });

  it('treats the same body with a different item order as the same request', async () => {
    const first = await makeSale(app, token, fixtures.storeA1.id, [
      { productId: fixtures.products.coffee.id, quantity: 1 },
      { productId: fixtures.products.tea.id, quantity: 1 },
    ], 'reordered-key');
    const second = await makeSale(app, token, fixtures.storeA1.id, [
      { productId: fixtures.products.tea.id, quantity: 1 },
      { productId: fixtures.products.coffee.id, quantity: 1 },
    ], 'reordered-key');

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.billNumber).toBe(second.body.billNumber);
    expect(await countSales(fixtures.storeA1.id)).toBe(1);
  });

  it('rejects missing or malformed idempotency headers and a body idempotencyKey field', async () => {
    const missing = await request(app.getHttpServer()).post(`/stores/${fixtures.storeA1.id}/sales`).set('Authorization', `Bearer ${token}`).send({ items: [{ productId: fixtures.products.coffee.id, quantity: 1 }], paymentMethod: 'cash' });
    const short = await makeSale(app, token, fixtures.storeA1.id, [{ productId: fixtures.products.coffee.id, quantity: 1 }], 'bad');
    const malformed = await makeSale(app, token, fixtures.storeA1.id, [{ productId: fixtures.products.coffee.id, quantity: 1 }], 'bad key!');
    const inBody = await request(app.getHttpServer()).post(`/stores/${fixtures.storeA1.id}/sales`).set('Authorization', `Bearer ${token}`).set('idempotency-key', 'valid-body-key').send({ items: [{ productId: fixtures.products.coffee.id, quantity: 1 }], paymentMethod: 'cash', idempotencyKey: 'bad' });

    expect(missing.status).toBe(400);
    expect(short.status).toBe(400);
    expect(malformed.status).toBe(400);
    expect(inBody.status).toBe(400);
  });

  it('allows the same key to be reused in different stores independently', async () => {
    const staffB1 = await login(app, 'staff.b1@example.com', 'password123');

    const a1Sale = await makeSale(app, token, fixtures.storeA1.id, [{ productId: fixtures.products.coffee.id, quantity: 1 }], 'cross-store-key');
    const b1Sale = await makeSale(app, staffB1.token, fixtures.storeB1.id, [{ productId: fixtures.products.widget.id, quantity: 1 }], 'cross-store-key');

    expect(a1Sale.status).toBe(201);
    expect(b1Sale.status).toBe(201);
    expect(a1Sale.body.billNumber).not.toBe(b1Sale.body.billNumber);
    expect(await countSales(fixtures.storeA1.id)).toBe(1);
    expect(await countSales(fixtures.storeB1.id)).toBe(1);
  });
});
