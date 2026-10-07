import { NotFoundException } from '@nestjs/common';
import { Inventory, Product, User, UserRole } from '../../database/entities';
import { StoresService } from '../stores/stores.service';
import { InventoryService } from './inventory.service';

describe('InventoryService store scoping', () => {
  const storeId = 'store-a';
  const productId = 'product-in-store-b';
  let inventoryModel: { findOne: jest.Mock; findAll: jest.Mock };
  let cacheManager: { del: jest.Mock };
  let storesService: { assertStoreAccess: jest.Mock };
  let service: InventoryService;
  let scopedService: {
    adjust(storeId: string, productId: string, dto: { quantity: number }, user: User): Promise<Inventory>;
  };
  const user = {
    merchantId: 'merchant-a',
    storeId,
    role: UserRole.STORE_STAFF,
  } as User;

  beforeEach(() => {
    inventoryModel = {
      findOne: jest.fn().mockResolvedValue(null),
      findAll: jest.fn().mockResolvedValue([]),
    };
    cacheManager = { del: jest.fn() };
    storesService = { assertStoreAccess: jest.fn().mockResolvedValue({ id: storeId }) };
    service = new InventoryService(
      inventoryModel as unknown as typeof Inventory,
      cacheManager as any,
      storesService as unknown as StoresService,
    );
    scopedService = service as unknown as typeof scopedService;
  });

  it('hides inventory for a product in another store with a store-bound query', async () => {
    await expect(
      scopedService.adjust(storeId, productId, { quantity: 3 }, user),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(storesService.assertStoreAccess).toHaveBeenCalledWith(user, storeId);
    expect(inventoryModel.findOne).toHaveBeenCalledWith({
      where: { storeId, productId },
      include: ['store'],
    });
  });

  it('asserts store access before listing inventory', async () => {
    await service.findByStore(storeId, user);
    expect(storesService.assertStoreAccess).toHaveBeenCalledWith(user, storeId);
  });
});
