import {
  Injectable,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import * as bcrypt from 'bcryptjs';
import { Store, User, UserRole } from '../../database/entities';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User) private userModel: typeof User,
    @InjectConnection() private sequelize: Sequelize,
  ) {}

  async create(dto: CreateUserDto, adminUser: User): Promise<Omit<User, 'password'>> {
    if (dto.role !== UserRole.MERCHANT_ADMIN && !dto.storeId) {
      throw new BadRequestException('storeId is required for store-level roles');
    }

    if (dto.storeId) {
      const store = await this.sequelize.model(Store).findOne({
        where: { id: dto.storeId, merchantId: adminUser.merchantId },
      });
      if (!store) throw new NotFoundException('Store not found');
    }

    const exists = await this.userModel.findOne({ where: { email: dto.email } });
    if (exists) throw new ConflictException('Email already in use');

    const hashed = await bcrypt.hash(dto.password, 10);
    const user = await this.userModel.create({
      ...dto,
      password: hashed,
      merchantId: adminUser.merchantId,
    } as any);

    return this.withoutPassword(user);
  }

  async findAll(merchantId: string): Promise<Omit<User, 'password'>[]> {
    const users = await this.userModel.findAll({ where: { merchantId } });
    return users.map((user) => this.withoutPassword(user));
  }

  async findOne(id: string, merchantId: string): Promise<Omit<User, 'password'>> {
    const user = await this.userModel.findOne({ where: { id, merchantId } });
    if (!user) throw new NotFoundException('User not found');
    return this.withoutPassword(user);
  }

  private withoutPassword(user: User): Omit<User, 'password'> {
    const {
      password: _password,
      passwordHash: _passwordHash,
      ...result
    } = user.toJSON() as User & { passwordHash?: string };
    return result as Omit<User, 'password'>;
  }
}
