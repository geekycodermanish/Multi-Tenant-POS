import { INestApplication } from '@nestjs/common';
import { Product } from '../../src/database/entities';
import { createFixtures, countPayments, countSales, getStock, login, makeSale, resetDatabase } from '../helpers/fixtures';
import { createTestApp } from '../helpers/test-app';

describe('sales inventory rules', () => {
  let app: INestApplication;
  let appState: Awaited<ReturnType<typeof createTestApp>>;
  let token: string;
  let fixtures: Awaited<ReturnType<typeof createFixtures>>;
  let paymentProvider: { setNextResult: (result: 'SUCCESS' | 'FAILED') => void; calls: number };

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

  it('rejects stock above available and does not call the payment provider', async () => {
    const res = await makeSale(app, token, fixtures.storeA1.id, [{ productId: fixtures.products.coffee.id, quantity: 999 }], 'excess-stock-key');

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(await countSales(fixtures.storeA1.id)).toBe(0);
    expect(await countPayments()).toBe(0);
    expect(paymentProvider.calls).toBe(0);
    expect(await getStock(fixtures.storeA1.id, fixtures.products.coffee.id)).toBe(10);
  });

  it('keeps the whole request atomic when one item is short', async () => {
    const beforeCoffee = await getStock(fixtures.storeA1.id, fixtures.products.coffee.id);
    const beforeTea = await getStock(fixtures.storeA1.id, fixtures.products.tea.id);

    const res = await makeSale(app, token, fixtures.storeA1.id, [
      { productId: fixtures.products.coffee.id, quantity: 9 },
      { productId: fixtures.products.tea.id, quantity: 9 },
    ], 'partial-failure-key');

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await countSales(fixtures.storeA1.id)).toBe(0);
    expect(await getStock(fixtures.storeA1.id, fixtures.products.coffee.id)).toBe(beforeCoffee);
    expect(await getStock(fixtures.storeA1.id, fixtures.products.tea.id)).toBe(beforeTea);
  });

  it('rejects missing inventory or inactive products with 404 and no state change', async () => {
    const product = await Product.findOne({ where: { id: fixtures.products.coffee.id } });
    await product!.update({ isActive: false });

    const inactiveRes = await makeSale(app, token, fixtures.storeA1.id, [{ productId: fixtures.products.coffee.id, quantity: 1 }], 'inactive-product-key');
    expect(inactiveRes.status).toBe(404);

    const storeQ = await Product.create({ name: 'A1 orphan', priceCents: 200, storeId: fixtures.storeA1.id } as any);
    await storeQ.destroy();
    const res = await makeSale(app, token, fixtures.storeA1.id, [{ productId: storeQ.id, quantity: 1 }], 'missing-inventory-key');
    expect(res.status).toBe(404);
    expect(await countSales(fixtures.storeA1.id)).toBe(0);
  });

  it('merges duplicate product IDs and checks the combined quantity', async () => {
    const res = await makeSale(app, token, fixtures.storeA1.id, [
      { productId: fixtures.products.coffee.id, quantity: 1 },
      { productId: fixtures.products.coffee.id, quantity: 2 },
    ], 'duplicate-merge-key');

    expect(res.status).toBe(201);
    expect(res.body.total).toBe(750);
    expect(await countSales(fixtures.storeA1.id)).toBe(1);
    expect(await getStock(fixtures.storeA1.id, fixtures.products.coffee.id)).toBe(7);
  });

  it('never allows stock to go negative', async () => {
    const res = await makeSale(app, token, fixtures.storeA1.id, [{ productId: fixtures.products.coffee.id, quantity: 11 }], 'negative-stock-key');

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await getStock(fixtures.storeA1.id, fixtures.products.coffee.id)).toBe(10);
  });
});
