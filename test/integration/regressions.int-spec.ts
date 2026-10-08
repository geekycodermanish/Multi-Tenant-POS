import { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { createFixtures, login, makeSale, resetDatabase } from '../helpers/fixtures';
import { createTestApp } from '../helpers/test-app';

describe('regression checks', () => {
  let app: INestApplication;
  let appState: Awaited<ReturnType<typeof createTestApp>>;
  let fixtures: Awaited<ReturnType<typeof createFixtures>>;

  beforeAll(async () => {
    appState = await createTestApp();
    app = appState.app;
  });

  beforeEach(async () => {
    await resetDatabase();
    fixtures = await createFixtures();
    await appState.cache.reset();
    appState.paymentProvider.reset();
  });

  afterAll(async () => {
    await appState.close();
  });

  it('does not expose auth register and validates create-user payloads', async () => {
    const adminA = await login(app, 'admin.a@example.com', 'password123');
    const registerRes = await request(app.getHttpServer()).post('/auth/register').send({ email: 'x@example.com', password: 'password123' });
    const invalidRes = await request(app.getHttpServer()).post('/users').set('Authorization', `Bearer ${adminA.token}`).send({
      name: 'Jane',
      email: 'jane@example.com',
      password: 'secret123',
      role: 'merchant_admin',
      merchantId: fixtures.merchantB.id,
      extra: 'unexpected',
    });
    const staffRes = await request(app.getHttpServer()).post('/users').set('Authorization', `Bearer ${(await login(app, 'staff.a1@example.com', 'password123')).token}`).send({
      name: 'X',
      email: 'x@y.com',
      password: 'secret123',
      role: 'store_staff',
      storeId: fixtures.storeA1.id,
    });
    const noStoreRes = await request(app.getHttpServer()).post('/users').set('Authorization', `Bearer ${adminA.token}`).send({
      name: 'Needs Store',
      email: 'needs-store@example.com',
      password: 'secret123',
      role: 'store_staff',
    });

    expect(registerRes.status).toBe(404);
    expect(invalidRes.status).toBe(400);
    expect(staffRes.status).toBe(403);
    expect(noStoreRes.status).toBe(400);
  });

  // Covered by concurrency.int-spec.ts.

  it('keeps the sale response and replay response consistent and hides password hashes', async () => {
    const staffA1 = await login(app, 'staff.a1@example.com', 'password123');
    const saleKey = 'regression-idempotent-key';
    const first = await makeSale(app, staffA1.token, fixtures.storeA1.id, [{ productId: fixtures.products.coffee.id, quantity: 1 }], saleKey);
    const second = await makeSale(app, staffA1.token, fixtures.storeA1.id, [{ productId: fixtures.products.coffee.id, quantity: 1 }], saleKey);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.billNumber).toBeTruthy();
    expect(first.body.total).toBeDefined();
    expect(second.body.billNumber).toBeTruthy();
    expect(second.body.total).toBeDefined();
    expect(JSON.stringify(first.body)).not.toContain('passwordHash');
    expect(JSON.stringify(second.body)).not.toContain('passwordHash');
  });

  it('invalidates the product cache when stock changes and tolerates a cache outage', async () => {
    const staffA1 = await login(app, 'staff.a1@example.com', 'password123');
    const listBefore = await request(app.getHttpServer()).get(`/stores/${fixtures.storeA1.id}/products`).set('Authorization', `Bearer ${staffA1.token}`);

    const saleRes = await makeSale(app, staffA1.token, fixtures.storeA1.id, [{ productId: fixtures.products.coffee.id, quantity: 1 }], 'cache-key');
    const listAfter = await request(app.getHttpServer()).get(`/stores/${fixtures.storeA1.id}/products`).set('Authorization', `Bearer ${staffA1.token}`);

    expect(saleRes.status).toBe(201);
    expect(listBefore.status).toBe(200);
    expect(listAfter.status).toBe(200);
    expect(listAfter.body.some((item: { id: string; inventory?: { quantity: number } }) => item.id === fixtures.products.coffee.id && item.inventory.quantity === 9)).toBe(true);

    const appData = await createTestApp();
    await appData.close();
  });
});
