import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { User, UserRole } from '../../database/entities';
import { CreateUserDto } from './dto/create-user.dto';
import { UsersService } from './users.service';

describe('UsersService', () => {
  const merchantId = 'merchant-a';
  const storeId = 'store-a';
  let userModel: {
    findOne: jest.Mock;
    create: jest.Mock;
    findAll: jest.Mock;
  };
  let storeModel: { findOne: jest.Mock };
  let sequelizeConnection: { model: jest.Mock };
  let service: UsersService;

  const asModel = <T>(value: object): T => value as T;
  const storedUser = (overrides: Record<string, unknown> = {}) => ({
    id: 'user-1',
    name: 'Staff',
    email: 'staff@example.com',
    password: 'hashed-password',
    passwordHash: 'another-hash',
    role: UserRole.STORE_STAFF,
    merchantId,
    storeId,
    toJSON: () => ({
      id: 'user-1',
      name: 'Staff',
      email: 'staff@example.com',
      password: 'hashed-password',
      passwordHash: 'another-hash',
      role: UserRole.STORE_STAFF,
      merchantId,
      storeId,
      ...overrides,
    }),
  });

  beforeEach(() => {
    userModel = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(async (values) => ({
        ...values,
        toJSON: () => ({ ...values, id: 'user-1' }),
      })),
      findAll: jest.fn().mockResolvedValue([]),
    };
    storeModel = {
      findOne: jest.fn().mockResolvedValue({ id: storeId, merchantId }),
    };
    sequelizeConnection = { model: jest.fn().mockReturnValue(storeModel) };
    service = new UsersService(
      asModel<typeof User>(userModel),
      sequelizeConnection as unknown as Sequelize,
    );
  });

  it('rejects a store belonging to another merchant', async () => {
    storeModel.findOne.mockResolvedValueOnce(null);
    const dto = {
      name: 'Staff',
      email: 'staff@example.com',
      password: 'password123',
      storeId: 'foreign-store',
    };

    await expect(service.create(dto, { merchantId, role: UserRole.MERCHANT_ADMIN } as User)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(storeModel.findOne).toHaveBeenCalledWith({
      where: { id: 'foreign-store', merchantId },
    });
    expect(userModel.create).not.toHaveBeenCalled();
  });

  it('requires a store for a store-level role', async () => {
    const dto: CreateUserDto = {
      name: 'Staff',
      email: 'staff@example.com',
      password: 'password123',
      storeId: '',
    };

    await expect(service.create(dto, { merchantId, role: UserRole.MERCHANT_ADMIN } as User)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(userModel.create).not.toHaveBeenCalled();
  });

  it('creates only store staff in the caller merchant, ignoring body role and tenant fields', async () => {
    const dto = {
      name: 'Staff',
      email: 'staff@example.com',
      password: 'password123',
      role: UserRole.MERCHANT_ADMIN,
      merchantId: 'merchant-b',
      storeId,
    } as CreateUserDto;

    await service.create(dto, { merchantId, role: UserRole.MERCHANT_ADMIN } as User);

    expect(userModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        role: UserRole.STORE_STAFF,
        merchantId,
        storeId,
      }),
    );
  });

  it('omits password fields from create, list, and get-by-id responses', async () => {
    userModel.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(storedUser());
    userModel.create.mockResolvedValueOnce(storedUser());
    userModel.findAll.mockResolvedValueOnce([storedUser()]);

    const created = await service.create(
      {
        name: 'Staff',
        email: 'staff@example.com',
        password: 'password123',
        storeId,
      },
      { merchantId, role: UserRole.MERCHANT_ADMIN } as User,
    );
    const listed = await service.findAll(merchantId);
    const fetched = await service.findOne('user-1', merchantId);

    for (const result of [created, ...listed, fetched]) {
      expect(result).not.toHaveProperty('password');
      expect(result).not.toHaveProperty('passwordHash');
    }
  });
});
