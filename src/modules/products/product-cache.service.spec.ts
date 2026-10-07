import { Cache } from 'cache-manager';
import { Product, Inventory, User } from '../../database/entities';
import { StoresService } from '../stores/stores.service';
import { ProductsService } from './products.service';
import { ProductCacheService } from './product-cache.service';

describe('ProductCacheService', () => {
  let cache: { get: jest.Mock; set: jest.Mock; del: jest.Mock };
  let service: ProductCacheService;

  beforeEach(() => {
    cache = {
      get: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };
    service = new ProductCacheService(cache as unknown as Cache);
  });

  it('invalidates by writing a new token without reading the old token first', async () => {
    cache.get.mockResolvedValueOnce('previous-version');
    await service.invalidateStore('store-1');

    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.set).toHaveBeenCalledWith(
      'products:ver:store-1',
      expect.not.stringMatching(/^previous-version$/),
      24 * 60 * 60 * 1000,
    );
  });

  it('uses the new version for get and buildKey after invalidation', async () => {
    cache.get
      .mockResolvedValueOnce('new-version')
      .mockResolvedValueOnce({ value: 'fresh' });
    await service.invalidateStore('store-1');
    await expect(service.get('store-1', 'list')).resolves.toEqual({ value: 'fresh' });

    expect(service.buildKey('store-1', 'new-version', 'list'))
      .toBe('products:store-1:new-version:list');
    expect(cache.get).toHaveBeenLastCalledWith('products:store-1:new-version:list');
  });

  it('builds cache keys that cannot collide across stores', () => {
    expect(service.buildKey('store-1', 'version', 'list'))
      .not.toBe(service.buildKey('store-2', 'version', 'list'));
  });

  it('does not throw when the cache manager rejects', async () => {
    cache.get.mockRejectedValue(new Error('redis unavailable'));
    cache.set.mockRejectedValue(new Error('redis unavailable'));

    await expect(service.get('store-1', 'list')).resolves.toBeUndefined();
    await expect(service.set('store-1', 'list', ['products'], 60_000)).resolves.toBeUndefined();
    await expect(service.invalidateStore('store-1')).resolves.toBeUndefined();
  });

  it('times out a never-resolving cache call and treats it as a miss', async () => {
    cache.get.mockImplementation(() => new Promise(() => undefined));

    await expect(service.get('store-1', 'list')).resolves.toBeUndefined();
  });
});

describe('ProductsService cache behavior', () => {
  const storeId = 'store-1';
  const user = { storeId } as User;
  const products = [{ id: 'product-1', storeId }];
  let productModel: { findAll: jest.Mock };
  let cache: { get: jest.Mock; set: jest.Mock; invalidateStore: jest.Mock };
  let storesService: { assertStoreAccess: jest.Mock };
  let service: ProductsService;

  beforeEach(() => {
    productModel = { findAll: jest.fn().mockResolvedValue(products) };
    cache = {
      get: jest.fn(),
      set: jest.fn(),
      invalidateStore: jest.fn().mockResolvedValue(undefined),
    };
    storesService = { assertStoreAccess: jest.fn().mockResolvedValue({ id: storeId }) };
    service = new (ProductsService as any)(
      productModel as unknown as typeof Product,
      {} as typeof Inventory,
      cache as unknown as ProductCacheService,
      storesService as unknown as StoresService,
    );
  });

  it('serves list cache hits without querying the database', async () => {
    cache.get.mockResolvedValueOnce(products);

    await expect(service.findAll(storeId, user)).resolves.toBe(products);
    expect(productModel.findAll).not.toHaveBeenCalled();
  });

  it('falls back to the database on cache failure and returns the products', async () => {
    cache.get.mockResolvedValueOnce(undefined);

    await expect(service.findAll(storeId, user)).resolves.toBe(products);
    expect(productModel.findAll).toHaveBeenCalledWith({
      where: { storeId, isActive: true },
      include: [{ model: Inventory, as: 'inventory' }],
    });
    expect(cache.set).toHaveBeenCalledWith(storeId, 'list', products, 60_000);
  });
});
