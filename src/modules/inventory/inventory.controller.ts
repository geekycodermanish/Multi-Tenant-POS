import { Controller, Get, Put, Param, Body, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { AdjustInventoryDto } from './dto/adjust-inventory.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User, UserRole } from '../../database/entities';

@Controller('stores/:storeId/inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryController {
  constructor(private inventoryService: InventoryService) {}

  @Get()
  findByStore(
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @CurrentUser() user: User,
  ) {
    return this.inventoryService.findByStore(storeId, user);
  }

  @Put('products/:productId')
  @Roles(UserRole.MERCHANT_ADMIN)
  adjust(
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: AdjustInventoryDto,
    @CurrentUser() user: User,
  ) {
    return this.inventoryService.adjust(storeId, productId, dto, user);
  }
}
