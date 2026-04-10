import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Channel, ChannelModel, ConsumeMessage, connect } from 'amqplib';

import { ConsumerQueueConfig, ConsumedMessage, EventEnvelope } from '../contracts/envelope';
import { EventName } from '../contracts/events';
import { CorrelationContext } from '../observability/correlation-context';
import { AppLogger } from '../observability/logger.service';
import { RABBITMQ_EXCHANGES } from './rabbitmq.constants';

export interface RabbitMqServiceOptions {
  url: string;
}

@Injectable()
export class RabbitMqService implements OnModuleDestroy {
  private connection?: ChannelModel;
  private publisherChannel?: Channel;

  public constructor(
    private readonly logger: AppLogger,
    private readonly options: RabbitMqServiceOptions,
  ) {}

  public async publishEvent<TPayload>(
    eventName: EventName,
    payload: TPayload,
    explicitCorrelationId?: string,
    headers?: Record<string, unknown>,
  ): Promise<void> {
    const correlationId = CorrelationContext.getOrCreateCorrelationId(explicitCorrelationId);
    const channel = await this.getPublisherChannel();
    const envelope: EventEnvelope<TPayload> = {
      eventName,
      version: '1.0.0',
      occurredAt: new Date().toISOString(),
      correlationId,
      payload,
    };

    channel.publish(
      RABBITMQ_EXCHANGES.events,
      eventName,
      Buffer.from(JSON.stringify(envelope)),
      {
        persistent: true,
        contentType: 'application/json',
        correlationId,
        messageId: `${eventName}-${Date.now()}`,
        headers: {
          'x-correlation-id': correlationId,
          ...headers,
        },
      },
    );

    this.logger.info('Published event', {
      eventName,
      exchange: RABBITMQ_EXCHANGES.events,
      routingKey: eventName,
    });
  }

  public async consume<TPayload>(
    config: ConsumerQueueConfig,
    handler: (message: ConsumedMessage<TPayload>) => Promise<void>,
  ): Promise<void> {
    const connection = await this.getConnection();
    const channel = await connection.createChannel();

    await this.assertConsumerTopology(channel, config);
    await channel.prefetch(config.prefetchCount ?? 10);

    await channel.consume(config.queueName, async (message: ConsumeMessage | null) => {
      if (!message) {
        return;
      }

      const { envelope, retryCount } = this.parseMessage<TPayload>(message);
      const correlationId = envelope.correlationId;

      await CorrelationContext.run(correlationId, async () => {
        try {
          this.logger.info('Consumed event', {
            eventName: envelope.eventName,
            queue: config.queueName,
            retryCount,
          });

          await handler({
            envelope,
            retryCount,
          });

          channel.ack(message);
        } catch (error) {
          await this.handleFailure(channel, message, envelope, config, retryCount, error);
        }
      });
    });

    this.logger.info('Consumer started', {
      queue: config.queueName,
      routingKey: config.routingKey,
    });
  }

  public async onModuleDestroy(): Promise<void> {
    await this.publisherChannel?.close();
    await this.connection?.close();
  }

  private async handleFailure<TPayload>(
    channel: Channel,
    originalMessage: ConsumeMessage,
    envelope: EventEnvelope<TPayload>,
    config: ConsumerQueueConfig,
    retryCount: number,
    error: unknown,
  ): Promise<void> {
    const nextRetryCount = retryCount + 1;
    const serializedEnvelope = Buffer.from(JSON.stringify(envelope));
    const headers = {
      'x-correlation-id': envelope.correlationId,
      'x-retry-count': nextRetryCount,
      'x-original-queue': config.queueName,
    };

    if (nextRetryCount <= config.maxRetries) {
      channel.publish(RABBITMQ_EXCHANGES.retry, config.routingKey, serializedEnvelope, {
        persistent: true,
        contentType: 'application/json',
        correlationId: envelope.correlationId,
        headers,
      });

      this.logger.warn('Message sent to retry queue', {
        queue: config.retryQueueName,
        routingKey: config.routingKey,
        retryCount: nextRetryCount,
      });
    } else {
      channel.publish(RABBITMQ_EXCHANGES.dlx, config.routingKey, serializedEnvelope, {
        persistent: true,
        contentType: 'application/json',
        correlationId: envelope.correlationId,
        headers: {
          ...headers,
          'x-error': error instanceof Error ? error.message : String(error),
        },
      });

      this.logger.error('Message sent to dead letter queue', error, {
        queue: config.dlqQueueName,
        routingKey: config.routingKey,
        retryCount,
      });
    }

    channel.ack(originalMessage);
  }

  private parseMessage<TPayload>(message: ConsumeMessage): ConsumedMessage<TPayload> {
    const envelope = JSON.parse(message.content.toString()) as EventEnvelope<TPayload>;
    const headerValue = message.properties.headers?.['x-retry-count'];
    const retryCount =
      typeof headerValue === 'number'
        ? headerValue
        : typeof headerValue === 'bigint'
          ? Number(headerValue)
          : Array.isArray(headerValue)
            ? Number(Buffer.from(headerValue).toString())
        : typeof headerValue === 'string'
          ? Number(headerValue)
          : 0;

    return {
      envelope,
      retryCount,
    };
  }

  private async assertConsumerTopology(channel: Channel, config: ConsumerQueueConfig): Promise<void> {
    await this.assertSharedTopology(channel);

    await channel.assertQueue(config.queueName, {
      durable: true,
    });
    await channel.bindQueue(config.queueName, RABBITMQ_EXCHANGES.events, config.routingKey);

    await channel.assertQueue(config.retryQueueName, {
      durable: true,
      deadLetterExchange: RABBITMQ_EXCHANGES.events,
      deadLetterRoutingKey: config.routingKey,
      messageTtl: config.retryTtlMs,
    });
    await channel.bindQueue(config.retryQueueName, RABBITMQ_EXCHANGES.retry, config.routingKey);

    await channel.assertQueue(config.dlqQueueName, {
      durable: true,
    });
    await channel.bindQueue(config.dlqQueueName, RABBITMQ_EXCHANGES.dlx, config.routingKey);
  }

  private async getPublisherChannel(): Promise<Channel> {
    if (this.publisherChannel) {
      return this.publisherChannel;
    }

    const connection = await this.getConnection();
    const channel = await connection.createChannel();
    await this.assertSharedTopology(channel);
    this.publisherChannel = channel;

    return channel;
  }

  private async getConnection(): Promise<ChannelModel> {
    if (this.connection) {
      return this.connection;
    }

    const connection = await connect(this.options.url);
    connection.on('error', (error) => {
      this.logger.error('RabbitMQ connection error', error);
    });

    connection.on('close', () => {
      this.logger.warn('RabbitMQ connection closed');
      this.connection = undefined;
      this.publisherChannel = undefined;
    });

    this.logger.info('Connected to RabbitMQ', {
      url: this.options.url,
    });

    this.connection = connection;

    return connection;
  }

  private async assertSharedTopology(channel: Channel): Promise<void> {
    await channel.assertExchange(RABBITMQ_EXCHANGES.events, 'topic', {
      durable: true,
    });
    await channel.assertExchange(RABBITMQ_EXCHANGES.retry, 'topic', {
      durable: true,
    });
    await channel.assertExchange(RABBITMQ_EXCHANGES.dlx, 'topic', {
      durable: true,
    });
  }
}
