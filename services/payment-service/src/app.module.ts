import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Pool } from 'pg';

import { AppLogger, RabbitMqService } from '@microservices/node-common';

import { GetPaymentByOrderIdUseCase } from './application/use-cases/get-payment-by-order-id.use-case';
import { PAYMENT_LOGGER, ProcessPaymentUseCase } from './application/use-cases/process-payment.use-case';
import { PaymentRepository } from './domain/repositories/payment.repository';
import { OrderCreatedConsumer } from './infrastructure/messaging/order-created.consumer';
import { PAYMENT_DB_POOL, PostgresPaymentRepository } from './infrastructure/persistence/postgres-payment.repository';
import { CorrelationIdMiddleware } from './presentation/http/correlation-id.middleware';
import { PaymentController } from './presentation/http/payment.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [PaymentController],
  providers: [
    {
      provide: PAYMENT_LOGGER,
      useFactory: () => new AppLogger(process.env.SERVICE_NAME ?? 'payment-service'),
    },
    {
      provide: PAYMENT_DB_POOL,
      useFactory: () =>
        new Pool({
          host: process.env.POSTGRES_HOST ?? 'localhost',
          port: Number(process.env.POSTGRES_PORT ?? 5432),
          database: process.env.POSTGRES_DB ?? 'payment_db',
          user: process.env.POSTGRES_USER ?? 'postgres',
          password: process.env.POSTGRES_PASSWORD ?? 'postgres',
        }),
    },
    {
      provide: PaymentRepository,
      useClass: PostgresPaymentRepository,
    },
    {
      provide: RabbitMqService,
      useFactory: (logger: AppLogger) =>
        new RabbitMqService(logger, {
          url: process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672',
        }),
      inject: [PAYMENT_LOGGER],
    },
    GetPaymentByOrderIdUseCase,
    ProcessPaymentUseCase,
    OrderCreatedConsumer,
    {
      provide: 'PAYMENT_SCHEMA_BOOTSTRAP',
      useFactory: async (paymentRepository: PaymentRepository) => {
        await paymentRepository.ensureSchema();
        return true;
      },
      inject: [PaymentRepository],
    },
  ],
})
export class AppModule implements NestModule {
  public configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}

