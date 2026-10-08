import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import request = require('supertest');
import { User, UserRole } from '../../src/database/entities';
import { createFixtures, login, resetDatabase } from '../helpers/fixtures';
import { createTestApp } from '../helpers/test-app';

describe('platform admin provisioning', () => {
  let app: INestApplication;
  let appState: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    appState = await createTestApp();
    app = appState.app;
  });

  beforeEach(async () => {
    await resetDatabase();
    await createFixtures();
    await appState.cache.reset();
    appState.paymentProvider.reset();
  });

  afterAll(async () => {
    await appState.close();
  });

  it('lets the platform admin create a merchant owner who manages store staff', async () => {
    await User.create({
      name: 'Platform Admin',
      email: 'platform@example.com',
      password: await bcrypt.hash('platform-password', 1),
      role: UserRole.PLATFORM_ADMIN,
      merchantId: null,
      storeId: null,
    });
    const platform = await login(app, 'platform@example.com', 'platform-password');

    const created = await request(app.getHttpServer())
      .post('/merchants')
      .set('Authorization', `Bearer ${platform.token}`)
      .send({
        name: 'New Merchant',
        email: 'new-merchant@example.com',
        adminName: 'Merchant Owner',
        adminEmail: 'owner@example.com',
        adminPassword: 'owner-password',
      })
      .expect(201);

    expect(created.body.merchant.name).toBe('New Merchant');
    expect(created.body.admin.role).toBe(UserRole.MERCHANT_ADMIN);
    expect(created.body.admin.merchantId).toBe(created.body.merchant.id);
    expect(created.body.admin).not.toHaveProperty('password');

    const owner = await login(app, 'owner@example.com', 'owner-password');
    const store = await request(app.getHttpServer())
      .post('/stores')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ name: 'Owner Store' })
      .expect(201);
    const staff = await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        name: 'Store Staff',
        email: 'staff@new-merchant.example.com',
        password: 'staff-password',
        storeId: store.body.id,
      })
      .expect(201);

    expect(staff.body.role).toBe(UserRole.STORE_STAFF);
    expect(staff.body.storeId).toBe(store.body.id);

    await request(app.getHttpServer())
      .get('/stores')
      .set('Authorization', `Bearer ${platform.token}`)
      .expect(403);
    await request(app.getHttpServer())
      .post('/merchants')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        name: 'Forbidden Merchant',
        email: 'forbidden@example.com',
        adminName: 'Forbidden Owner',
        adminEmail: 'forbidden-owner@example.com',
        adminPassword: 'owner-password',
      })
      .expect(403);
  });
});
