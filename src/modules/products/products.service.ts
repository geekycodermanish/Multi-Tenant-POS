import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject } from '@nestjs/common';
import { Cache } from 'cache-manager';
import { Product, Inventory, User } from '../../database/entities';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { StoresService } from '../stores/stores.service';

@Injectable()
export class ProductsService {
  constructor(
    @InjectModel(Product) private productModel: typeof Product,
    @InjectModel(Inventory) private inventoryModel: typeof Inventory,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private storesService: StoresService,
  ) {}

  private cacheKey(storeId: string) {
    return `products:store:${storeId}`;
  }

  async create(storeId: string, dto: CreateProductDto, user: User): Promise<Product> {
    const store = await this.storesService.findOne(storeId, user);

    const product = await this.productModel.create({
      ...dto,
      storeId: store.id,
    } as any);

    // Create a zero-stock inventory record for the product
    await this.inventoryModel.create({
      productId: product.id,
      storeId: store.id,
      quantity: 0,
    } as any);

    await this.cacheManager.del(this.cacheKey(storeId));
    return product;
  }

  async findAll(storeId: string, user: User): Promise<Product[]> {
    await this.storesService.findOne(storeId, user); // tenant check

    const cached = await this.cacheManager.get<Product[]>(this.cacheKey(storeId));
    if (cached) return cached;

    const products = await this.productModel.findAll({
      where: { storeId, isActive: true },
      include: [{ model: Inventory, as: 'inventory' }],
    });

    await this.cacheManager.set(this.cacheKey(storeId), products);
    return products;
  }

  async findOne(id: string, user: User): Promise<Product> {
    const product = await this.productModel.findOne({
      where: { id, isActive: true },
      include: [{ model: Inventory, as: 'inventory' }],
    });
    if (!product) throw new NotFoundException('Product not found');
    await this.storesService.findOne(product.storeId, user); // tenant check
    return product;
  }

  async update(id: string, dto: UpdateProductDto, user: User): Promise<Product> {
    const product = await this.findOne(id, user);
    await product.update(dto as any);
    await this.cacheManager.del(this.cacheKey(product.storeId));
    return product;
  }

  async remove(id: string, user: User): Promise<void> {
    const product = await this.findOne(id, user);
    await product.update({ isActive: false });
    await this.cacheManager.del(this.cacheKey(product.storeId));
  }
}
