import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Product, Inventory } from '../../database/entities';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { StoresModule } from '../stores/stores.module';
import { ProductCacheService } from './product-cache.service';

@Module({
  imports: [SequelizeModule.forFeature([Product, Inventory]), StoresModule],
  providers: [ProductsService, ProductCacheService],
  controllers: [ProductsController],
  exports: [ProductsService, ProductCacheService],
})
export class ProductsModule {}
