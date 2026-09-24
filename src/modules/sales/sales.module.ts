import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Sale, SaleItem, Payment, Inventory, Product, IdempotencyKey } from '../../database/entities';
import { SalesService } from './sales.service';
import { SalesController } from './sales.controller';
import { PaymentsModule } from '../payments/payments.module';
import { StoresModule } from '../stores/stores.module';

@Module({
  imports: [
    // SalesService orchestrates all these models inside one transaction
    SequelizeModule.forFeature([Sale, SaleItem, Payment, Inventory, Product, IdempotencyKey]),
    PaymentsModule,
    StoresModule,
  ],
  providers: [SalesService],
  controllers: [SalesController],
})
export class SalesModule {}
