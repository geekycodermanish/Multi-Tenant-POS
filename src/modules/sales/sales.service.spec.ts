import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { SalesService } from './sales.service';
import { Sale, IdempotencyKey, Inventory, Product, SaleItem, Payment, SaleStatus, PaymentStatus, PaymentMethod } from '../../database/entities';
import { PAYMENT_PROVIDER } from '../payments/payment-provider.interface';
import { StoresService } from '../stores/stores.service';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

// ─── Helpers ────────────────────────────────────────────────────────────────

const mockStore = (overrides = {}) => ({
  id: 'store-1',
  merchantId: 'merchant-1',
  name: 'Store One',
  isActive: true,
  ...overrides,
});

const mockUser = (overrides = {}) => ({
  id: 'user-1',
  merchantId: 'merchant-1',
  storeId: 'store-1',
  role: 'store_staff',
  ...overrides,
});

const mockProduct = (overrides = {}) => ({
  id: 'product-1',
  name: 'Coffee',
  priceCents: 500,
  isActive: true,
  storeId: 'store-1',
  ...overrides,
});

const mockInventory = (overrides = {}) => ({
  id: 'inv-1',
  productId: 'product-1',
  storeId: 'store-1',
  quantity: 10,
  ...overrides,
});

const mockSale = (overrides = {}) => ({
  id: 'sale-1',
  storeId: 'store-1',
  totalCents: 1000,
  status: SaleStatus.COMPLETED,
  idempotencyKey: 'idem-key-1',
  items: [],
  payment: null,
  ...overrides,
});

// ─── Mock EntityManager used inside transactions ─────────────────────────────

function buildMockEntityManager({
  inventories = [mockInventory()],
  products = [mockProduct()],
  saleToReturn = mockSale(),
  paymentFails = false,
} = {}) {
  const invRepo = {
    createQueryBuilder: jest.fn().mockReturnValue({
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(inventories),
    }),
    save: jest.fn().mockImplementation((v) => Promise.resolve(v)),
  };

  const productRepo = {
    find: jest.fn().mockResolvedValue(products),
  };

  const saleRepo = {
    create: jest.fn().mockReturnValue({ id: 'sale-1', status: SaleStatus.PENDING }),
    save: jest.fn().mockImplementation((v) => Promise.resolve({ ...v, id: 'sale-1' })),
  };

  const saleItemRepo = {
    create: jest.fn().mockImplementation((v) => v),
    save: jest.fn().mockResolvedValue([]),
  };

  const paymentRepo = {
    create: jest.fn().mockImplementation((v) => v),
    save: jest.fn().mockResolvedValue({}),
  };

  const idempotencyRepo = {
    create: jest.fn().mockImplementation((v) => v),
    save: jest.fn().mockResolvedValue({}),
  };

  const repoMap: Record<string, unknown> = {
    [Inventory.name]: invRepo,
    [Product.name]: productRepo,
    [Sale.name]: saleRepo,
    [SaleItem.name]: saleItemRepo,
    [Payment.name]: paymentRepo,
    [IdempotencyKey.name]: idempotencyRepo,
  };

  return {
    getRepository: jest.fn().mockImplementation((Entity) => repoMap[Entity.name] ?? {}),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('SalesService', () => {
  let service: SalesService;
  let storesService: { findOne: jest.Mock };
  let paymentProvider: { charge: jest.Mock };
  let saleRepo: { findOne: jest.Mock };
  let idempotencyRepo: { findOne: jest.Mock };
  let dataSource: { transaction: jest.Mock };

  beforeEach(async () => {
    storesService = { findOne: jest.fn().mockResolvedValue(mockStore()) };
    paymentProvider = { charge: jest.fn() };
    saleRepo = { findOne: jest.fn() };
    idempotencyRepo = { findOne: jest.fn().mockResolvedValue(null) };
    dataSource = { transaction: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesService,
        { provide: getRepositoryToken(Sale), useValue: saleRepo },
        { provide: getRepositoryToken(IdempotencyKey), useValue: idempotencyRepo },
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: PAYMENT_PROVIDER, useValue: paymentProvider },
        { provide: StoresService, useValue: storesService },
      ],
    }).compile();

    service = module.get<SalesService>(SalesService);
  });

  // ── Scenario 1: Successful sale ─────────────────────────────────────────

  it('should create a sale and return it on success', async () => {
    const expectedSale = mockSale();
    const em = buildMockEntityManager();

    dataSource.transaction.mockImplementation(async (cb) => {
      // Simulate payment success inside transaction
      paymentProvider.charge.mockResolvedValueOnce({
        success: true,
        providerReference: 'MOCK-ref-123',
      });
      // The last saleRepo.findOne call (outside transaction) returns the sale
      saleRepo.findOne.mockResolvedValueOnce(expectedSale);
      return cb(em);
    });

    const result = await service.createSale(
      'store-1',
      { items: [{ productId: 'product-1', quantity: 2 }], paymentMethod: PaymentMethod.CASH, idempotencyKey: 'key-1' },
      mockUser() as any,
    );

    expect(result).toEqual(expectedSale);
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });

  // ── Scenario 2: Failed sale (payment declined) ──────────────────────────

  it('should throw BadRequestException when payment fails', async () => {
    const em = buildMockEntityManager();

    dataSource.transaction.mockImplementation(async (cb) => {
      paymentProvider.charge.mockResolvedValueOnce({
        success: false,
        providerReference: 'MOCK-fail',
        failureReason: 'Card declined',
      });
      return cb(em);
    });

    await expect(
      service.createSale(
        'store-1',
        { items: [{ productId: 'product-1', quantity: 1 }], paymentMethod: PaymentMethod.CARD, idempotencyKey: 'key-2' },
        mockUser() as any,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  // ── Scenario 3: Insufficient inventory ─────────────────────────────────

  it('should throw BadRequestException when stock is insufficient', async () => {
    // quantity=10 product, request 20
    const em = buildMockEntityManager({
      inventories: [mockInventory({ quantity: 10 })],
    });

    dataSource.transaction.mockImplementation(async (cb) => cb(em));

    await expect(
      service.createSale(
        'store-1',
        { items: [{ productId: 'product-1', quantity: 20 }], paymentMethod: PaymentMethod.CASH, idempotencyKey: 'key-3' },
        mockUser() as any,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  // ── Scenario 4: Cross-tenant access rejected ────────────────────────────

  it('should throw ForbiddenException when user tries to access another tenants store', async () => {
    storesService.findOne.mockRejectedValueOnce(
      new ForbiddenException('Access denied to this store'),
    );

    await expect(
      service.createSale(
        'store-other-tenant',
        { items: [{ productId: 'product-1', quantity: 1 }], paymentMethod: PaymentMethod.CASH, idempotencyKey: 'key-4' },
        mockUser({ merchantId: 'merchant-1' }) as any,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  // ── Scenario 5 (bonus): Duplicate idempotency key returns cached sale ───

  it('should return existing sale on duplicate idempotency key', async () => {
    const existingSale = mockSale({ id: 'sale-existing' });

    idempotencyRepo.findOne.mockResolvedValueOnce({ saleId: 'sale-existing' });
    saleRepo.findOne.mockResolvedValueOnce(existingSale);

    const result = await service.createSale(
      'store-1',
      { items: [{ productId: 'product-1', quantity: 1 }], paymentMethod: PaymentMethod.CASH, idempotencyKey: 'key-dup' },
      mockUser() as any,
    );

    expect(result).toEqual(existingSale);
    // Transaction must NOT have been called — no new sale created
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });
});
