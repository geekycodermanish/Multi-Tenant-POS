import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Op, UniqueConstraintError } from 'sequelize';
import * as bcrypt from 'bcryptjs';
import { Merchant, User, UserRole } from '../../database/entities';
import { CreateMerchantDto } from './dto/create-merchant.dto';

@Injectable()
export class MerchantsService {
  constructor(
    @InjectModel(Merchant) private merchantModel: typeof Merchant,
    @InjectModel(User) private userModel: typeof User,
    @InjectConnection() private sequelize: Sequelize,
  ) {}

  async create(dto: CreateMerchantDto) {
    const [existingMerchant, existingAdmin] = await Promise.all([
      this.merchantModel.findOne({
        where: { [Op.or]: [{ name: dto.name }, { email: dto.email }] },
      }),
      this.userModel.findOne({ where: { email: dto.adminEmail } }),
    ]);
    if (existingMerchant || existingAdmin) {
      throw new ConflictException('Merchant or admin email already exists');
    }

    const password = await bcrypt.hash(dto.adminPassword, 10);
    try {
      return await this.sequelize.transaction(async (transaction) => {
        const merchant = await this.merchantModel.create(
          { name: dto.name, email: dto.email },
          { transaction },
        );
        const admin = await this.userModel.create(
          {
            name: dto.adminName,
            email: dto.adminEmail,
            password,
            role: UserRole.MERCHANT_ADMIN,
            merchantId: merchant.id,
            storeId: null,
          },
          { transaction },
        );
        const { password: _password, ...safeAdmin } = admin.toJSON();
        return { merchant, admin: safeAdmin };
      });
    } catch (error) {
      if (error instanceof UniqueConstraintError) {
        throw new ConflictException('Merchant or admin email already exists');
      }
      throw error;
    }
  }

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
