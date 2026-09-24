import { IsInt, Min } from 'class-validator';

export class AdjustInventoryDto {
  /** Absolute quantity to set (stock-take / receive stock). Must be >= 0. */
  @IsInt()
  @Min(0)
  quantity: number;
}
