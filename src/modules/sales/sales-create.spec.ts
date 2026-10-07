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
import { IPaymentProvider } from '../payments/payment-provider.interface';
import { StoresService } from '../stores/stores.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { SalesService } from './sales.service';

const store = { id: 'store-1' };
const user = { id: 'user-1' } as User;
const successPayment = {
  success: true,
  providerReference: 'payment-ref',
};

describe('SalesService.createSale', () => {
  let saleModel: { create: jest.Mock; findOne: jest.Mock };
  let saleItemModel: { bulkCreate: jest.Mock };
  let paymentModel: { create: jest.Mock };
  let inventoryModel: { findAll: jest.Mock };
  let productModel: { findAll: jest.Mock };
  let idempotencyModel: { findOne: jest.Mock; create: jest.Mock };
  let sequelize: { transaction: jest.Mock; query: jest.Mock };
  let paymentProvider: { charge: jest.Mock };
  let storesService: { assertStoreAccess: jest.Mock };
  let service: SalesService;
  let transaction: Transaction;

  const productA = { id: 'A', name: 'Alpha', priceCents: '100' };
  const productB = { id: 'B', name: 'Beta', priceCents: 250 };
  let inventoryA: { productId: string; quantity: number; update: jest.Mock };
  let inventoryB: { productId: string; quantity: number; update: jest.Mock };
  let createdSale: {
    id: string;
    billNumber: string;
    status: SaleStatus;
    totalCents: number;
    createdAt: Date;
    update: jest.Mock;
  };

  const makeDto = (items: Array<{ productId: string; quantity: number }>): CreateSaleDto =>
    ({
      items,
      paymentMethod: PaymentMethod.CASH,
      idempotencyKey: 'idem-key',
    }) as CreateSaleDto;

  beforeEach(() => {
    transaction = {
      LOCK: { UPDATE: 'UPDATE' },
    } as unknown as Transaction;
    inventoryA = {
      productId: 'A',
      quantity: 20,
      update: jest.fn().mockResolvedValue(undefined),
    };
    inventoryB = {
      productId: 'B',
      quantity: 20,
      update: jest.fn().mockResolvedValue(undefined),
    };
    createdSale = {
      id: 'sale-1',
      billNumber: 'BILL-00000001',
      status: SaleStatus.PENDING,
      totalCents: 0,
      createdAt: new Date('2026-01-02T03:04:05.000Z'),
      update: jest.fn().mockImplementation(async (values) => Object.assign(createdSale, values)),
    };
    saleModel = {
      create: jest.fn().mockImplementation(async (values) => {
        Object.assign(createdSale, values);
        return createdSale;
      }),
      findOne: jest.fn().mockResolvedValue(null),
    };
    saleItemModel = { bulkCreate: jest.fn().mockResolvedValue([]) };
    paymentModel = { create: jest.fn().mockResolvedValue({}) };
    inventoryModel = {
      findAll: jest.fn().mockResolvedValue([inventoryA, inventoryB]),
    };
    productModel = {
      findAll: jest.fn().mockResolvedValue([productA, productB]),
    };
    idempotencyModel = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    };
    sequelize = {
      transaction: jest.fn().mockImplementation(async (_options, callback) => callback(transaction)),
      query: jest.fn().mockResolvedValue([{ billNumber: 'BILL-00000001' }]),
    };
    paymentProvider = { charge: jest.fn().mockResolvedValue(successPayment) };
    storesService = { assertStoreAccess: jest.fn().mockResolvedValue(store) };

    service = new SalesService(
      saleModel as unknown as typeof Sale,
      saleItemModel as unknown as typeof SaleItem,
      paymentModel as unknown as typeof Payment,
      inventoryModel as unknown as typeof Inventory,
      productModel as unknown as typeof Product,
      idempotencyModel as unknown as typeof IdempotencyKey,
      sequelize as unknown as Sequelize,
      paymentProvider as IPaymentProvider,
      storesService as unknown as StoresService,
    );
  });

  it('uses READ_COMMITTED isolation', async () => {
    await service.createSale('store-1', makeDto([{ productId: 'A', quantity: 1 }]), user);

    expect(sequelize.transaction).toHaveBeenCalledWith(
      { isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED },
      expect.any(Function),
    );
    expect(sequelize.transaction.mock.calls[0][0].isolationLevel)
      .not.toBe(Transaction.ISOLATION_LEVELS.SERIALIZABLE);
  });

  it('locks and decrements distinct products in sorted order', async () => {
    inventoryModel.findAll.mockResolvedValue([inventoryB, inventoryA]);

    await service.createSale(
      'store-1',
      makeDto([{ productId: 'B', quantity: 1 }, { productId: 'A', quantity: 2 }]),
      user,
    );

    expect(inventoryModel.findAll).toHaveBeenCalledWith({
      where: { productId: ['A', 'B'], storeId: store.id },
      order: [['productId', 'ASC']],
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    expect(inventoryA.update.mock.invocationCallOrder[0])
      .toBeLessThan(inventoryB.update.mock.invocationCallOrder[0]);
  });

  it('merges duplicate product IDs and checks the summed quantity', async () => {
    inventoryA.quantity = 5;
    await service.createSale(
      'store-1',
      makeDto([{ productId: 'A', quantity: 2 }, { productId: 'A', quantity: 3 }]),
      user,
    );

    expect(inventoryModel.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ where: { productId: ['A'], storeId: store.id } }),
    );
    expect(inventoryA.update).toHaveBeenCalledTimes(1);
    expect(inventoryA.update).toHaveBeenCalledWith({ quantity: 0 }, { transaction });
    expect(saleItemModel.bulkCreate).toHaveBeenCalledWith(
      [{ productId: 'A', quantity: 5, unitPriceCents: 100, subtotalCents: 500, saleId: 'sale-1' }],
      { transaction },
    );
  });

  it('returns the mapped sale response using server-side prices', async () => {
    const result = await service.createSale(
      'store-1',
      makeDto([
        { productId: 'A', quantity: 2, priceCents: 1 } as any,
        { productId: 'B', quantity: 1, priceCents: 1 } as any,
      ]),
      user,
    );

    expect(result).toEqual({
      saleId: 'sale-1',
      billNumber: 'BILL-00000001',
      status: SaleStatus.COMPLETED,
      paymentStatus: PaymentStatus.SUCCESS,
      total: 450,
      items: [
        { productId: 'A', name: 'Alpha', quantity: 2, unitPrice: 100, subtotal: 200 },
        { productId: 'B', name: 'Beta', quantity: 1, unitPrice: 250, subtotal: 250 },
      ],
      createdAt: createdSale.createdAt,
    });
  });

  it('does not query the sale model after payment to build the response', async () => {
    await service.createSale('store-1', makeDto([{ productId: 'A', quantity: 1 }]), user);

    expect(paymentProvider.charge).toHaveBeenCalledTimes(1);
    expect(saleModel.findOne).not.toHaveBeenCalled();
  });

  it('returns the same response shape for idempotent replay', async () => {
    const first = await service.createSale(
      'store-1',
      makeDto([{ productId: 'A', quantity: 2 }]),
      user,
    );
    const replaySale = {
      ...createdSale,
      items: [{
        productId: 'A',
        quantity: 2,
        unitPriceCents: '100',
        subtotalCents: '200',
        product: { name: 'Alpha' },
      }],
      payment: { status: PaymentStatus.SUCCESS },
    };
    idempotencyModel.findOne.mockResolvedValueOnce({ saleId: 'sale-1' });
    saleModel.findOne.mockResolvedValueOnce(replaySale);

    const replay = await service.createSale(
      'store-1',
      makeDto([{ productId: 'A', quantity: 2 }]),
      user,
    );

    expect(replay).toEqual(first);
    expect(paymentProvider.charge).toHaveBeenCalledTimes(1);
  });

  it('throws a 4xx exception for insufficient stock', async () => {
    inventoryA.quantity = 1;

    await expect(
      service.createSale('store-1', makeDto([{ productId: 'A', quantity: 2 }]), user),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(paymentProvider.charge).not.toHaveBeenCalled();
  });

  it('maps an inventory quantity CHECK violation to the insufficient-stock 4xx', async () => {
    inventoryA.update.mockRejectedValueOnce({
      original: { code: '23514', constraint: 'CHK_inventory_qty' },
    });

    await expect(
      service.createSale('store-1', makeDto([{ productId: 'A', quantity: 1 }]), user),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(paymentProvider.charge).not.toHaveBeenCalled();
  });

  it('retries a deadlock before payment and charges only once', async () => {
    inventoryModel.findAll
      .mockRejectedValueOnce({ original: { code: '40P01' } })
      .mockResolvedValueOnce([inventoryA]);
    productModel.findAll.mockResolvedValue([productA]);

    await service.createSale('store-1', makeDto([{ productId: 'A', quantity: 1 }]), user);

    expect(sequelize.transaction).toHaveBeenCalledTimes(2);
    expect(paymentProvider.charge).toHaveBeenCalledTimes(1);
  });

  it('does not retry a deadlock after payment was attempted', async () => {
    idempotencyModel.create.mockRejectedValueOnce({ original: { code: '40P01' } });

    await expect(
      service.createSale('store-1', makeDto([{ productId: 'A', quantity: 1 }]), user),
    ).rejects.toMatchObject({ original: { code: '40P01' } });

    expect(sequelize.transaction).toHaveBeenCalledTimes(1);
    expect(paymentProvider.charge).toHaveBeenCalledTimes(1);
  });

  it('still rejects failed payment so the transaction callback rolls back inventory', async () => {
    paymentProvider.charge.mockResolvedValueOnce({
      success: false,
      failureReason: 'Card declined',
    });
    let transactionCallbackRejected = false;
    sequelize.transaction.mockImplementation(async (_options, callback) => {
      try {
        return await callback(transaction);
      } catch (error) {
        transactionCallbackRejected = true;
        throw error;
      }
    });

    await expect(
      service.createSale('store-1', makeDto([{ productId: 'A', quantity: 1 }]), user),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(transactionCallbackRejected).toBe(true);
    expect(inventoryA.update).toHaveBeenCalledWith({ quantity: 19 }, { transaction });
  });
});
