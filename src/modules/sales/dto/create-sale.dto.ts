import { Type } from 'class-transformer';
import {
  IsArray, IsEnum, IsOptional, IsString, IsUUID,
  ValidateNested, IsInt, Min, ArrayMinSize,
} from 'class-validator';
import { PaymentMethod } from '../../../database/entities';

export class SaleItemDto {
  @IsUUID()
  productId: string;

  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreateSaleDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items: SaleItemDto[];

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @IsOptional()
  @IsString()
  notes?: string;
}
