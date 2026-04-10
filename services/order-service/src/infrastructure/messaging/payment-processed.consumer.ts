import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';

import {
  AppLogger,
  ConsumerQueueConfig,
  EVENT_NAMES,
  PaymentProcessedEvent,
  RabbitMqService,
} from '@microservices/node-common';

import { MarkOrderPaidUseCase } from '../../application/use-cases/mark-order-paid.use-case';
import { ORDER_LOGGER } from '../../application/use-cases/create-order.use-case';

@Injectable()
export class PaymentProcessedConsumer implements OnApplicationBootstrap {
  private readonly config: ConsumerQueueConfig = {
    queueName: 'order-service.payment-processed',
    retryQueueName: 'order-service.payment-processed.retry',
    dlqQueueName: 'order-service.payment-processed.dlq',
    routingKey: EVENT_NAMES.paymentProcessed,
    maxRetries: Number(process.env.MAX_RETRIES ?? 3),
    retryTtlMs: Number(process.env.RETRY_TTL_MS ?? 5000),
  };

  public constructor(
    private readonly rabbitMqService: RabbitMqService,
    private readonly markOrderPaidUseCase: MarkOrderPaidUseCase,
    @Inject(ORDER_LOGGER) private readonly logger: AppLogger,
  ) {}

  public async onApplicationBootstrap(): Promise<void> {
    await this.rabbitMqService.consume<PaymentProcessedEvent>(this.config, async ({ envelope }) => {
      await this.markOrderPaidUseCase.execute(envelope.payload);
    });

    this.logger.info('Payment processed consumer ready', {
      queue: this.config.queueName,
    });
  }
}

