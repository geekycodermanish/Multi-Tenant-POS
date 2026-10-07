import { BadRequestException, ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
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

const hashModule = (): { createRequestHash: (storeId: string, dto: CreateSaleDto) => string } =>
  require('./idempotency.util');

describe('SalesService idempotency', () => {
  const user = { id: 'staff-1' } as User;
  const dto = (quantity = 1): CreateSaleDto =>
    ({
      items: [{ productId: 'product-1', quantity }],
      paymentMethod: PaymentMethod.CASH,
    }) as CreateSaleDto;

  let saleModel: { create: jest.Mock; findOne: jest.Mock };
  let saleItemModel: { bulkCreate: jest.Mock };
  let paymentModel: { create: jest.Mock };
  let inventoryModel: { findAll: jest.Mock };
  let productModel: { findAll: jest.Mock };
  let idempotencyModel: { findOne: jest.Mock; create: jest.Mock; update: jest.Mock };
  let sequelize: { transaction: jest.Mock; query: jest.Mock };
  let paymentProvider: { charge: jest.Mock };
  let storesService: { assertStoreAccess: jest.Mock };
  let service: SalesService;
  let transaction: Transaction;
  let inventory: { productId: string; quantity: number; update: jest.Mock };
  let sale: {
    id: string;
    billNumber: string;
    status: SaleStatus;
    totalCents: number;
    createdAt: Date;
    update: jest.Mock;
  };
  let scopedService: {
    createSale(storeId: string, body: CreateSaleDto, key: string, user: User): Promise<unknown>;
  };

  const winnerSale = () => ({
    id: 'sale-1',
    billNumber: 'BILL-00000001',
    status: SaleStatus.COMPLETED,
    totalCents: '500',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    items: [{
      productId: 'product-1',
      quantity: 1,
      unitPriceCents: '500',
      subtotalCents: '500',
      product: { name: 'Coffee' },
    }],
    payment: { status: PaymentStatus.SUCCESS },
  });

  beforeEach(() => {
    transaction = { LOCK: { UPDATE: 'UPDATE' } } as unknown as Transaction;
    inventory = {
      productId: 'product-1',
      quantity: 10,
      update: jest.fn().mockResolvedValue(undefined),
    };
    sale = {
      id: 'sale-1',
      billNumber: 'BILL-00000001',
      status: SaleStatus.PENDING,
      totalCents: 0,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      update: jest.fn().mockImplementation(async (values) => Object.assign(sale, values)),
    };
    saleModel = {
      create: jest.fn().mockImplementation(async (values) => Object.assign(sale, values)),
      findOne: jest.fn().mockResolvedValue(null),
    };
    saleItemModel = { bulkCreate: jest.fn().mockResolvedValue([]) };
    paymentModel = { create: jest.fn().mockResolvedValue({}) };
    inventoryModel = { findAll: jest.fn().mockResolvedValue([inventory]) };
    productModel = {
      findAll: jest.fn().mockResolvedValue([{ id: 'product-1', name: 'Coffee', priceCents: '500' }]),
    };
    idempotencyModel = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue([1]),
    };
    sequelize = {
      transaction: jest.fn().mockImplementation(async (_options, callback) => callback(transaction)),
      query: jest.fn().mockResolvedValue([{ billNumber: 'BILL-00000001' }]),
    };
    paymentProvider = { charge: jest.fn().mockResolvedValue({ success: true }) };
    storesService = { assertStoreAccess: jest.fn().mockResolvedValue({ id: 'store-1' }) };

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
    scopedService = service as unknown as typeof scopedService;
  });

  it.each([undefined, '', 'short', 'x'.repeat(129), 'bad key!'])(
    'rejects an invalid Idempotency-Key header (%s)',
    async (key) => {
      await expect(scopedService.createSale('store-1', dto(), key as string, user))
        .rejects.toBeInstanceOf(BadRequestException);
      expect(sequelize.transaction).not.toHaveBeenCalled();
    },
  );

  it('rejects idempotencyKey in the body when unknown properties are forbidden', async () => {
    const body = plainToInstance(CreateSaleDto, {
      items: [{ productId: 'product-1', quantity: 1 }],
      paymentMethod: PaymentMethod.CASH,
      idempotencyKey: 'body-key-123',
    });

    const errors = await validate(body, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors.some((error) => error.property === 'idempotencyKey')).toBe(true);
  });

  it('hashes reordered and duplicate item lists canonically but distinguishes quantities', () => {
    const { createRequestHash } = hashModule();
    const a = { productId: 'A', quantity: 1 };
    const b = { productId: 'B', quantity: 2 };
    const first = { items: [a, b], paymentMethod: PaymentMethod.CASH } as CreateSaleDto;
    const reorderedAndMerged = {
      items: [{ productId: 'B', quantity: 1 }, { productId: 'A', quantity: 1 }, { productId: 'B', quantity: 1 }],
      paymentMethod: PaymentMethod.CASH,
    } as CreateSaleDto;

    expect(createRequestHash('store-1', first))
      .toBe(createRequestHash('store-1', reorderedAndMerged));
    expect(createRequestHash('store-1', first))
      .not.toBe(createRequestHash('store-1', { ...first, items: [a, { ...b, quantity: 3 }] }));
  });

  it('same key and payload returns the original response without transaction or payment', async () => {
    const { createRequestHash } = hashModule();
    idempotencyModel.findOne.mockResolvedValueOnce({
      requestHash: createRequestHash('store-1', dto()),
      saleId: 'sale-1',
    });
    saleModel.findOne.mockResolvedValueOnce(winnerSale());

    const result = await scopedService.createSale('store-1', dto(), 'same-key-123', user);

    expect(result).toMatchObject({
      saleId: 'sale-1',
      billNumber: 'BILL-00000001',
      total: 500,
    });
    expect(sequelize.transaction).not.toHaveBeenCalled();
    expect(paymentProvider.charge).not.toHaveBeenCalled();
  });

  it('same key with a different payload returns 422 without payment', async () => {
    const { createRequestHash } = hashModule();
    idempotencyModel.findOne.mockResolvedValueOnce({
      requestHash: createRequestHash('store-1', dto(2)),
      saleId: 'sale-1',
    });

    await expect(
      scopedService.createSale('store-1', dto(1), 'same-key-123', user),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(sequelize.transaction).not.toHaveBeenCalled();
    expect(paymentProvider.charge).not.toHaveBeenCalled();
  });

  it('claims the key as the first transaction operation before locking and payment', async () => {
    await scopedService.createSale('store-1', dto(), 'claim-key-123', user);

    expect(idempotencyModel.create).toHaveBeenCalledWith({
      key: 'claim-key-123',
      storeId: 'store-1',
      requestHash: expect.any(String),
      saleId: null,
    }, { transaction });
    const claimOrder = idempotencyModel.create.mock.invocationCallOrder[0];
    expect(claimOrder).toBeLessThan(inventoryModel.findAll.mock.invocationCallOrder[0]);
    expect(inventoryModel.findAll.mock.invocationCallOrder[0])
      .toBeLessThan(paymentProvider.charge.mock.invocationCallOrder[0]);
    expect(sequelize.query).toHaveBeenLastCalledWith(
      expect.stringContaining('UPDATE "idempotency_keys" SET "saleId"'),
      expect.objectContaining({
        replacements: { saleId: 'sale-1', key: 'claim-key-123', storeId: 'store-1' },
        transaction,
      }),
    );
  });

  it('recovers a unique-key race by returning the winner without retry or charge', async () => {
    const { createRequestHash } = hashModule();
    const uniqueViolation = { original: { code: '23505', constraint: 'UQ_idempotency_key_store' } };
    idempotencyModel.create.mockRejectedValueOnce(uniqueViolation);
    idempotencyModel.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ requestHash: createRequestHash('store-1', dto()), saleId: 'sale-1' });
    saleModel.findOne.mockResolvedValueOnce(winnerSale());

    const result = await scopedService.createSale('store-1', dto(), 'claim-key-123', user);

    expect(result).toMatchObject({ saleId: 'sale-1', billNumber: 'BILL-00000001', total: 500 });
    expect(sequelize.transaction).toHaveBeenCalledTimes(1);
    expect(paymentProvider.charge).not.toHaveBeenCalled();
  });

  it('returns ConflictException if the unique-key winner is not complete yet', async () => {
    const { createRequestHash } = hashModule();
    idempotencyModel.create.mockRejectedValueOnce({
      original: { code: '23505', constraint: 'UQ_idempotency_key_store' },
    });
    idempotencyModel.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ requestHash: createRequestHash('store-1', dto()), saleId: null });

    await expect(
      scopedService.createSale('store-1', dto(), 'claim-key-123', user),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(sequelize.transaction).toHaveBeenCalledTimes(1);
    expect(paymentProvider.charge).not.toHaveBeenCalled();
  });

  it('rolls back the key claim on failure so the same key can be retried', async () => {
    inventory.quantity = 0;

    await expect(
      scopedService.createSale('store-1', dto(), 'retry-key-123', user),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(idempotencyModel.create).toHaveBeenCalledTimes(1);
    expect(paymentProvider.charge).not.toHaveBeenCalled();

    inventory.quantity = 10;
    await expect(
      scopedService.createSale('store-1', dto(), 'retry-key-123', user),
    ).resolves.toMatchObject({ saleId: 'sale-1' });
    expect(sequelize.transaction).toHaveBeenCalledTimes(2);
  });

  it('scopes key lookup and claims to storeId so the same key may be used in another store', async () => {
    await scopedService.createSale('store-1', dto(), 'shared-key-123', user);
    storesService.assertStoreAccess.mockResolvedValueOnce({ id: 'store-2' });
    idempotencyModel.findOne.mockResolvedValueOnce(null);
    await scopedService.createSale('store-2', dto(), 'shared-key-123', user);

    expect(idempotencyModel.findOne).toHaveBeenNthCalledWith(1, {
      where: { key: 'shared-key-123', storeId: 'store-1' },
    });
    expect(idempotencyModel.findOne).toHaveBeenNthCalledWith(2, {
      where: { key: 'shared-key-123', storeId: 'store-2' },
    });
    expect(idempotencyModel.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ key: 'shared-key-123', storeId: 'store-2' }),
      { transaction },
    );
  });
});
