import {
  Injectable,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import * as bcrypt from 'bcryptjs';
import { User, UserRole } from '../../database/entities';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User) private userModel: typeof User,
  ) {}

  async create(dto: CreateUserDto, adminUser: User): Promise<Omit<User, 'password'>> {
    if (dto.role === UserRole.STORE_STAFF && !dto.storeId) {
      throw new BadRequestException('storeId is required for store_staff role');
    }

    const exists = await this.userModel.findOne({ where: { email: dto.email } });
    if (exists) throw new ConflictException('Email already in use');

    const hashed = await bcrypt.hash(dto.password, 10);
    const user = await this.userModel.create({
      ...dto,
      password: hashed,
      merchantId: adminUser.merchantId,
    } as any);

    const { password: _pw, ...result } = user.toJSON() as User & { password: string };
    return result as Omit<User, 'password'>;
  }

  async findAll(merchantId: string): Promise<Omit<User, 'password'>[]> {
    const users = await this.userModel.findAll({ where: { merchantId } });
    return users.map((u) => {
      const { password: _pw, ...rest } = u.toJSON() as User & { password: string };
      return rest as Omit<User, 'password'>;
    });
  }

  async findOne(id: string, merchantId: string): Promise<Omit<User, 'password'>> {
    const user = await this.userModel.findOne({ where: { id, merchantId } });
    if (!user) throw new NotFoundException('User not found');
    const { password: _pw, ...result } = user.toJSON() as User & { password: string };
    return result as Omit<User, 'password'>;
  }
}
