import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { Merchant } from '../../database/entities';
import { CreateMerchantDto } from './dto/create-merchant.dto';

@Injectable()
export class MerchantsService {
  constructor(
    @InjectModel(Merchant) private merchantModel: typeof Merchant,
  ) {}

  async create(dto: CreateMerchantDto): Promise<Merchant> {
    const existing = await this.merchantModel.findOne({
      where: {
        [Op.or]: [{ name: dto.name }, { email: dto.email }],
      },
    });
    if (existing) throw new ConflictException('Merchant name or email already taken');

    return this.merchantModel.create(dto as any);
  }

  async findAll(): Promise<Merchant[]> {
    return this.merchantModel.findAll({ where: { isActive: true } });
  }

  async findOne(id: string): Promise<Merchant> {
    const merchant = await this.merchantModel.findOne({ where: { id } });
    if (!merchant) throw new NotFoundException('Merchant not found');
    return merchant;
  }
}
