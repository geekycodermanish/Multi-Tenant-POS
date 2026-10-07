import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Store, User, UserRole } from '../../database/entities';
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
      where: {
        merchantId: user.merchantId,
        ...(user.role === UserRole.MERCHANT_ADMIN ? {} : { id: user.storeId ?? null }),
        isActive: true,
      },
    });
  }

  async findOne(id: string, user: User): Promise<Store> {
    return this.assertStoreAccess(user, id);
  }

  async assertStoreAccess(user: User, storeId: string): Promise<Store> {
    const store = await this.storeModel.findOne({ where: { id: storeId } });
    if (
      !store ||
      store.merchantId !== user.merchantId ||
      (user.role !== UserRole.MERCHANT_ADMIN && user.storeId !== storeId)
    ) {
      throw new NotFoundException('Store not found');
    }
    return store;
  }
}
