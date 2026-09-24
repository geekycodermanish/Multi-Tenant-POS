import { Injectable } from '@nestjs/common';
import { IPaymentProvider, PaymentRequest, PaymentResult } from './payment-provider.interface';
import { v4 as uuidv4 } from 'uuid';

/**
 * Mock payment provider — simulates SUCCESS / FAILED based on env or random chance.
 * Set PAYMENT_FAIL_RATE=1 in .env to always fail (useful for testing).
 */
@Injectable()
export class MockPaymentProvider implements IPaymentProvider {
  async charge(request: PaymentRequest): Promise<PaymentResult> {
    const failRate = parseFloat(process.env.PAYMENT_FAIL_RATE || '0');
    const shouldFail = Math.random() < failRate;

    if (shouldFail) {
      return {
        success: false,
        providerReference: uuidv4(),
        failureReason: 'Mock payment declined',
      };
    }

    return {
      success: true,
      providerReference: `MOCK-${uuidv4()}`,
    };
  }
}
