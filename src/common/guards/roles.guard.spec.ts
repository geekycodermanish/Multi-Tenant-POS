import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../../database/entities';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  };
  const guard = new RolesGuard(reflector as any);
  const context = (role: UserRole) =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user: { role } }),
      }),
    }) as any;

  beforeEach(() => reflector.getAllAndOverride.mockReset());

  it('does not allow platform admins through routes without an explicit platform role', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    expect(() => guard.canActivate(context(UserRole.PLATFORM_ADMIN))).toThrow(
      ForbiddenException,
    );
  });

  it('allows platform admins only when the route explicitly requires that role', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.PLATFORM_ADMIN]);

    expect(guard.canActivate(context(UserRole.PLATFORM_ADMIN))).toBe(true);
  });

  it('preserves unannotated routes for tenant roles', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    expect(guard.canActivate(context(UserRole.MERCHANT_ADMIN))).toBe(true);
  });
});
