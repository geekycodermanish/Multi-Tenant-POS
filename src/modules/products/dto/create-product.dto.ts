import { IsString, IsOptional, IsInt, Min, MinLength } from 'class-validator';

export class CreateProductDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  sku?: string;

  /** Price in integer cents (e.g. 1099 = ₹10.99) */
  @IsInt()
  @Min(1)
  priceCents: number;
}
