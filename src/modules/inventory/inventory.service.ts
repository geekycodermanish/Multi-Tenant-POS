import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Cache } from 'cache-manager';
import { Inventory, Product, User } from '../../database/entities';
import { AdjustInventoryDto } from './dto/adjust-inventory.dto';
import { StoresService } from '../stores/stores.service';
import { ProductCacheService } from '../products/product-cache.service';

@Injectable()
export class InventoryService {
  private readonly productCache: ProductCacheService;

  constructor(
    @InjectModel(Inventory) private inventoryModel: typeof Inventory,
    @Inject(ProductCacheService) productCache: ProductCacheService | Cache,
    private storesService: StoresService,
  ) {
    this.productCache = 'invalidateStore' in productCache &&
      typeof productCache.invalidateStore === 'function'
      ? productCache as ProductCacheService
      : new ProductCacheService(productCache as Cache);
  }

  async findByStore(storeId: string, user: User): Promise<Inventory[]> {
    await this.storesService.assertStoreAccess(user, storeId);
    return this.inventoryModel.findAll({
      where: { storeId },
      include: [{ model: Product, as: 'product' }],
    });
  }

  async adjust(storeId: string, productId: string, dto: AdjustInventoryDto, user: User): Promise<Inventory> {
    await this.storesService.assertStoreAccess(user, storeId);
    const inv = await this.inventoryModel.findOne({
      where: { storeId, productId },
      include: ['store'],
    });
    if (!inv) throw new NotFoundException('Inventory record not found');

    await inv.update({ quantity: dto.quantity });

    await this.productCache.invalidateStore(storeId);
    return inv;
  }
}
