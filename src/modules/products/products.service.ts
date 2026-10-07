import {
  Injectable,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Cache } from 'cache-manager';
import { Product, Inventory, User } from '../../database/entities';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { StoresService } from '../stores/stores.service';
import { ProductCacheService } from './product-cache.service';

const PRODUCT_LIST_CACHE_TTL_MS = 60 * 1000;

@Injectable()
export class ProductsService {
  private readonly productCache: ProductCacheService;

  constructor(
    @InjectModel(Product) private productModel: typeof Product,
    @InjectModel(Inventory) private inventoryModel: typeof Inventory,
    @Inject(ProductCacheService) productCache: ProductCacheService | Cache,
    private storesService: StoresService,
  ) {
    this.productCache = 'invalidateStore' in productCache &&
      typeof productCache.invalidateStore === 'function'
      ? productCache as ProductCacheService
      : new ProductCacheService(productCache as Cache);
  }

  async create(storeId: string, dto: CreateProductDto, user: User): Promise<Product> {
    const store = await this.storesService.assertStoreAccess(user, storeId);

    const product = await this.productModel.create({
      name: dto.name,
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.sku !== undefined ? { sku: dto.sku } : {}),
      priceCents: dto.priceCents,
      storeId: store.id,
    } as any);

    // Create a zero-stock inventory record for the product
    await this.inventoryModel.create({
      productId: product.id,
      storeId: store.id,
      quantity: 0,
    } as any);

    await this.productCache.invalidateStore(store.id);
    return product;
  }

  async findAll(storeId: string, user: User): Promise<Product[]> {
    await this.storesService.assertStoreAccess(user, storeId);

    const cached = await this.productCache.get<Product[]>(storeId, 'list');
    if (cached) return cached;

    const products = await this.productModel.findAll({
      where: { storeId, isActive: true },
      include: [{ model: Inventory, as: 'inventory' }],
    });

    await this.productCache.set(storeId, 'list', products, PRODUCT_LIST_CACHE_TTL_MS);
    return products;
  }

  async findOne(storeId: string, id: string, user: User): Promise<Product> {
    await this.storesService.assertStoreAccess(user, storeId);
    const product = await this.productModel.findOne({
      where: { id, storeId, isActive: true },
      include: [{ model: Inventory, as: 'inventory' }],
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async update(storeId: string, id: string, dto: UpdateProductDto, user: User): Promise<Product> {
    await this.storesService.assertStoreAccess(user, storeId);
    const product = await this.productModel.findOne({
      where: { id, storeId, isActive: true },
      include: [{ model: Inventory, as: 'inventory' }],
    });
    if (!product) throw new NotFoundException('Product not found');
    await product.update(dto as any);
    await this.productCache.invalidateStore(storeId);
    return product;
  }

  async remove(storeId: string, id: string, user: User): Promise<void> {
    await this.storesService.assertStoreAccess(user, storeId);
    const product = await this.productModel.findOne({
      where: { id, storeId, isActive: true },
      include: [{ model: Inventory, as: 'inventory' }],
    });
    if (!product) throw new NotFoundException('Product not found');
    await product.update({ isActive: false });
    await this.productCache.invalidateStore(storeId);
  }
}
