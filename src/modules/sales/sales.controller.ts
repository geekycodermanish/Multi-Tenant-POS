import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Headers,
} from '@nestjs/common';
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User, UserRole } from '../../database/entities';

@Controller('stores/:storeId/sales')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.MERCHANT_ADMIN, UserRole.STORE_STAFF)
export class SalesController {
  constructor(private salesService: SalesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createSale(
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Body() dto: CreateSaleDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() user: User,
  ) {
    return this.salesService.createSale(storeId, dto, idempotencyKey, user);
  }

  @Get()
  findAll(
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @CurrentUser() user: User,
  ) {
    return this.salesService.findAll(storeId, user);
  }

  @Get(':id')
  findOne(
    @Param('storeId', ParseUUIDPipe) storeId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.salesService.findOne(storeId, id, user);
  }
}
