import { Inject, Injectable } from '@nestjs/common';

import {
  AppLogger,
  EVENT_NAMES,
  OrderCreatedEvent,
  PaymentProcessedEvent,
  ProcessingBehavior,
  RabbitMqService,
} from '@microservices/node-common';

import { Payment, PaymentPrimitives } from '../../domain/entities/payment.entity';
import { PaymentRepository } from '../../domain/repositories/payment.repository';

export const PAYMENT_LOGGER = Symbol('PAYMENT_LOGGER');

@Injectable()
export class ProcessPaymentUseCase {
  public constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly rabbitMqService: RabbitMqService,
    @Inject(PAYMENT_LOGGER) private readonly logger: AppLogger,
  ) {}

  public async execute(event: OrderCreatedEvent, retryCount: number): Promise<PaymentPrimitives> {
    const existingPayment = await this.paymentRepository.findByOrderId(event.orderId);

    if (existingPayment) {
      const payment = existingPayment.toPrimitives();

      this.logger.info('Payment already processed, returning idempotent result', {
        orderId: payment.orderId,
        paymentId: payment.id,
      });

      return payment;
    }

    this.assertProcessingBehavior(event.processingBehavior, retryCount, event.orderId);

    const payment = Payment.create({
      orderId: event.orderId,
      customerEmail: event.customerEmail,
      amount: event.amount,
      currency: event.currency,
      processingBehavior: event.processingBehavior,
    });

    await this.paymentRepository.save(payment);

    const paymentData = payment.toPrimitives();
    const paymentProcessedEvent: PaymentProcessedEvent = {
      paymentId: paymentData.id,
      orderId: paymentData.orderId,
      customerEmail: paymentData.customerEmail,
      amount: paymentData.amount,
      currency: paymentData.currency,
      status: paymentData.status,
      processingBehavior: paymentData.processingBehavior,
      processedAt: paymentData.createdAt,
    };

    await this.rabbitMqService.publishEvent(EVENT_NAMES.paymentProcessed, paymentProcessedEvent);

    this.logger.info('Payment processed', {
      orderId: paymentData.orderId,
      paymentId: paymentData.id,
    });

    return paymentData;
  }

  private assertProcessingBehavior(
    behavior: ProcessingBehavior,
    retryCount: number,
    orderId: string,
  ): void {
    if (behavior === ProcessingBehavior.PAYMENT_PERMANENT) {
      throw new Error(`Permanent payment failure configured for order ${orderId}`);
    }

    if (behavior === ProcessingBehavior.PAYMENT_TRANSIENT && retryCount < 2) {
      throw new Error(`Transient payment failure configured for order ${orderId} on retry ${retryCount}`);
    }
  }
}

