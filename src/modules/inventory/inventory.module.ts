import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Inventory } from '../../database/entities';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { StoresModule } from '../stores/stores.module';

@Module({
  imports: [SequelizeModule.forFeature([Inventory]), StoresModule],
  providers: [InventoryService],
  controllers: [InventoryController],
  exports: [InventoryService],
})
export class InventoryModule {}
