import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';

import {
  AppLogger,
  ConsumerQueueConfig,
  EVENT_NAMES,
  OrderCreatedEvent,
  RabbitMqService,
} from '@microservices/node-common';

import { PAYMENT_LOGGER, ProcessPaymentUseCase } from '../../application/use-cases/process-payment.use-case';

@Injectable()
export class OrderCreatedConsumer implements OnApplicationBootstrap {
  private readonly config: ConsumerQueueConfig = {
    queueName: 'payment-service.order-created',
    retryQueueName: 'payment-service.order-created.retry',
    dlqQueueName: 'payment-service.order-created.dlq',
    routingKey: EVENT_NAMES.orderCreated,
    maxRetries: Number(process.env.MAX_RETRIES ?? 3),
    retryTtlMs: Number(process.env.RETRY_TTL_MS ?? 5000),
  };

  public constructor(
    private readonly rabbitMqService: RabbitMqService,
    private readonly processPaymentUseCase: ProcessPaymentUseCase,
    @Inject(PAYMENT_LOGGER) private readonly logger: AppLogger,
  ) {}

  public async onApplicationBootstrap(): Promise<void> {
    await this.rabbitMqService.consume<OrderCreatedEvent>(this.config, async ({ envelope, retryCount }) => {
      await this.processPaymentUseCase.execute(envelope.payload, retryCount);
    });

    this.logger.info('Order created consumer ready', {
      queue: this.config.queueName,
    });
  }
}

