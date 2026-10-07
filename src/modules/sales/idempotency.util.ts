import { createHash } from 'crypto';
import { CreateSaleDto } from './dto/create-sale.dto';

export function createRequestHash(storeId: string, dto: CreateSaleDto): string {
  const quantities = new Map<string, number>();
  for (const item of dto.items) {
    quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
  }

  const canonicalRequest = {
    storeId,
    items: [...quantities.entries()]
      .sort(([productIdA], [productIdB]) => productIdA.localeCompare(productIdB))
      .map(([productId, quantity]) => ({ productId, quantity })),
    paymentMethod: dto.paymentMethod,
    notes: dto.notes ?? null,
  };

  return createHash('sha256').update(JSON.stringify(canonicalRequest)).digest('hex');
}
