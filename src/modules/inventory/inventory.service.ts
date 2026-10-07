import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject } from '@nestjs/common';
import { Cache } from 'cache-manager';
import { Inventory, Product, User } from '../../database/entities';
import { AdjustInventoryDto } from './dto/adjust-inventory.dto';
import { StoresService } from '../stores/stores.service';

@Injectable()
export class InventoryService {
  constructor(
    @InjectModel(Inventory) private inventoryModel: typeof Inventory,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private storesService: StoresService,
  ) {}

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

    // Bust products cache for this store
    await this.cacheManager.del(`products:store:${inv.storeId}`);
    return inv;
  }
}
