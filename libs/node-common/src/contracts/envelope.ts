import { EventName } from './events';

export interface EventEnvelope<TPayload> {
  eventName: EventName;
  version: '1.0.0';
  occurredAt: string;
  correlationId: string;
  payload: TPayload;
}

export interface ConsumerQueueConfig {
  queueName: string;
  retryQueueName: string;
  dlqQueueName: string;
  routingKey: EventName;
  maxRetries: number;
  retryTtlMs: number;
  prefetchCount?: number;
}

export interface ConsumedMessage<TPayload> {
  envelope: EventEnvelope<TPayload>;
  retryCount: number;
}

