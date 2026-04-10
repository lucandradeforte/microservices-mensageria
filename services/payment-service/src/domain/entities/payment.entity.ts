import { randomUUID } from 'node:crypto';

import { ProcessingBehavior } from '@microservices/node-common';

export type PaymentStatus = 'PROCESSED';

export interface PaymentPrimitives {
  id: string;
  orderId: string;
  customerEmail: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  processingBehavior: ProcessingBehavior;
  createdAt: string;
  updatedAt: string;
}

interface PaymentCreationProps {
  orderId: string;
  customerEmail: string;
  amount: number;
  currency: string;
  processingBehavior: ProcessingBehavior;
}

export class Payment {
  public static create(props: PaymentCreationProps): Payment {
    const now = new Date().toISOString();

    return new Payment({
      id: randomUUID(),
      orderId: props.orderId,
      customerEmail: props.customerEmail,
      amount: props.amount,
      currency: props.currency,
      status: 'PROCESSED',
      processingBehavior: props.processingBehavior,
      createdAt: now,
      updatedAt: now,
    });
  }

  public static fromPrimitives(primitives: PaymentPrimitives): Payment {
    return new Payment(primitives);
  }

  private constructor(private props: PaymentPrimitives) {}

  public toPrimitives(): PaymentPrimitives {
    return { ...this.props };
  }
}

