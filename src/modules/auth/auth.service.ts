import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/sequelize';
import * as bcrypt from 'bcryptjs';
import { User, UserRole, Merchant } from '../../database/entities';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User) private userModel: typeof User,
    @InjectModel(Merchant) private merchantModel: typeof Merchant,
    private jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.userModel.findOne({
      where: { email: dto.email, isActive: true },
      include: ['merchant', 'store'],
    });

    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      merchantId: user.merchantId,
      storeId: user.storeId ?? null,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        merchantId: user.merchantId,
        storeId: user.storeId,
      },
    };
  }

  /**
   * Public registration — no token required.
   * Creates a MERCHANT_ADMIN user tied to an existing merchant.
   */
  async register(dto: RegisterDto): Promise<Omit<User, 'password'>> {
    const merchant = await this.merchantModel.findByPk(dto.merchantId);
    if (!merchant) throw new NotFoundException('Merchant not found');

    const exists = await this.userModel.findOne({ where: { email: dto.email } });
    if (exists) throw new ConflictException('Email already in use');

    const hashed = await bcrypt.hash(dto.password, 10);
    const user = await this.userModel.create({
      name: dto.name,
      email: dto.email,
      password: hashed,
      role: UserRole.MERCHANT_ADMIN,
      merchantId: dto.merchantId,
    } as any);

    const { password: _pw, ...result } = user.toJSON() as User & { password: string };
    return result as Omit<User, 'password'>;
  }
}
