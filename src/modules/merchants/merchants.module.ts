import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Merchant, User } from '../../database/entities';
import { MerchantsService } from './merchants.service';
import { MerchantsController } from './merchants.controller';

@Module({
  imports: [SequelizeModule.forFeature([Merchant, User])],
  providers: [MerchantsService],
  controllers: [MerchantsController],
  exports: [MerchantsService],
})
export class MerchantsModule {}
