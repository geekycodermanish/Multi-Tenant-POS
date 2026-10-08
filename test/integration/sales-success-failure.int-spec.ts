import { INestApplication } from '@nestjs/common';
import { createFixtures, countPayments, countSales, getStock, login, makeSale, resetDatabase } from '../helpers/fixtures';
import { createTestApp } from '../helpers/test-app';

describe('sales success and failure', () => {
  let app: INestApplication;
  let appState: Awaited<ReturnType<typeof createTestApp>>;
  let fixtures: Awaited<ReturnType<typeof createFixtures>>;
  let token: string;

  beforeAll(async () => {
    appState = await createTestApp();
    app = appState.app;
  });

  beforeEach(async () => {
    await resetDatabase();
    fixtures = await createFixtures();
    await appState.cache.reset();
    appState.paymentProvider.reset();
    ({ token } = await login(app, 'staff.a1@example.com', 'password123'));
  });

  afterAll(async () => {
    await appState.close();
  });

  it('creates a successful sale and decrements stock', async () => {
    const res = await makeSale(app, token, fixtures.storeA1.id, [{ productId: fixtures.products.coffee.id, quantity: 2 }], 'sale-key-1');

    expect(res.status).toBe(201);
    expect(res.body.saleId).toEqual(expect.any(String));
    expect(res.body.billNumber).toMatch(/^BILL-/);
    expect(res.body.status).toBe('completed');
    expect(res.body.paymentStatus).toBe('success');
    expect(res.body.total).toBe(500);
    expect(res.body.items[0].subtotal).toBe(500);
    expect(await countSales(fixtures.storeA1.id)).toBe(1);
    expect(await countPayments()).toBe(1);
    expect(await getStock(fixtures.storeA1.id, fixtures.products.coffee.id)).toBe(8);
  });

  it('rejects client-supplied non-whitelisted fields', async () => {
    const res = await makeSale(
      app,
      token,
      fixtures.storeA1.id,
      [{ productId: fixtures.products.coffee.id, quantity: 1 }],
      'bad-body-key',
      { merchantId: fixtures.merchantA.id, total: 9999 },
    );

    expect(res.status).toBe(400);
    expect(await countSales(fixtures.storeA1.id)).toBe(0);
  });

  it('fails the payment without creating sale rows', async () => {
    const paymentProvider = (app as any).get('PAYMENT_PROVIDER');
    paymentProvider?.setNextResult?.('FAILED');

    const res = await makeSale(app, token, fixtures.storeA1.id, [{ productId: fixtures.products.coffee.id, quantity: 1 }], 'failed-payment-key');

    expect(res.status).toBe(400);
    expect(await countSales(fixtures.storeA1.id)).toBe(0);
    expect(await countPayments()).toBe(0);
    expect(await getStock(fixtures.storeA1.id, fixtures.products.coffee.id)).toBe(10);
  });

  it('assigns unique bill numbers to consecutive sales', async () => {
    const first = await makeSale(app, token, fixtures.storeA1.id, [{ productId: fixtures.products.coffee.id, quantity: 1 }], 'bill-key-1');
    const second = await makeSale(app, token, fixtures.storeA1.id, [{ productId: fixtures.products.tea.id, quantity: 1 }], 'bill-key-2');

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.billNumber).not.toBe(second.body.billNumber);
  });
});
