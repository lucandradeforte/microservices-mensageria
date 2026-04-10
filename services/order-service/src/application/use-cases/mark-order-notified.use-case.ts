import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { AppLogger, NotificationSentEvent } from '@microservices/node-common';

import { OrderRepository } from '../../domain/repositories/order.repository';
import { ORDER_LOGGER } from './create-order.use-case';

@Injectable()
export class MarkOrderNotifiedUseCase {
  public constructor(
    private readonly orderRepository: OrderRepository,
    @Inject(ORDER_LOGGER) private readonly logger: AppLogger,
  ) {}

  public async execute(event: NotificationSentEvent): Promise<void> {
    const order = await this.orderRepository.findById(event.orderId);

    if (!order) {
      throw new NotFoundException(`Order ${event.orderId} was not found`);
    }

    order.markNotified(event.notificationId);
    await this.orderRepository.save(order);

    this.logger.info('Order marked as notified', {
      orderId: event.orderId,
      notificationId: event.notificationId,
    });
  }
}

