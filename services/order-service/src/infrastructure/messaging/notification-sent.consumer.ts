import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';

import {
  AppLogger,
  ConsumerQueueConfig,
  EVENT_NAMES,
  NotificationSentEvent,
  RabbitMqService,
} from '@microservices/node-common';

import { MarkOrderNotifiedUseCase } from '../../application/use-cases/mark-order-notified.use-case';
import { ORDER_LOGGER } from '../../application/use-cases/create-order.use-case';

@Injectable()
export class NotificationSentConsumer implements OnApplicationBootstrap {
  private readonly config: ConsumerQueueConfig = {
    queueName: 'order-service.notification-sent',
    retryQueueName: 'order-service.notification-sent.retry',
    dlqQueueName: 'order-service.notification-sent.dlq',
    routingKey: EVENT_NAMES.notificationSent,
    maxRetries: Number(process.env.MAX_RETRIES ?? 3),
    retryTtlMs: Number(process.env.RETRY_TTL_MS ?? 5000),
  };

  public constructor(
    private readonly rabbitMqService: RabbitMqService,
    private readonly markOrderNotifiedUseCase: MarkOrderNotifiedUseCase,
    @Inject(ORDER_LOGGER) private readonly logger: AppLogger,
  ) {}

  public async onApplicationBootstrap(): Promise<void> {
    await this.rabbitMqService.consume<NotificationSentEvent>(this.config, async ({ envelope }) => {
      await this.markOrderNotifiedUseCase.execute(envelope.payload);
    });

    this.logger.info('Notification sent consumer ready', {
      queue: this.config.queueName,
    });
  }
}

