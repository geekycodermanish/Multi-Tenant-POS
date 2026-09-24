import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Store } from '../../database/entities';
import { StoresService } from './stores.service';
import { StoresController } from './stores.controller';

@Module({
  imports: [SequelizeModule.forFeature([Store])],
  providers: [StoresService],
  controllers: [StoresController],
  exports: [StoresService],
})
export class StoresModule {}
