import { Injectable } from '@nestjs/common';

import { OrderPrimitives } from '../../domain/entities/order.entity';
import { OrderRepository } from '../../domain/repositories/order.repository';

@Injectable()
export class GetOrderUseCase {
  public constructor(private readonly orderRepository: OrderRepository) {}

  public async execute(orderId: string): Promise<OrderPrimitives | null> {
    const order = await this.orderRepository.findById(orderId);
    return order?.toPrimitives() ?? null;
  }
}

