import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Pool } from 'pg';

import { AppLogger, RabbitMqService } from '@microservices/node-common';

import { CreateOrderUseCase, ORDER_LOGGER } from './application/use-cases/create-order.use-case';
import { GetOrderUseCase } from './application/use-cases/get-order.use-case';
import { MarkOrderNotifiedUseCase } from './application/use-cases/mark-order-notified.use-case';
import { MarkOrderPaidUseCase } from './application/use-cases/mark-order-paid.use-case';
import { OrderRepository } from './domain/repositories/order.repository';
import { NotificationSentConsumer } from './infrastructure/messaging/notification-sent.consumer';
import { PaymentProcessedConsumer } from './infrastructure/messaging/payment-processed.consumer';
import { ORDER_DB_POOL, PostgresOrderRepository } from './infrastructure/persistence/postgres-order.repository';
import { CorrelationIdMiddleware } from './presentation/http/correlation-id.middleware';
import { OrderController } from './presentation/http/order.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [OrderController],
  providers: [
    {
      provide: ORDER_LOGGER,
      useFactory: () => new AppLogger(process.env.SERVICE_NAME ?? 'order-service'),
    },
    {
      provide: ORDER_DB_POOL,
      useFactory: () =>
        new Pool({
          host: process.env.POSTGRES_HOST ?? 'localhost',
          port: Number(process.env.POSTGRES_PORT ?? 5432),
          database: process.env.POSTGRES_DB ?? 'order_db',
          user: process.env.POSTGRES_USER ?? 'postgres',
          password: process.env.POSTGRES_PASSWORD ?? 'postgres',
        }),
    },
    {
      provide: OrderRepository,
      useClass: PostgresOrderRepository,
    },
    {
      provide: RabbitMqService,
      useFactory: (logger: AppLogger) =>
        new RabbitMqService(logger, {
          url: process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672',
        }),
      inject: [ORDER_LOGGER],
    },
    CreateOrderUseCase,
    GetOrderUseCase,
    MarkOrderPaidUseCase,
    MarkOrderNotifiedUseCase,
    PaymentProcessedConsumer,
    NotificationSentConsumer,
    {
      provide: 'ORDER_SCHEMA_BOOTSTRAP',
      useFactory: async (orderRepository: OrderRepository) => {
        await orderRepository.ensureSchema();
        return true;
      },
      inject: [OrderRepository],
    },
  ],
})
export class AppModule implements NestModule {
  public configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}

