import { AuthController } from './auth.controller';

describe('AuthController', () => {
  it('does not expose a register handler', () => {
    expect(AuthController.prototype).not.toHaveProperty('register');
  });
});
