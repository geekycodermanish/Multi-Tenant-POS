import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Merchant, User } from '../../database/entities';

@Injectable()
export class MerchantsService {
  constructor(
    @InjectModel(Merchant) private merchantModel: typeof Merchant,
  ) {}

  async findAll(user: User): Promise<Merchant[]> {
    return this.merchantModel.findAll({
      where: { id: user.merchantId, isActive: true },
    });
  }

  async findOne(id: string, user: User): Promise<Merchant> {
    if (id !== user.merchantId) throw new NotFoundException('Merchant not found');

    const merchant = await this.merchantModel.findOne({
      where: { id: user.merchantId },
    });
    if (!merchant) throw new NotFoundException('Merchant not found');
    return merchant;
  }
}
