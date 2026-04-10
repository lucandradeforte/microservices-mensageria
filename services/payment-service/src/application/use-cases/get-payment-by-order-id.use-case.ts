import { Injectable } from '@nestjs/common';

import { PaymentPrimitives } from '../../domain/entities/payment.entity';
import { PaymentRepository } from '../../domain/repositories/payment.repository';

@Injectable()
export class GetPaymentByOrderIdUseCase {
  public constructor(private readonly paymentRepository: PaymentRepository) {}

  public async execute(orderId: string): Promise<PaymentPrimitives | null> {
    const payment = await this.paymentRepository.findByOrderId(orderId);
    return payment?.toPrimitives() ?? null;
  }
}

