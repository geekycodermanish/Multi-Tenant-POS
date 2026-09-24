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
    await this.storesService.findOne(storeId, user);
    return this.inventoryModel.findAll({
      where: { storeId },
      include: [{ model: Product, as: 'product' }],
    });
  }

  async adjust(productId: string, dto: AdjustInventoryDto, user: User): Promise<Inventory> {
    const inv = await this.inventoryModel.findOne({
      where: { productId },
      include: ['store'],
    });
    if (!inv) throw new NotFoundException('Inventory record not found');

    // tenant isolation — ensure the store belongs to the user's merchant
    await this.storesService.findOne(inv.storeId, user);

    await inv.update({ quantity: dto.quantity });

    // Bust products cache for this store
    await this.cacheManager.del(`products:store:${inv.storeId}`);
    return inv;
  }
}
