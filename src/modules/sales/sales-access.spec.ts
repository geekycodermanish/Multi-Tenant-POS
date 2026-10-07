import { NotFoundException } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { IdempotencyKey, Inventory, Payment, Product, Sale, SaleItem, User, UserRole } from '../../database/entities';
import { IPaymentProvider } from '../payments/payment-provider.interface';
import { StoresService } from '../stores/stores.service';
import { SalesService } from './sales.service';

describe('SalesService store scoping', () => {
  const storeId = 'store-a';
  const saleId = 'sale-in-store-b';
  let saleModel: { findOne: jest.Mock; findAll: jest.Mock };
  let storesService: { assertStoreAccess: jest.Mock };
  let sequelize: { transaction: jest.Mock };
  let service: SalesService;
  let scopedService: {
    findOne(storeId: string, id: string, user: User): Promise<Sale>;
  };
  const user = {
    id: 'user-a',
    merchantId: 'merchant-a',
    storeId,
    role: UserRole.STORE_STAFF,
  } as User;

  beforeEach(() => {
    saleModel = { findOne: jest.fn().mockResolvedValue(null), findAll: jest.fn() };
    storesService = { assertStoreAccess: jest.fn().mockResolvedValue({ id: storeId }) };
    sequelize = { transaction: jest.fn() };
    service = new SalesService(
      saleModel as unknown as typeof Sale,
      {} as typeof SaleItem,
      {} as typeof Payment,
      {} as typeof Inventory,
      {} as typeof Product,
      {} as typeof IdempotencyKey,
      sequelize as unknown as Sequelize,
      { charge: jest.fn() } as IPaymentProvider,
      storesService as unknown as StoresService,
    );
    scopedService = service as unknown as typeof scopedService;
  });

  it('hides a sale from a different store with a store-bound query', async () => {
    await expect(scopedService.findOne(storeId, saleId, user)).rejects.toBeInstanceOf(NotFoundException);

    expect(storesService.assertStoreAccess).toHaveBeenCalledWith(user, storeId);
    expect(saleModel.findOne).toHaveBeenCalledWith({
      where: { id: saleId, storeId },
      include: ['items', 'payment', 'store'],
    });
  });

  it('checks access before opening a transaction and propagates a denied access result', async () => {
    const denied = new NotFoundException('Store not found');
    storesService.assertStoreAccess.mockRejectedValueOnce(denied);

    await expect(
      service.createSale(storeId, { items: [], idempotencyKey: 'key' } as any, user),
    ).rejects.toBe(denied);

    expect(storesService.assertStoreAccess).toHaveBeenCalledWith(user, storeId);
    expect(sequelize.transaction).not.toHaveBeenCalled();
  });
});
