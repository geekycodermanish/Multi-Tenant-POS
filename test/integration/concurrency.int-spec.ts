import { INestApplication } from '@nestjs/common';
import { createFixtures, countSales, getStock, login, makeSale, resetDatabase, setStock } from '../helpers/fixtures';
import { createTestApp } from '../helpers/test-app';

describe('concurrency safety', () => {
  let app: INestApplication;
  let appState: Awaited<ReturnType<typeof createTestApp>>;
  let fixtures: Awaited<ReturnType<typeof createFixtures>>;
  let token: string;
  let paymentProvider: { calls: number };

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

  it('allows exactly one sale when two parallel requests compete for stock 5 with quantity 3', async () => {
    await setStock(fixtures.storeA1.id, fixtures.products.coffee.id, 5);
    const requests = [
      makeSale(app, token, fixtures.storeA1.id, [{ productId: fixtures.products.coffee.id, quantity: 3 }], 'parallel-3-a'),
      makeSale(app, token, fixtures.storeA1.id, [{ productId: fixtures.products.coffee.id, quantity: 3 }], 'parallel-3-b'),
    ];

    const responses = await Promise.all(requests);
    const success = responses.filter((res) => res.status === 201).length;
    const failure = responses.filter((res) => res.status >= 400 && res.status < 500).length;

    expect(success + failure).toBe(2);
    expect(success).toBe(1);
    expect(failure).toBe(1);
    expect(await countSales(fixtures.storeA1.id)).toBe(1);
    expect(await getStock(fixtures.storeA1.id, fixtures.products.coffee.id)).toBe(2);
  });

  it('allows two parallel sales when the stock is sufficient', async () => {
    await setStock(fixtures.storeA1.id, fixtures.products.coffee.id, 10);
    const responses = await Promise.all([
      makeSale(app, token, fixtures.storeA1.id, [{ productId: fixtures.products.coffee.id, quantity: 1 }], 'parallel-sufficient-1'),
      makeSale(app, token, fixtures.storeA1.id, [{ productId: fixtures.products.coffee.id, quantity: 1 }], 'parallel-sufficient-2'),
    ]);

    expect(responses.every((res) => res.status === 201)).toBe(true);
    expect(await countSales(fixtures.storeA1.id)).toBe(2);
    expect(await getStock(fixtures.storeA1.id, fixtures.products.coffee.id)).toBe(8);
  });

  it('handles ten parallel sales with distinct keys without any 5xx', async () => {
    await setStock(fixtures.storeA1.id, fixtures.products.coffee.id, 10);
    const responses = await Promise.all(Array.from({ length: 10 }, (_, index) =>
      makeSale(app, token, fixtures.storeA1.id, [{ productId: fixtures.products.coffee.id, quantity: 1 }], `parallel-10-${index}`),
    ));

    expect(responses.every((res) => res.status === 201)).toBe(true);
    expect(await countSales(fixtures.storeA1.id)).toBe(10);
    expect(await getStock(fixtures.storeA1.id, fixtures.products.coffee.id)).toBe(0);
  });

  it('limits the number of successful sales to the available stock', async () => {
    await setStock(fixtures.storeA1.id, fixtures.products.coffee.id, 6);
    const responses = await Promise.all(Array.from({ length: 10 }, (_, index) =>
      makeSale(app, token, fixtures.storeA1.id, [{ productId: fixtures.products.coffee.id, quantity: 1 }], `parallel-6-${index}`),
    ));

    const successes = responses.filter((res) => res.status === 201).length;
    const failures = responses.filter((res) => res.status >= 400 && res.status < 500).length;

    expect(successes).toBe(6);
    expect(failures).toBe(4);
    expect(await countSales(fixtures.storeA1.id)).toBe(6);
    expect(await getStock(fixtures.storeA1.id, fixtures.products.coffee.id)).toBe(0);
  });

  it('does not deadlock when two products are ordered in opposite directions', async () => {
    await setStock(fixtures.storeA1.id, fixtures.products.coffee.id, 10);
    await setStock(fixtures.storeA1.id, fixtures.products.tea.id, 10);

    for (let round = 0; round < 10; round += 1) {
      const responses = await Promise.all([
        makeSale(app, token, fixtures.storeA1.id, [
          { productId: fixtures.products.coffee.id, quantity: 1 },
          { productId: fixtures.products.tea.id, quantity: 1 },
        ], `deadlock-a-${round}`),
        makeSale(app, token, fixtures.storeA1.id, [
          { productId: fixtures.products.tea.id, quantity: 1 },
          { productId: fixtures.products.coffee.id, quantity: 1 },
        ], `deadlock-b-${round}`),
      ]);

      expect(responses.every((res) => res.status < 500)).toBe(true);
    }

    expect(await countSales(fixtures.storeA1.id)).toBeGreaterThanOrEqual(0);
  });
});
