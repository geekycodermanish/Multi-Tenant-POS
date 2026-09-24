import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Store, User } from '../../database/entities';
import { CreateStoreDto } from './dto/create-store.dto';

@Injectable()
export class StoresService {
  constructor(
    @InjectModel(Store) private storeModel: typeof Store,
  ) {}

  async create(dto: CreateStoreDto, user: User): Promise<Store> {
    return this.storeModel.create({
      ...dto,
      merchantId: user.merchantId,
    } as any);
  }

  async findAll(user: User): Promise<Store[]> {
    return this.storeModel.findAll({
      where: { merchantId: user.merchantId, isActive: true },
    });
  }

  async findOne(id: string, user: User): Promise<Store> {
    const store = await this.storeModel.findOne({ where: { id } });
    if (!store) throw new NotFoundException('Store not found');
    this.assertSameMerchant(store, user);
    return store;
  }

  /** Shared helper — throws if the store belongs to a different merchant */
  assertSameMerchant(store: Store, user: User): void {
    if (store.merchantId !== user.merchantId) {
      throw new ForbiddenException('Access denied to this store');
    }
  }
}
