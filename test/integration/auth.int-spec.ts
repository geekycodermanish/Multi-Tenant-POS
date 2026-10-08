import { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { createFixtures, login, resetDatabase } from '../helpers/fixtures';
import { createTestApp } from '../helpers/test-app';

describe('auth integration', () => {
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

  it('returns a token and omits passwordHash on success', async () => {
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email: 'admin.a@example.com', password: 'password123' });
    const decoded = require('jsonwebtoken').decode(res.body.accessToken);

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(decoded.role).toBe('merchant_admin');
  });

  it('rejects wrong passwords and unknown users with the same message', async () => {
    const wrongPassword = await request(app.getHttpServer()).post('/auth/login').send({ email: 'admin.a@example.com', password: 'wrong-password' });
    const unknownUser = await request(app.getHttpServer()).post('/auth/login').send({ email: 'missing@example.com', password: 'password123' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownUser.status).toBe(401);
    expect(wrongPassword.body.error).toBe('Invalid credentials');
    expect(unknownUser.body.error).toBe('Invalid credentials');
  });

  it('blocks deactivated users', async () => {
    const user = await (await import('../../src/database/entities')).User.findOne({ where: { email: 'admin.a@example.com' } });
    await user!.update({ isActive: false });

    const res = await request(app.getHttpServer()).post('/auth/login').send({ email: 'admin.a@example.com', password: 'password123' });
    expect(res.status).toBe(401);
  });
});
