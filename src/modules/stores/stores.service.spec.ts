import { NotFoundException } from '@nestjs/common';
import { Store, User, UserRole } from '../../database/entities';
import { StoresService } from './stores.service';

describe('StoresService access', () => {
  const storeA = { id: 'store-a', merchantId: 'merchant-a', isActive: true };
  const storeB = { id: 'store-b', merchantId: 'merchant-a', isActive: true };
  const storeOtherMerchant = { id: 'store-c', merchantId: 'merchant-b', isActive: true };
  let storeModel: { findAll: jest.Mock; findOne: jest.Mock };
  let service: StoresService;
  let scopedService: {
    assertStoreAccess(user: User, storeId: string): Promise<Store>;
  };

  beforeEach(() => {
    storeModel = {
      findAll: jest.fn().mockImplementation(({ where }) =>
        Promise.resolve(where.id ? [storeA] : [storeA, storeB]),
      ),
      findOne: jest.fn().mockResolvedValue(storeA),
    };
    service = new StoresService(storeModel as unknown as typeof Store);
    scopedService = service as unknown as typeof scopedService;
  });

  it('allows an admin to access any store of their merchant', async () => {
    storeModel.findOne.mockResolvedValueOnce(storeB);

    await expect(
      scopedService.assertStoreAccess(
        { merchantId: 'merchant-a', role: UserRole.MERCHANT_ADMIN } as User,
        storeB.id,
      ),
    ).resolves.toBe(storeB);
    expect(storeModel.findOne).toHaveBeenCalledWith({ where: { id: storeB.id } });
  });

  it('hides a store belonging to another merchant from an admin', async () => {
    storeModel.findOne.mockResolvedValueOnce(storeOtherMerchant);

    await expect(
      scopedService.assertStoreAccess(
        { merchantId: 'merchant-a', role: UserRole.MERCHANT_ADMIN } as User,
        storeOtherMerchant.id,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('hides a sibling store from store staff', async () => {
    storeModel.findOne.mockResolvedValueOnce(storeB);

    await expect(
      scopedService.assertStoreAccess(
        { merchantId: 'merchant-a', storeId: storeA.id, role: UserRole.STORE_STAFF } as User,
        storeB.id,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('allows store staff to access their own store', async () => {
    await expect(
      scopedService.assertStoreAccess(
        { merchantId: 'merchant-a', storeId: storeA.id, role: UserRole.STORE_STAFF } as User,
        storeA.id,
      ),
    ).resolves.toBe(storeA);
  });

  it('lists only the staff member’s store', async () => {
    await expect(service.findAll({
      merchantId: 'merchant-a',
      storeId: storeA.id,
      role: UserRole.STORE_STAFF,
    } as User)).resolves.toEqual([storeA]);

    expect(storeModel.findAll).toHaveBeenCalledWith({
      where: { merchantId: 'merchant-a', id: storeA.id, isActive: true },
    });
  });

  it('lists all merchant stores for an admin', async () => {
    await expect(service.findAll({
      merchantId: 'merchant-a',
      role: UserRole.MERCHANT_ADMIN,
    } as User)).resolves.toEqual([storeA, storeB]);

    expect(storeModel.findAll).toHaveBeenCalledWith({
      where: { merchantId: 'merchant-a', isActive: true },
    });
  });
});
