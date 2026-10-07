import { NotFoundException } from '@nestjs/common';
import { Inventory, Product, User, UserRole } from '../../database/entities';
import { StoresService } from '../stores/stores.service';
import { ProductsService } from './products.service';

describe('ProductsService store scoping', () => {
  const storeId = 'store-a';
  const productId = 'product-in-store-b';
  let productModel: { findOne: jest.Mock; create: jest.Mock };
  let inventoryModel: { create: jest.Mock };
  let cacheManager: { get: jest.Mock; set: jest.Mock; del: jest.Mock };
  let storesService: { assertStoreAccess: jest.Mock };
  let service: ProductsService;
  let scopedService: {
    findOne(storeId: string, id: string, user: User): Promise<Product>;
    update(storeId: string, id: string, dto: object, user: User): Promise<Product>;
    remove(storeId: string, id: string, user: User): Promise<void>;
  };
  const user = {
    merchantId: 'merchant-a',
    storeId,
    role: UserRole.STORE_STAFF,
  } as User;

  beforeEach(() => {
    productModel = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    };
    inventoryModel = { create: jest.fn() };
    cacheManager = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };
    storesService = { assertStoreAccess: jest.fn().mockResolvedValue({ id: storeId }) };
    service = new ProductsService(
      productModel as unknown as typeof Product,
      inventoryModel as unknown as typeof Inventory,
      cacheManager as any,
      storesService as unknown as StoresService,
    );
    scopedService = service as unknown as typeof scopedService;
  });

  it.each(['GET', 'PUT', 'DELETE'])('%s hides a product from a different store with a store-bound query', async (method) => {
    if (method === 'GET') {
      await expect(scopedService.findOne(storeId, productId, user)).rejects.toBeInstanceOf(NotFoundException);
    } else if (method === 'PUT') {
      await expect(scopedService.update(storeId, productId, {}, user)).rejects.toBeInstanceOf(NotFoundException);
    } else {
      await expect(scopedService.remove(storeId, productId, user)).rejects.toBeInstanceOf(NotFoundException);
    }

    expect(storesService.assertStoreAccess).toHaveBeenCalledWith(user, storeId);
    expect(productModel.findOne).toHaveBeenCalledWith({
      where: { id: productId, storeId, isActive: true },
      include: [{ model: Inventory, as: 'inventory' }],
    });
  });

  it('creates against the verified route store rather than a body-supplied store', async () => {
    const product = { id: 'new-product', storeId };
    productModel.create = jest.fn().mockResolvedValue(product);
    inventoryModel.create.mockResolvedValue({});

    await service.create(
      storeId,
      {
        name: 'Coffee',
        priceCents: 500,
        storeId: 'store-b',
        merchantId: 'merchant-b',
      } as any,
      user,
    );

    expect(storesService.assertStoreAccess).toHaveBeenCalledWith(user, storeId);
    expect(productModel.create).toHaveBeenCalledWith({
      name: 'Coffee',
      priceCents: 500,
      storeId,
    });
  });
});
