import { Inject, Injectable } from '@nestjs/common';

import {
  AppLogger,
  EVENT_NAMES,
  OrderCreatedEvent,
  ProcessingBehavior,
  RabbitMqService,
} from '@microservices/node-common';

import { CreateOrderDto } from '../dto/create-order.dto';
import { Order, OrderPrimitives } from '../../domain/entities/order.entity';
import { OrderRepository } from '../../domain/repositories/order.repository';

export const ORDER_LOGGER = Symbol('ORDER_LOGGER');

@Injectable()
export class CreateOrderUseCase {
  public constructor(
    private readonly orderRepository: OrderRepository,
    private readonly rabbitMqService: RabbitMqService,
    @Inject(ORDER_LOGGER) private readonly logger: AppLogger,
  ) {}

  public async execute(dto: CreateOrderDto): Promise<OrderPrimitives> {
    const order = Order.create({
      customerEmail: dto.customerEmail,
      amount: dto.amount,
      currency: dto.currency,
      processingBehavior: dto.processingBehavior ?? ProcessingBehavior.NORMAL,
    });

    await this.orderRepository.save(order);

    const orderData = order.toPrimitives();
    const orderCreatedEvent: OrderCreatedEvent = {
      orderId: orderData.id,
      customerEmail: orderData.customerEmail,
      amount: orderData.amount,
      currency: orderData.currency,
      processingBehavior: orderData.processingBehavior,
      createdAt: orderData.createdAt,
    };

    await this.rabbitMqService.publishEvent(EVENT_NAMES.orderCreated, orderCreatedEvent);

    this.logger.info('Order created', {
      orderId: orderData.id,
      status: orderData.status,
    });

    return orderData;
  }
}
