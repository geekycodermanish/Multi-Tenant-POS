import { BadRequestException } from '@nestjs/common';
import { Transaction } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import {
  IdempotencyKey,
  Inventory,
  Payment,
  PaymentMethod,
  PaymentStatus,
  Product,
  Sale,
  SaleItem,
  SaleStatus,
  User,
} from '../../database/entities';
import { ProductCacheService } from '../products/product-cache.service';
import { IPaymentProvider } from '../payments/payment-provider.interface';
import { StoresService } from '../stores/stores.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { SalesService } from './sales.service';

describe('SalesService cache invalidation', () => {
  const storeId = 'store-1';
  const user = { id: 'user-1' } as User;
  const key = 'cache-test-key';
  let inventoryModel: { findAll: jest.Mock };
  let productModel: { findAll: jest.Mock };
  let idempotencyModel: { findOne: jest.Mock; create: jest.Mock };
  let saleModel: { create: jest.Mock; findOne: jest.Mock };
  let sequelize: { transaction: jest.Mock; query: jest.Mock };
  let paymentProvider: { charge: jest.Mock };
  let productCache: { invalidateStore: jest.Mock };
  let storesService: { assertStoreAccess: jest.Mock };
  let service: SalesService;
  let transaction: Transaction;
  const createDto = (): CreateSaleDto => ({
    items: [{ productId: 'product-1', quantity: 1 }],
    paymentMethod: PaymentMethod.CASH,
  } as CreateSaleDto);

  beforeEach(() => {
    transaction = { LOCK: { UPDATE: 'UPDATE' } } as unknown as Transaction;
    const inventory = {
      productId: 'product-1',
      quantity: 10,
      update: jest.fn().mockResolvedValue(undefined),
    };
    const sale = {
      id: 'sale-1',
      billNumber: 'BILL-00000001',
      status: SaleStatus.PENDING,
      totalCents: 500,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      update: jest.fn().mockImplementation(async (values) => Object.assign(sale, values)),
    };
    inventoryModel = { findAll: jest.fn().mockResolvedValue([inventory]) };
    productModel = {
      findAll: jest.fn().mockResolvedValue([{ id: 'product-1', name: 'Coffee', priceCents: 500 }]),
    };
    idempotencyModel = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    };
    saleModel = {
      create: jest.fn().mockResolvedValue(sale),
      findOne: jest.fn().mockResolvedValue(null),
    };
    sequelize = {
      transaction: jest.fn().mockImplementation(async (_options, callback) => {
        const result = await callback(transaction);
        transactionCommitted();
        return result;
      }),
      query: jest.fn().mockImplementation(async (query, options) => {
        if (typeof query === 'string' && query.includes('nextval')) {
          return [{ billNumber: 'BILL-00000001' }];
        }
        return [];
      }),
    };
    paymentProvider = { charge: jest.fn().mockResolvedValue({ success: true }) };
    productCache = { invalidateStore: jest.fn().mockResolvedValue(undefined) };
    storesService = { assertStoreAccess: jest.fn().mockResolvedValue({ id: storeId }) };
    service = new (SalesService as any)(
      saleModel as unknown as typeof Sale,
      { bulkCreate: jest.fn().mockResolvedValue([]) } as unknown as typeof SaleItem,
      { create: jest.fn().mockResolvedValue({}) } as unknown as typeof Payment,
      inventoryModel as unknown as typeof Inventory,
      productModel as unknown as typeof Product,
      idempotencyModel as unknown as typeof IdempotencyKey,
      sequelize as unknown as Sequelize,
      paymentProvider as IPaymentProvider,
      storesService as unknown as StoresService,
      productCache as unknown as ProductCacheService,
    );
  });

  const transactionCommitted = jest.fn();

  it('invalidates once after the transaction has resolved', async () => {
    transactionCommitted.mockReset();
    productCache.invalidateStore.mockImplementationOnce(async () => {
      expect(transactionCommitted).toHaveBeenCalledTimes(1);
    });

    await service.createSale(storeId, createDto(), key, user);

    expect(productCache.invalidateStore).toHaveBeenCalledTimes(1);
    expect(productCache.invalidateStore).toHaveBeenCalledWith(storeId);
  });

  it('does not invalidate when stock validation fails', async () => {
    inventoryModel.findAll.mockResolvedValueOnce([{
      productId: 'product-1',
      quantity: 0,
      update: jest.fn(),
    }]);

    await expect(service.createSale(storeId, createDto(), key, user))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(productCache.invalidateStore).not.toHaveBeenCalled();
  });

  it('does not invalidate when payment fails', async () => {
    paymentProvider.charge.mockResolvedValueOnce({ success: false, failureReason: 'declined' });

    await expect(service.createSale(storeId, createDto(), key, user))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(productCache.invalidateStore).not.toHaveBeenCalled();
  });

  it('does not invalidate on idempotent replay', async () => {
    const { createRequestHash } = require('./idempotency.util');
    idempotencyModel.findOne.mockResolvedValueOnce({
      requestHash: createRequestHash(storeId, createDto()),
      saleId: 'sale-1',
    });
    saleModel.findOne.mockResolvedValueOnce({
      id: 'sale-1',
      billNumber: 'BILL-00000001',
      status: SaleStatus.COMPLETED,
      totalCents: 500,
      createdAt: new Date(),
      payment: { status: PaymentStatus.SUCCESS },
      items: [{
        productId: 'product-1',
        quantity: 1,
        unitPriceCents: 500,
        subtotalCents: 500,
        product: { name: 'Coffee' },
      }],
    });

    await service.createSale(storeId, createDto(), key, user);

    expect(productCache.invalidateStore).not.toHaveBeenCalled();
    expect(sequelize.transaction).not.toHaveBeenCalled();
  });

  it('returns the committed response when cache invalidation rejects', async () => {
    productCache.invalidateStore.mockRejectedValueOnce(new Error('redis down'));

    await expect(service.createSale(storeId, createDto(), key, user))
      .resolves.toMatchObject({ saleId: 'sale-1', billNumber: 'BILL-00000001' });
  });
});
