import { NotFoundException } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { Merchant, User } from '../../database/entities';
import { MerchantsService } from './merchants.service';

describe('MerchantsService', () => {
  const merchantA = { id: 'merchant-a', name: 'A', isActive: true };
  const merchantB = { id: 'merchant-b', name: 'B', isActive: true };
  const adminModel = {
    id: 'admin-id',
    toJSON: () => ({
      id: 'admin-id',
      email: 'owner@example.com',
      password: 'hashed',
    }),
  };
  let merchantModel: { findAll: jest.Mock; findOne: jest.Mock; create: jest.Mock };
  let userModel: { findOne: jest.Mock; create: jest.Mock };
  let sequelize: { transaction: jest.Mock };
  let service: MerchantsService;

  beforeEach(() => {
    merchantModel = {
      findAll: jest.fn().mockResolvedValue([merchantA]),
      findOne: jest.fn().mockResolvedValue(merchantA),
      create: jest.fn().mockResolvedValue(merchantA),
    };
    userModel = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(adminModel),
    };
    sequelize = {
      transaction: jest.fn(async (callback) => callback({})),
    };
    service = new MerchantsService(
      merchantModel as unknown as typeof Merchant,
      userModel as unknown as typeof User,
      sequelize as unknown as Sequelize,
    );
  });

  it('returns only the caller merchant', async () => {
    merchantModel.findAll.mockResolvedValueOnce([merchantA]);
    const scopedService = service as unknown as {
      findAll(user: User): Promise<Merchant[]>;
    };

    await expect(scopedService.findAll({ merchantId: merchantA.id } as User)).resolves.toEqual([merchantA]);
    expect(merchantModel.findAll).toHaveBeenCalledWith({
      where: { id: merchantA.id, isActive: true },
    });
  });

  it('returns NotFoundException for another merchant id', async () => {
    const scopedService = service as unknown as {
      findOne(id: string, user: User): Promise<Merchant>;
    };

    await expect(
      scopedService.findOne(merchantB.id, { merchantId: merchantA.id } as User),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(merchantModel.findOne).not.toHaveBeenCalled();
  });

  it('creates a merchant and its first merchant admin atomically without returning the password', async () => {
    merchantModel.findOne.mockResolvedValue(null);
    const result = await service.create({
      name: 'New Merchant',
      email: 'merchant@example.com',
      adminName: 'Owner',
      adminEmail: 'owner@example.com',
      adminPassword: 'password123',
    });

    expect(sequelize.transaction).toHaveBeenCalledTimes(1);
    expect(merchantModel.create).toHaveBeenCalledWith(
      { name: 'New Merchant', email: 'merchant@example.com' },
      { transaction: expect.any(Object) },
    );
    expect(userModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'owner@example.com',
        role: 'merchant_admin',
        merchantId: merchantA.id,
        storeId: null,
      }),
      { transaction: expect.any(Object) },
    );
    expect(result.admin).not.toHaveProperty('password');
  });
});
