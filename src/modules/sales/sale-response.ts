import { PaymentStatus, Sale, SaleStatus } from '../../database/entities';

export interface SaleResponseItem {
  productId: string;
  name: string;
  quantity: number;
  unitPriceCents: number | string;
  subtotalCents: number | string;
}

export interface SaleResponse {
  saleId: string;
  billNumber: string;
  status: SaleStatus;
  paymentStatus: PaymentStatus;
  total: number;
  items: Array<{
    productId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;
  createdAt: Date;
}

export function mapSaleResponse(
  sale: Sale,
  paymentStatus: PaymentStatus,
  items: SaleResponseItem[],
): SaleResponse {
  return {
    saleId: sale.id,
    billNumber: sale.billNumber,
    status: sale.status,
    paymentStatus,
    total: Number(sale.totalCents),
    items: items.map((item) => ({
      productId: item.productId,
      name: item.name,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPriceCents),
      subtotal: Number(item.subtotalCents),
    })),
    createdAt: sale.createdAt,
  };
}
