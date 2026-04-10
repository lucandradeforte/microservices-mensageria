export const EVENT_NAMES = {
  orderCreated: 'order.created',
  paymentProcessed: 'payment.processed',
  notificationSent: 'notification.sent',
} as const;

export type EventName = (typeof EVENT_NAMES)[keyof typeof EVENT_NAMES];

export enum ProcessingBehavior {
  NORMAL = 'normal',
  PAYMENT_TRANSIENT = 'payment-transient',
  PAYMENT_PERMANENT = 'payment-permanent',
  NOTIFICATION_TRANSIENT = 'notification-transient',
  NOTIFICATION_PERMANENT = 'notification-permanent',
}

export interface OrderCreatedEvent {
  orderId: string;
  customerEmail: string;
  amount: number;
  currency: string;
  processingBehavior: ProcessingBehavior;
  createdAt: string;
}

export interface PaymentProcessedEvent {
  paymentId: string;
  orderId: string;
  customerEmail: string;
  amount: number;
  currency: string;
  status: 'PROCESSED';
  processingBehavior: ProcessingBehavior;
  processedAt: string;
}

export interface NotificationSentEvent {
  notificationId: string;
  orderId: string;
  paymentId: string;
  customerEmail: string;
  channel: 'email';
  status: 'SENT';
  processingBehavior: ProcessingBehavior;
  sentAt: string;
}

