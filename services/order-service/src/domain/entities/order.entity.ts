import { randomUUID } from 'node:crypto';

import { ProcessingBehavior } from '@microservices/node-common';

export type OrderStatus = 'CREATED' | 'PAID' | 'NOTIFIED';

export interface OrderPrimitives {
  id: string;
  customerEmail: string;
  amount: number;
  currency: string;
  status: OrderStatus;
  processingBehavior: ProcessingBehavior;
  paymentId: string | null;
  notificationId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface OrderCreationProps {
  customerEmail: string;
  amount: number;
  currency: string;
  processingBehavior: ProcessingBehavior;
}

export class Order {
  public static create(props: OrderCreationProps): Order {
    const now = new Date().toISOString();

    return new Order({
      id: randomUUID(),
      customerEmail: props.customerEmail,
      amount: props.amount,
      currency: props.currency,
      status: 'CREATED',
      processingBehavior: props.processingBehavior,
      paymentId: null,
      notificationId: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  public static fromPrimitives(primitives: OrderPrimitives): Order {
    return new Order(primitives);
  }

  private constructor(private props: OrderPrimitives) {}

  public markPaid(paymentId: string): void {
    if (this.props.paymentId === paymentId && (this.props.status === 'PAID' || this.props.status === 'NOTIFIED')) {
      return;
    }

    this.props.paymentId = paymentId;
    this.props.status = 'PAID';
    this.touch();
  }

  public markNotified(notificationId: string): void {
    if (this.props.notificationId === notificationId && this.props.status === 'NOTIFIED') {
      return;
    }

    this.props.notificationId = notificationId;
    this.props.status = 'NOTIFIED';
    this.touch();
  }

  public toPrimitives(): OrderPrimitives {
    return { ...this.props };
  }

  private touch(): void {
    this.props.updatedAt = new Date().toISOString();
  }
}

