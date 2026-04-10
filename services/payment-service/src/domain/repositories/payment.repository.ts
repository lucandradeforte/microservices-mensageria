import { Payment } from '../entities/payment.entity';

export abstract class PaymentRepository {
  public abstract ensureSchema(): Promise<void>;
  public abstract save(payment: Payment): Promise<void>;
  public abstract findByOrderId(orderId: string): Promise<Payment | null>;
}

