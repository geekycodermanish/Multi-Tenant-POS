export interface PaymentRequest {
  amountCents: number;
  method: string;
  reference: string; // saleId used as reference
}

export interface PaymentResult {
  success: boolean;
  providerReference: string;
  failureReason?: string;
}

export const PAYMENT_PROVIDER = 'PAYMENT_PROVIDER';

export interface IPaymentProvider {
  charge(request: PaymentRequest): Promise<PaymentResult>;
}
