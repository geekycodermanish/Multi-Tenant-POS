import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request = require('supertest');
import { Product, Sale } from '../../src/database/entities';
import { createFixtures, login, makeSale, resetDatabase } from '../helpers/fixtures';
import { createTestApp } from '../helpers/test-app';

describe('tenant isolation', () => {
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

  it('returns 404 when another merchant or store staff accesses A1 resources', async () => {
    const adminB = await login(app, 'admin.b@example.com', 'password123');
    const staffB1 = await login(app, 'staff.b1@example.com', 'password123');
    const saleRes = await makeSale(app, adminB.token, fixtures.storeA1.id, [{ productId: fixtures.products.coffee.id, quantity: 1 }], 'sale-tenant-key');
    const saleId = saleRes.body.saleId;

    const forbidden = [
      { method: 'get', path: `/stores/${fixtures.storeA1.id}/products` },
      { method: 'get', path: `/stores/${fixtures.storeA1.id}/products/${fixtures.products.coffee.id}` },
      { method: 'put', path: `/stores/${fixtures.storeA1.id}/products/${fixtures.products.coffee.id}`, body: { name: 'Mov ed' } },
      { method: 'delete', path: `/stores/${fixtures.storeA1.id}/products/${fixtures.products.coffee.id}` },
      { method: 'get', path: `/stores/${fixtures.storeA1.id}/inventory` },
      { method: 'put', path: `/stores/${fixtures.storeA1.id}/inventory/products/${fixtures.products.coffee.id}`, body: { quantityDelta: 1 } },
      { method: 'get', path: `/stores/${fixtures.storeA1.id}/sales` },
      { method: 'get', path: `/stores/${fixtures.storeA1.id}/sales/${saleId}` },
      { method: 'post', path: `/stores/${fixtures.storeA1.id}/sales`, body: { items: [{ productId: fixtures.products.coffee.id, quantity: 1 }], paymentMethod: 'cash' } },
    ];

    for (const route of forbidden) {
      const req = request(app.getHttpServer())[route.method](route.path).set('Authorization', `Bearer ${adminB.token}`);
      if (route.body) req.send(route.body);
      const res = await req;
      expect(res.status).toBe(404);
    }

    const forbiddenStaff = [
      { method: 'get', path: `/stores/${fixtures.storeA1.id}/products` },
      { method: 'get', path: `/stores/${fixtures.storeA1.id}/sales` },
    ];
    for (const route of forbiddenStaff) {
      const req = request(app.getHttpServer())[route.method](route.path).set('Authorization', `Bearer ${staffB1.token}`);
      const res = await req;
      expect(res.status).toBe(404);
    }
  });

  it('prevents a staff member from reaching another store in the same merchant and blocks ID swap attacks', async () => {
    const staffA1 = await login(app, 'staff.a1@example.com', 'password123');
    const a2Product = await Product.findOne({ where: { storeId: fixtures.storeA2.id } });
    const otherSale = await Sale.create({ storeId: fixtures.storeA2.id, billNumber: 'BILL-999', totalCents: 100, status: 'completed', idempotencyKey: 'swap-sale-key', createdById: fixtures.staffA2.id } as any);

    const res1 = await request(app.getHttpServer()).get(`/stores/${fixtures.storeA2.id}/products`).set('Authorization', `Bearer ${staffA1.token}`);
    const res2 = await request(app.getHttpServer()).get(`/stores/${fixtures.storeA2.id}/inventory`).set('Authorization', `Bearer ${staffA1.token}`);
    const res3 = await request(app.getHttpServer()).get(`/stores/${fixtures.storeA2.id}/sales`).set('Authorization', `Bearer ${staffA1.token}`);
    const res4 = await request(app.getHttpServer()).get(`/stores/${fixtures.storeA2.id}/sales/${otherSale.id}`).set('Authorization', `Bearer ${staffA1.token}`);
    const res5 = await request(app.getHttpServer()).get(`/stores/${fixtures.storeA1.id}/products/${a2Product!.id}`).set('Authorization', `Bearer ${staffA1.token}`);
    const res6 = await request(app.getHttpServer()).get(`/stores/${fixtures.storeA1.id}/inventory/products/${a2Product!.id}`).set('Authorization', `Bearer ${staffA1.token}`);
    const res7 = await request(app.getHttpServer()).post(`/stores/${fixtures.storeA1.id}/sales`).set('Authorization', `Bearer ${staffA1.token}`).set('idempotency-key', 'swap-key').send({ items: [{ productId: a2Product!.id, quantity: 1 }], paymentMethod: 'cash' });

    expect(res1.status).toBe(404);
    expect(res2.status).toBe(404);
    expect(res3.status).toBe(404);
    expect(res4.status).toBe(404);
    expect(res5.status).toBe(404);
    expect(res6.status).toBe(404);
    expect(res7.status).toBe(404);
  });

  it('shows only the caller merchant and only the caller store membership', async () => {
    const adminA = await login(app, 'admin.a@example.com', 'password123');
    const staffA1 = await login(app, 'staff.a1@example.com', 'password123');

    const merchantRes = await request(app.getHttpServer()).get('/merchants').set('Authorization', `Bearer ${adminA.token}`);
    const merchantDetailRes = await request(app.getHttpServer()).get(`/merchants/${fixtures.merchantB.id}`).set('Authorization', `Bearer ${adminA.token}`);

    expect(merchantRes.status).toBe(200);
    expect(merchantRes.body).toHaveLength(1);
    expect(merchantRes.body[0].id).toBe(fixtures.merchantA.id);
    expect(merchantDetailRes.status).toBe(404);

    const storesRes = await request(app.getHttpServer()).get('/stores').set('Authorization', `Bearer ${adminA.token}`);
    const staffStoresRes = await request(app.getHttpServer()).get('/stores').set('Authorization', `Bearer ${staffA1.token}`);

    expect(storesRes.status).toBe(200);
    expect(storesRes.body.map((store: { id: string }) => store.id).sort()).toEqual([fixtures.storeA1.id, fixtures.storeA2.id].sort());
    expect(staffStoresRes.status).toBe(200);
    expect(staffStoresRes.body.map((store: { id: string }) => store.id)).toEqual([fixtures.storeA1.id]);
  });

  it('requires a valid token or a signed JWT to access protected routes', async () => {
    const resMissing = await request(app.getHttpServer()).get('/stores');
    const jwt = new JwtService({ secret: 'wrong-secret', signOptions: { expiresIn: '8h' } });
    const badToken = jwt.sign({ sub: fixtures.adminA.id, email: fixtures.adminA.email, role: 'merchant_admin', merchantId: fixtures.merchantA.id, storeId: fixtures.storeA1.id });
    const resTampered = await request(app.getHttpServer()).get('/stores').set('Authorization', `Bearer ${badToken}`);

    expect(resMissing.status).toBe(401);
    expect(resTampered.status).toBe(401);
  });
});
