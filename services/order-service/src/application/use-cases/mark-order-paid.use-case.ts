import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { AppLogger, PaymentProcessedEvent } from '@microservices/node-common';

import { OrderRepository } from '../../domain/repositories/order.repository';
import { ORDER_LOGGER } from './create-order.use-case';

@Injectable()
export class MarkOrderPaidUseCase {
  public constructor(
    private readonly orderRepository: OrderRepository,
    @Inject(ORDER_LOGGER) private readonly logger: AppLogger,
  ) {}

  public async execute(event: PaymentProcessedEvent): Promise<void> {
    const order = await this.orderRepository.findById(event.orderId);

    if (!order) {
      throw new NotFoundException(`Order ${event.orderId} was not found`);
    }

    order.markPaid(event.paymentId);
    await this.orderRepository.save(order);

    this.logger.info('Order marked as paid', {
      orderId: event.orderId,
      paymentId: event.paymentId,
    });
  }
}

